import { Bot, Context, Fragment, Schema, Session } from 'koishi'

import zhCN from './locales/zh-cn.yml'

import {
  Config as SleepConfig,
  DomainEvent,
  Effect,
  mkDurationMin,
  mkSource,
  mkTimestamp,
  mkUserId,
  Phase,
  privateSource,
  SleepRecord,
  Source,
  Timestamp,
  transition,
  unTimestamp,
  unTimezone,
  unUserId,
  UserId,
} from './domain'
import {
  Either,
  fromNullable,
  isNone,
  left,
  matchW,
  none,
  Option,
  pipe,
  right,
  RTE,
  some,
} from './fp'
import { currentPeriod, decide, parseEvent, PolicyDecision, PolicyUser } from './policy'
import { DbEnv, makeSqliteRepo, RepoError, SleepRepo } from './repo'
import { renderReply, RenderEnv, ReplyPayload } from './render'
import {
  parseBedtime,
  parseTimezone,
  reportRange,
  resolveTimezone,
  summarizeRecords,
  todayRange,
  userDayKey,
  wallClock,
} from './time'

export const name = 'sleep-manage'
export const inject = ['database']

export type Config = SleepConfig

const DefaultWords = {
  morning: ['早', '早安', '早哇', '起床', '早上好', 'ohayo', '哦哈哟', 'お早う', 'good morning'],
  evening: ['晚', '晚安', '晚好', '睡觉', '晚上好', 'oyasuminasai', 'おやすみなさい', 'good evening', 'good night'],
} as const

export const Config: Schema<Config> = Schema.object({
  kuchiguse: Schema.string().default('喵').description('回复后缀（旧版 kuchiguse）'),
  gagme: Schema.boolean().default(false).description('全局默认：晚安即禁言（旧版 gagme）'),
  timezone: Schema.union([
    Schema.number().min(-12).max(12).description('UTC 偏移小时'),
    Schema.const(true).description('跟随服务器本地时区'),
  ]).default(true).description('默认时区'),
  interval: Schema.number().min(0).default(3).description('重复触发冷却窗口（小时）'),
  firstMorning: Schema.boolean().default(true).description('把每天第一条消息自动视为早安'),
  multiTrigger: Schema.number().min(1).max(114514).default(3).description('冷却窗口内最多重复响应次数'),
  gagMinutes: Schema.number().min(1).default(360).description('禁言分钟数'),
  morningSpan: Schema.tuple([
    Schema.number().min(0).max(12),
    Schema.number().min(0).max(12),
  ]).default([6, 12]).description('早安响应时间范围'),
  eveningSpan: Schema.tuple([
    Schema.number().min(12).max(23),
    Schema.number().min(0).max(23),
  ]).default([21, 3]).description('晚安响应时间范围（可跨天）'),
  morningWord: Schema.array(String).default([...DefaultWords.morning]).collapse().description('早安触发词'),
  eveningWord: Schema.array(String).default([...DefaultWords.evening]).collapse().description('晚安触发词'),
}) as unknown as Schema<Config>

type AttachUserFields =
  | 'id'
  | 'sm_timezone'
  | 'sm_bedtime'
  | 'sm_recordFirst'
  | 'sm_lastTrigger'
  | 'sm_dayKey'
  | 'sm_multiCount'
  | 'sm_gagme'
  | 'sm_gagUntil'

type MiddlewareSession = Session<AttachUserFields>

type AppError =
  | { readonly _tag: 'NO_USER' }
  | { readonly _tag: 'REPO'; readonly cause: RepoError }
  | { readonly _tag: 'SEND_FAILED'; readonly cause: unknown }
  | { readonly _tag: 'MUTE_FAILED'; readonly cause: unknown }
  | { readonly _tag: 'DB_FAILED'; readonly cause: unknown }

type AppEnv = {
  readonly repo: SleepRepo
  readonly db: DbEnv['db']
  readonly config: Config
  readonly now: () => Date
  readonly bots: readonly Bot[]
  readonly bedtimeText: () => Fragment
}

type UserPatch = {
  sm_dayKey?: string
  sm_lastTrigger?: Date
  sm_multiCount?: number
  sm_gagUntil?: Date
}

type SessionContext = {
  readonly userId: UserId
  readonly content: string
  readonly at: Timestamp
  readonly timezone: ReturnType<typeof resolveTimezone>
  readonly clock: ReturnType<typeof wallClock>
  readonly today: string
  readonly source: Source
  readonly guildId: Option<string>
  readonly policyUser: PolicyUser
  readonly isFirstToday: boolean
  readonly todaySpan: ReturnType<typeof todayRange>
}

const noUser: AppError = { _tag: 'NO_USER' }
const sendFailed = (cause: unknown): AppError => ({ _tag: 'SEND_FAILED', cause })
const muteFailed = (cause: unknown): AppError => ({ _tag: 'MUTE_FAILED', cause })
const dbFailed = (cause: unknown): AppError => ({ _tag: 'DB_FAILED', cause })
const repoFailed = (cause: RepoError): AppError => ({ _tag: 'REPO', cause })

const toParams = (args: readonly unknown[]): Record<string, unknown> =>
  Object.fromEntries(args.map((value, index) => [String(index), value]))

const pick = <A>(items: readonly A[]): A => items[Math.floor(Math.random() * items.length)]

const dbTask = <A>(thunk: (db: DbEnv['db']) => Promise<A>): RTE<AppEnv, AppError, A> =>
  RTE.tryCatch((env) => thunk(env.db), dbFailed)

const repoTask = <A>(task: RTE<DbEnv, RepoError, A>): RTE<AppEnv, AppError, A> =>
  async (env) => {
    const result = await task({ db: env.db })
    return result._tag === 'Left' ? left(repoFailed(result.left)) : right(result.right)
  }

const makeRenderEnv = (session: MiddlewareSession, config: Config): RenderEnv => ({
  i18n: (path, args) => session.i18n(path, toParams(args)),
  random: pick,
  suffix: config.kuchiguse,
})

const sendFragment = (session: MiddlewareSession) => (fragment: Fragment): RTE<AppEnv, AppError, void> =>
  RTE.tryCatch(async () => {
    await session.send(fragment)
  }, sendFailed)

export function apply(ctx: Context, config: Config, options: { now?: () => Date } = {}) {
  const getNow = () => options.now?.() ?? new Date()
  const repo = makeSqliteRepo(ctx.database)
  ctx.i18n.define('zh-CN', zhCN)
  const appEnv: AppEnv = {
    repo,
    db: ctx.database,
    config,
    now: getNow,
    bots: ctx.bots,
    bedtimeText: () => ctx.i18n.render(['zh-CN'], ['sleep.bedtimeReminder'], {}),
  }

  ctx.model.extend('user', {
    sm_timezone: 'string(5)',
    sm_bedtime: { type: 'string', length: 5, nullable: true },
    sm_recordFirst: { type: 'boolean', nullable: true },
    sm_lastTrigger: { type: 'timestamp', nullable: true },
    sm_dayKey: { type: 'string', length: 10, nullable: true },
    sm_multiCount: { type: 'unsigned', nullable: true },
    sm_gagme: { type: 'boolean', nullable: true },
    sm_gagUntil: { type: 'timestamp', nullable: true },
  })

  ctx.model.extend('sleep_record', {
    id: 'unsigned',
    userId: 'unsigned',
    sleepTime: 'timestamp',
    wakeTime: { type: 'timestamp', nullable: true },
    durationMin: { type: 'unsigned', nullable: true },
    quality: { type: 'unsigned', nullable: true },
    platform: 'string',
    from: 'string(64)',
    createdAt: 'timestamp',
  }, {
    autoInc: true,
    unique: ['id'],
  })

  ctx.model.extend('sleep_daily', {
    id: 'unsigned',
    userId: 'unsigned',
    dayKey: 'string(10)',
    reminded: 'boolean',
    createdAt: 'timestamp',
  }, {
    autoInc: true,
    unique: ['id', ['userId', 'dayKey']],
  })

  ctx.before('attach-user', (_, fields) => {
    fields.add('id')
    fields.add('sm_timezone')
    fields.add('sm_bedtime')
    fields.add('sm_recordFirst')
    fields.add('sm_lastTrigger')
    fields.add('sm_dayKey')
    fields.add('sm_multiCount')
    fields.add('sm_gagme')
    fields.add('sm_gagUntil')
  })

  const prepare = (session: MiddlewareSession, env: AppEnv): Either<AppError, SessionContext> => {
    const user = session.user
    if (!user) return left(noUser)

    const now = env.now()
    const at = mkTimestamp(now)
    const timezone = resolveTimezone(fromNullable(user.sm_timezone), env.config.timezone)
    const clock = wallClock(now, timezone)
    const today = userDayKey(now, timezone)
    const content = (session.content ?? '').trim()
    const isFirstToday = (user.sm_recordFirst ?? env.config.firstMorning) && user.sm_dayKey !== today
    const source: Source = session.isDirect
      ? privateSource
      : mkSource(`${session.platform}:${session.guildId ?? ''}`)
    const guildId: Option<string> = session.isDirect ? none : fromNullable(session.guildId)
    const policyUser: PolicyUser = {
      timezone: fromNullable(user.sm_timezone),
      lastTrigger: fromNullable(user.sm_lastTrigger),
      multiCount: Number(user.sm_multiCount ?? 0),
      dayKey: fromNullable(user.sm_dayKey),
      recordFirst: fromNullable(user.sm_recordFirst),
      gagme: fromNullable(user.sm_gagme),
      first: false,
    }

    return right({
      userId: mkUserId(user.id),
      content,
      at,
      timezone,
      clock,
      today,
      source,
      guildId,
      policyUser,
      isFirstToday,
      todaySpan: todayRange(now, timezone),
    })
  }

  const userPatchFor = (ctx: SessionContext, decision?: PolicyDecision): UserPatch => {
    const patch: UserPatch = {}
    if (ctx.isFirstToday) patch.sm_dayKey = ctx.today
    if (decision && decision.rangeOk) {
      patch.sm_lastTrigger = decision.lastTrigger
      patch.sm_multiCount = decision.multiCount
      if (decision.shouldMute && decision.allowed) {
        patch.sm_gagUntil = new Date(unTimestamp(ctx.at).getTime() + config.gagMinutes * 60_000)
      }
    }
    return patch
  }

  const savePatch = (ctx: SessionContext, decision?: PolicyDecision): RTE<AppEnv, AppError, void> => {
    const patch = userPatchFor(ctx, decision)
    if (Object.keys(patch).length === 0) return RTE.of(undefined)
    return pipe(
      dbTask((db) => db.set('user', { id: unUserId(ctx.userId) }, patch)),
      RTE.map(() => undefined),
    )
  }

  const durationTask = (
    ctx: SessionContext,
    phase: Phase,
    decision: PolicyDecision,
  ): RTE<AppEnv, AppError, Option<ReturnType<typeof mkDurationMin>>> => {
    if (!decision.allowed || decision.first) return RTE.of(none)

    const deltaMin = (from: Date): number =>
      Math.round((unTimestamp(ctx.at).getTime() - from.getTime()) / 60000)

    const fromOpen = (record: SleepRecord): Option<ReturnType<typeof mkDurationMin>> =>
      some(mkDurationMin(deltaMin(record.sleepTime)))

    const fromClosed = (record: SleepRecord): Option<ReturnType<typeof mkDurationMin>> =>
      record.wakeTime ? some(mkDurationMin(deltaMin(record.wakeTime))) : none

    const task: RTE<AppEnv, AppError, Option<ReturnType<typeof mkDurationMin>>> = matchW(decision.event, {
      MORNING_TRIGGER: () => phase._tag === 'SLEEPING'
        ? pipe(repoTask(repo.findOpen(ctx.userId)), RTE.map((open) => matchW(open, () => none, fromOpen)))
        : pipe(repoTask(repo.latestClosed(ctx.userId)), RTE.map((closed) => matchW(closed, () => none, fromClosed))),
      EVENING_TRIGGER: () => phase._tag === 'AWAKE'
        ? pipe(repoTask(repo.latestClosed(ctx.userId)), RTE.map((closed) => matchW(closed, () => none, fromClosed)))
        : RTE.of(none),
      FIRST_MESSAGE: () => phase._tag === 'SLEEPING'
        ? pipe(repoTask(repo.findOpen(ctx.userId)), RTE.map((open) => matchW(open, () => none, fromOpen)))
        : pipe(repoTask(repo.latestClosed(ctx.userId)), RTE.map((closed) => matchW(closed, () => none, fromClosed))),
      BEDTIME_REACHED: () => RTE.of(none),
    })
    return task
  }

  const rankTask = (ctx: SessionContext, phase: Phase, decision: PolicyDecision): RTE<AppEnv, AppError, Option<number>> => {
    if (!decision.allowed) return RTE.of(none)

    const selfWillCount = matchW(decision.event, {
      MORNING_TRIGGER: () => phase._tag === 'SLEEPING',
      FIRST_MESSAGE: () => phase._tag === 'SLEEPING',
      EVENING_TRIGGER: () => phase._tag === 'AWAKE',
      BEDTIME_REACHED: () => false,
    })

    return matchW(
      ctx.guildId,
      () => RTE.of(none),
      () => pipe(
        repoTask(repo.rank(ctx.source, ctx.todaySpan.start, ctx.todaySpan.end)),
        RTE.map((rank) => some(rank + (selfWillCount ? 1 : 0))),
      ),
    )
  }

  const gagUntil = (ctx: SessionContext): Timestamp =>
    mkTimestamp(new Date(unTimestamp(ctx.at).getTime() + config.gagMinutes * 60_000))

  const executeEffect = (session: MiddlewareSession, effect: Effect): RTE<AppEnv, AppError, void> =>
    matchW(effect, {
      OPEN_RECORD: ({ userId, at, from }) =>
        pipe(
          repoTask(repo.open({ userId, at, from, platform: session.platform })),
          RTE.map(() => undefined),
        ),
      CLOSE_RECORD: ({ userId, at }) =>
        pipe(
          repoTask(repo.close(userId, at)),
          RTE.map(() => undefined),
        ),
      REPLY: ({ slot, payload }) =>
        sendFragment(session)(renderReply(slot, payload)(makeRenderEnv(session, config))),
      MUTE: ({ guildId, userId, until }) =>
        RTE.tryCatch(
          (env) => session.bot.muteGuildMember(
            guildId,
            userId,
            unTimestamp(until).getTime() - env.now().getTime(),
          ),
          muteFailed,
        ),
    })

  const executeEffects = (session: MiddlewareSession, effects: readonly Effect[]): RTE<AppEnv, AppError, void> =>
    pipe(
      RTE.traverse(effects, (effect) => executeEffect(session, effect)),
      RTE.map(() => undefined),
    )

  const runEvent = (session: MiddlewareSession, ctx: SessionContext, event: DomainEvent): RTE<AppEnv, AppError, void> =>
    pipe(
      RTE.Do,
      RTE.bind('phase', () => repoTask(repo.phase(ctx.userId))),
      RTE.bind('hasHistory', () => repoTask(repo.hasRecords(ctx.userId))),
      RTE.bind('decision', ({ hasHistory }) => RTE.of(decide(
        { ...ctx.policyUser, first: !hasHistory },
        config,
        ctx.clock,
        ctx.content,
        event,
      ))),
      RTE.bind('duration', ({ phase, decision }) => durationTask(ctx, phase, decision)),
      RTE.bind('rank', ({ phase, decision }) => rankTask(ctx, phase, decision)),
      RTE.bind('result', ({ phase, decision, duration, rank }) => RTE.of(transition(
        phase,
        event,
        decision,
        {
          userId: ctx.userId,
          from: ctx.source,
          guildId: ctx.guildId,
          durationMin: duration,
          rank,
          gagUntil: gagUntil(ctx),
          muteUserId: session.userId ?? '',
        },
      ))),
      RTE.chain(({ result, decision }) => pipe(
        executeEffects(session, result.effects),
        RTE.chain(() => savePatch(ctx, decision)),
      )),
    )

  const runNoEvent = (session: MiddlewareSession, ctx: SessionContext): RTE<AppEnv, AppError, void> =>
    pipe(
      repoTask(repo.phase(ctx.userId)),
      RTE.chain((phase) => {
        if (!ctx.content || phase._tag !== 'SLEEPING') return savePatch(ctx)
        const payload: ReplyPayload = {
          period: currentPeriod(config, ctx.clock),
          first: false,
          durationMin: none,
          rank: none,
          count: 0,
        }
        return pipe(
          executeEffects(session, [{ _tag: 'REPLY', slot: 'outOfRange', payload }]),
          RTE.chain(() => savePatch(ctx)),
        )
      }),
    )

  const program = (session: MiddlewareSession): RTE<AppEnv, AppError, void> =>
    pipe(
      RTE.ask<AppEnv>(),
      RTE.chain((env) => RTE.fromEither(prepare(session, env))),
      RTE.chain((ctx) => {
        const maybeEvent = parseEvent(ctx.policyUser, config, ctx.clock, ctx.content, ctx.today, ctx.at)
        return matchW(maybeEvent, () => runNoEvent(session, ctx), (event) => runEvent(session, ctx, event))
      }),
    )

  ctx.middleware(async (session: MiddlewareSession, next) => {
    const result = await program(session)(appEnv)
    if (result._tag === 'Left') {
      ctx.logger('sleep-manage').warn('dispatch failed: %o', result.left)
    }
    return next()
  })

  const text = (session: MiddlewareSession) => (path: string, args: readonly unknown[] = []): string =>
    session.text(path, toParams(args))

  const runCommand = async <A>(task: RTE<AppEnv, AppError, A>, fallback: () => A): Promise<A> =>
    pipe(
      task,
      RTE.fold(
        (error) => {
          ctx.logger('sleep-manage').warn('command failed: %o', error)
          return fallback()
        },
        (value) => value,
      ),
    )(appEnv)

  ctx.command('sleep', '睡眠管理：设置时区/就寝时间，查看睡眠报告')

  ctx.command('sleep.timezone <timezone:string>', '设置你的时区（+8、-5、LOCAL 或 UTC）')
    .userFields(['id', 'sm_timezone'])
    .action(async ({ session }, raw) => {
      const s = session as MiddlewareSession
      const t = text(s)
      return await runCommand(
        matchW(
          parseTimezone(raw),
          () => RTE.of(t('sleep.timezone.invalid')),
          (timezone) => pipe(
            dbTask((db) => db.set('user', { id: s.user!.id }, { sm_timezone: unTimezone(timezone) })),
            RTE.map(() => {
              s.user!.sm_timezone = unTimezone(timezone)
              return t('sleep.timezone.done', [unTimezone(timezone)])
            }),
          ),
        ),
        () => t('sleep.timezone.invalid'),
      )
    })

  ctx.command('sleep.sleep [time]', '设置就寝时间（HH:mm），到点后会提醒你睡觉')
    .userFields(['id', 'sm_bedtime'])
    .action(async ({ session }, time) => {
      const s = session as MiddlewareSession
      const t = text(s)
      const task: RTE<AppEnv, AppError, string> = time
        ? matchW(
          parseBedtime(time),
          () => RTE.of(t('sleep.sleep.invalid')),
          () => pipe(
            dbTask((db) => db.set('user', { id: s.user!.id }, { sm_bedtime: time })),
            RTE.map(() => {
              s.user!.sm_bedtime = time
              return t('sleep.sleep.ok', [time])
            }),
          ),
        )
        : RTE.of(s.user!.sm_bedtime
          ? t('sleep.sleep.current', [s.user!.sm_bedtime])
          : t('sleep.sleep.current', [t('sleep.sleep.none')]))
      return await runCommand(task, () => t('sleep.sleep.invalid'))
    })

  ctx.command('sleep.auto', '切换「每天第一条消息自动视为早安」')
    .userFields(['id', 'sm_recordFirst'])
    .action(async ({ session }) => {
      const s = session as MiddlewareSession
      const t = text(s)
      const next = !(s.user!.sm_recordFirst ?? config.firstMorning)
      return await runCommand(
        pipe(
          dbTask((db) => db.set('user', { id: s.user!.id }, { sm_recordFirst: next })),
          RTE.map(() => {
            s.user!.sm_recordFirst = next
            return t(next ? 'sleep.auto.on' : 'sleep.auto.off')
          }),
        ),
        () => t('sleep.auto.off'),
      )
    })

  ctx.command('sleep.gagme', '切换个人禁言（旧版 gagme）')
    .option('on', '-o')
    .option('off', '-x')
    .userFields(['id', 'sm_gagme'])
    .action(async ({ session, options }) => {
      const s = session as MiddlewareSession
      const t = text(s)
      const current = s.user!.sm_gagme ?? config.gagme
      const opts = options ?? {}
      const next = opts.on ? true : opts.off ? false : !current
      return await runCommand(
        pipe(
          dbTask((db) => db.set('user', { id: s.user!.id }, { sm_gagme: next })),
          RTE.map(() => {
            s.user!.sm_gagme = next
            return t(next ? 'sleep.gagme.on' : 'sleep.gagme.off')
          }),
        ),
        () => t('sleep.gagme.off'),
      )
    })

  ctx.guild().command('sleep.rank', '查看本群今日早起/早睡排行')
    .userFields(['id', 'sm_timezone'])
    .action(async ({ session }) => {
      const s = session as MiddlewareSession
      const t = text(s)
      if (!s.guildId) return t('sleep.rank.guildOnly')
      const timezone = resolveTimezone(fromNullable(s.user!.sm_timezone), config.timezone)
      const now = getNow()
      const period = currentPeriod(config, wallClock(now, timezone))
      const { start, end } = todayRange(now, timezone)
      const from = mkSource(`${s.platform}:${s.guildId}`)
      return await runCommand(
        pipe(
          repoTask(repo.rank(from, start, end)),
          RTE.map((rank) => t(`sleep.${period}.rank`, [rank])),
        ),
        () => t('sleep.rank.guildOnly'),
      )
    })

  const reportCommand = (kind: 'week' | 'month' | 'year') =>
    ctx.command(`sleep.${kind}`, `查看${kind === 'week' ? '本周' : kind === 'month' ? '本月' : '今年'}睡眠报告`)
      .userFields(['id', 'sm_timezone'])
      .action(async ({ session }) => {
        const s = session as MiddlewareSession
        const t = text(s)
        const timezone = resolveTimezone(fromNullable(s.user!.sm_timezone), config.timezone)
        const { start, end } = reportRange(kind, getNow(), timezone)
        return await runCommand(
          pipe(
            repoTask(repo.recordsInRange(mkUserId(s.user!.id), start, end)),
            RTE.map((records) => matchW(
              summarizeRecords(records, timezone),
              () => t('sleep.report.empty'),
              (summary) => t(`sleep.report.${kind}`, [
                summary.count,
                summary.days,
                summary.durationHour,
                summary.durationMinute,
                summary.sleepClock,
                summary.wakeClock,
              ]),
            )),
          ),
          () => t('sleep.report.empty'),
        )
      })

  reportCommand('week')
  reportCommand('month')
  reportCommand('year')

  const reminderProgram = (): RTE<AppEnv, AppError, void> =>
    pipe(
      RTE.ask<AppEnv>(),
      RTE.chain((env) => pipe(
        dbTask((db) => db.get('user', (row) => (row.sm_bedtime !== null) as never)),
        RTE.chain((users) => RTE.traverse(users, (user) => {
          const now = env.now()
          const timezone = resolveTimezone(fromNullable(user.sm_timezone), env.config.timezone)
          const clock = wallClock(now, timezone)
          const bedtime = parseBedtime(user.sm_bedtime ?? '')
          if (isNone(bedtime)) return RTE.of(undefined)
          if (bedtime.value.minutes !== clock.minutes) return RTE.of(undefined)

          const dayKey = userDayKey(now, timezone)
          const userId = mkUserId(user.id)

          return pipe(
            repoTask(env.repo.findOpen(userId)),
            RTE.chain((open) => open._tag === 'Some'
              ? RTE.of(undefined)
              : pipe(
                repoTask(env.repo.getDailyReminder(userId, dayKey)),
                RTE.chain((reminded) => reminded
                  ? RTE.of(undefined)
                  : pipe(
                    repoTask(env.repo.saveDailyReminder(userId, dayKey)),
                    RTE.chain(() => dbTask((db) => db.get('binding', { aid: user.id }))),
                    RTE.chain((bindings) => RTE.traverse(bindings, (binding) => {
                      const bot = env.bots.find((item) => item.platform === binding.platform)
                      if (!bot) return RTE.of(undefined)
                      return RTE.tryCatch(() => bot.sendPrivateMessage(binding.pid, env.bedtimeText()), sendFailed)
                    })),
                    RTE.map(() => undefined),
                  )),
              )),
          )
        })),
        RTE.map(() => undefined),
      )),
    )

  ctx.setInterval(async () => {
    await pipe(
      reminderProgram(),
      RTE.fold(
        (error) => {
          ctx.logger('sleep-manage').warn('reminder failed: %o', error)
        },
        () => {},
      ),
    )(appEnv)
  }, 60_000)

}
