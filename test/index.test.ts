import assert from 'node:assert/strict'
import test from 'node:test'

import SqliteDriver from '@minatojs/driver-sqlite'
import { Context } from 'cordis'
import { Database } from 'minato'

import { apply, Config } from '../src'

class MockCommand {
  actions: Function[] = []
  fields: string[] = []
  options: Record<string, unknown> = {}

  constructor(public def: string, public desc: string) {}

  userFields(fields: string[]) {
    this.fields = fields
    return this
  }

  option(name: string, decl: string) {
    this.options[name] = decl
    return this
  }

  action(fn: Function) {
    this.actions.push(fn)
    return this
  }

  async run(argv: Record<string, unknown> = {}, ...args: unknown[]) {
    const action = this.actions[this.actions.length - 1]
    return action({ ...argv, name: this.def, options: argv.options ?? {} }, ...args)
  }
}

const i18nText = (path: string, params: Record<string, unknown> = {}): string => {
  const arg = (index: number) => String(params[index] ?? '')
  switch (path) {
    case 'sleep.morning.frist': return '早安！第一次记录'
    case 'sleep.morning.reply': return '早安'
    case 'sleep.morning.timer': return `睡眠 ${arg(0)}:${arg(1)}:${arg(2)}`
    case 'sleep.morning.rank': return `第 ${arg(0)} 个起床`
    case 'sleep.morning.outOfRange': return '说晚安了就别玩手机啦'
    case 'sleep.evening.frist': return '晚安！第一次记录'
    case 'sleep.evening.reply': return '晚安'
    case 'sleep.evening.count': return `这是你第 ${arg(0)} 次说晚安了`
    case 'sleep.evening.rank': return `第 ${arg(0)} 个入睡`
    case 'sleep.evening.outOfRange': return '说晚安了就别玩手机啦'
    case 'sleep.evening-gag.frist': return '晚安！第一次记录，口球已送达'
    case 'sleep.evening-gag.reply': return '晚安喵，口球已送达'
    case 'sleep.evening-gag.timer': return `清醒 ${arg(0)}:${arg(1)}:${arg(2)}`
    case 'sleep.evening-gag.rank': return `第 ${arg(0)} 个入睡`
    default: return path
  }
}

const flatten = (fragment: unknown): string[] =>
  Array.isArray(fragment)
    ? fragment.flatMap((item) => flatten(item))
    : [String(fragment)]

type TestTables = {
  user: {
    id?: number
    sm_timezone?: string
    sm_bedtime?: string
    sm_recordFirst?: boolean
    sm_lastTrigger?: Date
    sm_dayKey?: string
    sm_multiCount?: number
    sm_gagme?: boolean
    sm_gagUntil?: Date
  }
  binding: {
    id?: number
    aid: number
    bid: number
    pid: string
    platform: string
  }
  sleep_record: {
    id?: number
    userId: number
    sleepTime: Date
    wakeTime?: Date | null
    durationMin?: number | null
    quality?: number | null
    platform: string
    from: string
    createdAt: Date
  }
  sleep_daily: {
    id?: number
    userId: number
    dayKey: string
    reminded: boolean
    createdAt: Date
  }
}

const setup = async (config: Partial<Config> = {}, now: () => Date = () => new Date('2026-01-01T14:00:00.000Z')) => {
  const cordis = new Context()
  const db = new Database<TestTables>(cordis)
  ;(cordis as any).model = db

  const driver = new SqliteDriver(cordis as any, { path: ':memory:' })
  await driver.start()
  ;(cordis as any).set('database', { _driver: driver })

  db.extend('user', { id: 'unsigned' }, { autoInc: true, unique: ['id'] })
  db.extend('binding', {
    id: 'unsigned',
    aid: 'unsigned',
    bid: 'unsigned',
    pid: 'string',
    platform: 'string',
  }, { autoInc: true, unique: ['id'] })

  await db.upsert('user', [{ id: 1 }], ['id'])
  await db.create('binding', { aid: 1, bid: 1, pid: 'p1', platform: 'test' })

  const commands = new Map<string, MockCommand>()
  const middleware: Array<(session: any, next: () => Promise<any>) => Promise<any>> = []
  const beforeHooks: Record<string, Function[]> = {}
  const intervals: Array<{ fn: Function; ms: number }> = []
  const muteCalls: Array<[string, string, number]> = []
  const defined: Record<string, Record<string, unknown>> = {}
  const bots = [{
    platform: 'test',
    sent: [] as string[],
    sendPrivateMessage: async (pid: string, message: unknown) => {
      bots[0].sent.push(`${pid}:${flatten(message).join('')}`)
      return []
    },
  }]

  const ctx: any = {
    database: db,
    model: {
      extend: (name: string, fields: any, options?: any) => (db as any).extend(name, fields, options),
    },
    before: (name: string, cb: Function) => {
      (beforeHooks[name] ??= []).push(cb)
      return ctx
    },
    middleware: (cb: any) => {
      middleware.push(cb)
      return ctx
    },
    command: (def: string, desc: string) => {
      const cmd = new MockCommand(def, desc)
      commands.set(def.split(/\s+/)[0], cmd)
      return cmd
    },
    guild: () => ctx,
    setInterval: (fn: Function, ms: number) => {
      intervals.push({ fn, ms })
      return {}
    },
    i18n: {
      define: (locale: string, data: Record<string, unknown>) => {
        defined[locale] = data
      },
      render: (_locales: string[], paths: string[]) => ['该睡了'],
    },
    logger: () => ({ warn: () => {} }),
    bots,
  }

  const fullConfig: Config = {
    kuchiguse: '喵',
    gagme: false,
    timezone: true,
    interval: 0,
    firstMorning: true,
    multiTrigger: 3,
    gagMinutes: 360,
    morningSpan: [6, 12],
    eveningSpan: [21, 3],
    morningWord: ['早安'],
    eveningWord: ['晚安'],
    ...config,
  }

  apply(ctx as any, fullConfig, { now })

  const reloadUser = async (): Promise<any> => ({
    ...(await db.get('user', { id: 1 }))[0],
    id: 1,
    sm_timezone: '+8',
  })

  const runMiddleware = async (user: any, content: string, guildId?: string) => {
    const sent: string[] = []
    let nextCalled = false
    const session: any = {
      content,
      user,
      platform: 'test',
      userId: 'u1',
      guildId,
      isDirect: guildId === undefined,
      bot: {
        muteGuildMember: async (guild: string, userId: string, duration: number) => {
          muteCalls.push([guild, userId, duration])
        },
      },
      send: async (message: unknown) => {
        sent.push(flatten(message).join(''))
        return []
      },
      i18n: (path: string, params: Record<string, unknown> = {}) => [i18nText(path, params)],
      text: (path: string, params: Record<string, unknown> = {}) =>
        `${path}${Object.keys(params).length ? ' ' + Object.values(params).join(',') : ''}`,
    }
    await middleware[0](session, async () => {
      nextCalled = true
      return 'next'
    })
    return { sent, nextCalled }
  }

  const makeSession = (user: any) => ({
    user,
    guildId: 'g1',
    platform: 'test',
    text: (path: string, params: Record<string, unknown> = {}) =>
      `${path}${Object.keys(params).length ? ' ' + Object.values(params).join(',') : ''}`,
  })

  return {
    ctx,
    db,
    driver,
    bots,
    commands,
    middleware,
    beforeHooks,
    intervals,
    muteCalls,
    defined,
    config: fullConfig,
    runMiddleware,
    reloadUser,
    makeSession,
  }
}

test('apply 注册 attach-user 字段', async () => {
  const { beforeHooks, driver } = await setup()
  try {
    const fields = new Set<string>()
    beforeHooks['attach-user'][0]({}, fields)
    for (const key of ['id', 'sm_timezone', 'sm_bedtime', 'sm_recordFirst', 'sm_lastTrigger', 'sm_dayKey', 'sm_multiCount', 'sm_gagme', 'sm_gagUntil']) {
      assert.ok(fields.has(key), `attach-user 应包含 ${key}`)
    }
  } finally {
    await driver.stop()
  }
})

test('apply 通过 ctx.i18n.define 注册 zh-CN 回复槽位', async () => {
  const { defined, driver } = await setup()
  try {
    const sleep = defined['zh-CN']?.sleep as any
    assert.ok(sleep, '应注册 zh-CN locale')
    assert.ok(sleep.evening.frist, 'sleep.evening.frist 必须存在')
    assert.ok(sleep.evening.count, 'sleep.evening.count 必须存在')
    assert.ok(sleep.morning.timer, 'sleep.morning.timer 必须存在')
    assert.ok(sleep.bedtimeReminder, 'sleep.bedtimeReminder 必须存在')
  } finally {
    await driver.stop()
  }
})

test('中间件：晚安 frist 开记录 → 早安 normal + timer + rank 闭合', async () => {
  let current = new Date('2026-01-01T14:00:00.000Z') 
  const { db, driver, runMiddleware, reloadUser } = await setup({ interval: 3 }, () => current)
  try {
    const evening = await runMiddleware(await reloadUser(), '晚安', 'g1')
    assert.deepEqual(evening.sent, ['晚安！第一次记录喵'])
    assert.equal(evening.nextCalled, true)

    let records = await db.get('sleep_record', { userId: 1 })
    assert.equal(records.length, 1)
    assert.equal(records[0].wakeTime, null)
    assert.equal(records[0].from, 'test:g1')

    current = new Date('2026-01-01T23:00:00.000Z') 
    const morning = await runMiddleware(await reloadUser(), '早安', 'g1')
    assert.deepEqual(morning.sent, ['早安睡眠 09:00:00第 1 个起床喵'])
    assert.equal(morning.nextCalled, true)

    records = await db.get('sleep_record', { userId: 1 })
    assert.equal(records.length, 1)
    assert.ok(records[0].wakeTime)
    assert.equal(records[0].durationMin, 540)
  } finally {
    await driver.stop()
  }
})

test('中间件：冷却窗内重复晚安 → count 文案“第 2 次说晚安了”', async () => {
  const current = new Date('2026-01-01T14:00:00.000Z') 
  const { db, driver, runMiddleware, reloadUser } = await setup({ interval: 1, multiTrigger: 3 }, () => current)
  try {
    const first = await runMiddleware(await reloadUser(), '晚安', 'g1')
    assert.deepEqual(first.sent, ['晚安！第一次记录喵'])

    const second = await runMiddleware(await reloadUser(), '晚安', 'g1')
    assert.deepEqual(second.sent, ['这是你第 2 次说晚安了喵'])
    assert.equal((await db.get('sleep_record', { userId: 1 })).length, 1)
  } finally {
    await driver.stop()
  }
})

test('中间件：gagme 开启后晚安 → eveningGag + mock 禁言 + sm_gagUntil', async () => {
  const current = new Date('2026-01-01T14:00:00.000Z') 
  const { db, driver, muteCalls, runMiddleware, reloadUser, commands, makeSession } = await setup({ interval: 3 }, () => current)
  try {
    const on = await commands.get('sleep.gagme')!.run({ session: makeSession({ id: 1, sm_gagme: undefined }), options: { on: true } })
    assert.equal(on, 'sleep.gagme.on')

    const evening = await runMiddleware(await reloadUser(), '晚安', 'g1')
    assert.deepEqual(evening.sent, ['晚安！第一次记录，口球已送达喵'])
    assert.equal(muteCalls.length, 1)
    assert.deepEqual(muteCalls[0].slice(0, 2), ['g1', 'u1'])
    assert.equal(muteCalls[0][2], 360 * 60_000)

    const users = await db.get('user', { id: 1 })
    assert.ok(users[0].sm_gagUntil)
  } finally {
    await driver.stop()
  }
})

test('中间件：晚安后仍说话 → outOfRange', async () => {
  const current = new Date('2026-01-01T14:00:00.000Z') 
  const { driver, runMiddleware, reloadUser } = await setup({ interval: 3 }, () => current)
  try {
    await runMiddleware(await reloadUser(), '晚安', 'g1')
    const chatter = await runMiddleware(await reloadUser(), '在吗在吗', 'g1')
    assert.deepEqual(chatter.sent, ['说晚安了就别玩手机啦喵'])
    assert.equal(chatter.nextCalled, true)
  } finally {
    await driver.stop()
  }
})

test('中间件：触发词在时间窗外不响应', async () => {
  const now = new Date('2026-01-01T14:00:00.000Z') 
  const { db, driver, runMiddleware } = await setup({}, () => now)
  try {
    const result = await runMiddleware({ id: 1, sm_timezone: '+8' }, '早安')
    assert.deepEqual(result.sent, [])
    assert.equal(result.nextCalled, true)
    assert.equal((await db.get('sleep_record', { userId: 1 })).length, 0)
  } finally {
    await driver.stop()
  }
})

test('中间件：recordFirst 把每天第一条消息视为早安', async () => {
  const now = new Date('2026-01-01T23:00:00.000Z') 
  const { db, driver, runMiddleware } = await setup({ firstMorning: true }, () => now)
  try {
    const result = await runMiddleware({ id: 1, sm_timezone: '+8' }, '今天天气不错')
    assert.deepEqual(result.sent, ['早安！第一次记录喵'])

    const users = await db.get('user', { id: 1 })
    assert.equal(users[0].sm_dayKey, '2026-01-02')

    const second = await runMiddleware({ ...users[0], id: 1, sm_timezone: '+8' }, '再来一句')
    assert.deepEqual(second.sent, [])
  } finally {
    await driver.stop()
  }
})

test('指令：sleep.timezone / sleep.sleep / sleep.auto', async () => {
  const { commands, driver, makeSession } = await setup()
  try {
    const timezoneSession = makeSession({ id: 1, sm_timezone: '' })
    assert.equal(await commands.get('sleep.timezone')!.run({ session: timezoneSession }, '+8'), 'sleep.timezone.done +8')
    assert.equal(timezoneSession.user.sm_timezone, '+8')
    assert.equal(await commands.get('sleep.timezone')!.run({ session: makeSession({ id: 1, sm_timezone: '' }) }, '8'), 'sleep.timezone.invalid')

    const sleepSession = makeSession({ id: 1, sm_bedtime: '' })
    assert.equal(await commands.get('sleep.sleep')!.run({ session: sleepSession }, '23:00'), 'sleep.sleep.ok 23:00')
    assert.equal(sleepSession.user.sm_bedtime, '23:00')
    assert.equal(await commands.get('sleep.sleep')!.run({ session: sleepSession }, undefined), 'sleep.sleep.current 23:00')
    assert.equal(await commands.get('sleep.sleep')!.run({ session: makeSession({ id: 1, sm_bedtime: '' }) }, '25:00'), 'sleep.sleep.invalid')

    const autoSession = makeSession({ id: 1, sm_recordFirst: undefined })
    assert.equal(await commands.get('sleep.auto')!.run({ session: autoSession }), 'sleep.auto.off')
    assert.equal(autoSession.user.sm_recordFirst, false)
    assert.equal(await commands.get('sleep.auto')!.run({ session: autoSession }), 'sleep.auto.on')
    assert.equal(autoSession.user.sm_recordFirst, true)
  } finally {
    await driver.stop()
  }
})

test('指令：sleep.gagme -o / -x 切换个人开关', async () => {
  const { commands, driver, makeSession } = await setup()
  try {
    const session = makeSession({ id: 1, sm_gagme: undefined })
    assert.equal(await commands.get('sleep.gagme')!.run({ session, options: { on: true } }), 'sleep.gagme.on')
    assert.equal(session.user.sm_gagme, true)
    assert.equal(await commands.get('sleep.gagme')!.run({ session, options: { off: true } }), 'sleep.gagme.off')
    assert.equal(session.user.sm_gagme, false)
  } finally {
    await driver.stop()
  }
})

test('指令：sleep.rank 统计本群今日记录', async () => {
  const now = new Date('2026-01-01T14:00:00.000Z') 
  const { db, commands, driver, makeSession } = await setup({}, () => now)
  try {
    await db.create('sleep_record', {
      userId: 2,
      sleepTime: new Date('2026-01-01T13:00:00.000Z'),
      wakeTime: null,
      durationMin: null,
      quality: null,
      platform: 'test',
      from: 'test:g1',
      createdAt: new Date('2026-01-01T13:00:00.000Z'),
    })

    const session = makeSession({ id: 1, sm_timezone: '+8' })
    session.guildId = 'g1'
    assert.equal(await commands.get('sleep.rank')!.run({ session }), 'sleep.evening.rank 1')
  } finally {
    await driver.stop()
  }
})

test('指令：sleep.week/month/year 报表', async () => {
  const now = new Date('2026-01-15T00:00:00.000Z') 
  const { db, commands, driver, makeSession } = await setup({}, () => now)
  try {
    const closed = {
      userId: 1,
      sleepTime: new Date('2026-01-14T14:00:00.000Z'),
      wakeTime: new Date('2026-01-14T22:00:00.000Z'),
      durationMin: 480,
      quality: null,
      platform: 'test',
      from: 'test:g1',
      createdAt: new Date('2026-01-14T14:00:00.000Z'),
    }
    await db.create('sleep_record', closed)

    const session = makeSession({ id: 1, sm_timezone: '+8' })
    assert.match(String(await commands.get('sleep.week')!.run({ session })), /^sleep\.report\.week /)
    assert.match(String(await commands.get('sleep.month')!.run({ session })), /^sleep\.report\.month /)
    assert.match(String(await commands.get('sleep.year')!.run({ session })), /^sleep\.report\.year /)
  } finally {
    await driver.stop()
  }
})

test('定时器：睡前提醒每分钟注册，且到点只提醒一次', async () => {
  const now = new Date('2026-01-01T14:00:00.000Z') 
  const { db, bots, driver, intervals } = await setup({}, () => now)
  try {
    assert.equal(intervals.length, 1)
    assert.equal(intervals[0].ms, 60_000)

    await db.set('user', { id: 1 }, { sm_bedtime: '22:00', sm_timezone: '+8' })
    await intervals[0].fn()
    assert.deepEqual(bots[0].sent, ['p1:该睡了'])

    await intervals[0].fn()
    assert.deepEqual(bots[0].sent, ['p1:该睡了'], '同一天只提醒一次')

    const dailies = await db.get('sleep_daily', { userId: 1 })
    assert.equal(dailies.length, 1)
    assert.equal(dailies[0].dayKey, '2026-01-01')
  } finally {
    await driver.stop()
  }
})

test('匿名用户：中间件不崩溃并继续 next', async () => {
  const { driver, runMiddleware } = await setup()
  try {
    const result = await runMiddleware(undefined, '晚安', 'g1')
    assert.deepEqual(result.sent, [])
    assert.equal(result.nextCalled, true)
  } finally {
    await driver.stop()
  }
})
