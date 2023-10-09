import { $, Context, Element, Keys, Schema, Session, observe } from 'koishi'
import { } from '@koishijs/plugin-help'
import * as Commander from './command'
import { Period, SleepManage } from './types'


export const usage = `
<style>
@keyframes rot {
  0% {
    transform: rotateZ(0deg);
  }
  100% {
    transform: rotateZ(360deg);
  }
}

.rotationStar {
  display: inline-block;
  animation: rot 3.5s linear infinite;
  opacity: 1;
  transition: 1.5s cubic-bezier(0.4, 0, 1, 1);
}
.rotationStar:hover {
  opacity: 0;
  transition: 0.35s cubic-bezier(0.4, 0, 1, 1);
}
</style>

## 插件说明喵

主人好喵~ 你可以在我存在的任何地方跟我说“早安”或“晚安”来记录你的作息哦~

请注意下列时间设置是24小时制哦

然后没有什么要说明的了~<span class="rotationStar">⭐</span>
`

export const name = 'sleep-manage'

export const using = ['database']

const reduceDay = (time: number) => time - 86400000

export function apply(ctx: Context, config: SleepManage.Config) {
  const logger = ctx.logger('sleep-manage')

  ctx.i18n.define('zh', require('./locales/zh-cn'))
  //#region Database
  ctx.model.extend('user', {
    timezone: 'integer(2)',
    eveningCount: 'integer(2)',
    sleeping: { type: 'boolean', initial: false },
  })
  ctx.model.extend('sleep_manage_v2', {
    id: 'unsigned',
    uid: 'unsigned',
    messageAt: 'integer(14)',
    from: 'string(32)'
  }, { autoInc: true })

  ctx.before('attach-user', ({ }, filters) => {
    filters
      .add('id')
      .add(SleepManage.User.TimeZone)
      .add(SleepManage.User.EveningCount)
      .add(SleepManage.User.Sleeping)
  })

  ctx.before('attach', async (session: Session<'id' | SleepManage.User.TimeZone, 'guildId' | 'platform'>) => {
    const { id: uid } = session.user
    const timezone = session.user[SleepManage.User.TimeZone] || new Date().getTimezoneOffset() / -60
    session.sleepField = observe<SleepManage.Fields, void>({
      uid,
      from: `${session.isDirect ? 'private' : session.guild.platform}:${session.guild.guildId || session.user.id}`,
      save: false
    }, ({ save, uid, time, from }) => {
      if (save) {
        ctx.database.create('sleep_manage_v2', {
          uid,
          messageAt: time,
          from
        }).then(() => {
          logger.debug('saved: ', uid, time)
        }).catch(e => {
          logger.error('Error: ', e)
        })
      }
    })
  })
  //#endregion

  if (config.command) ctx.plugin(Commander, config)

  function getData(uid: number, start: number, end: number): Promise<Pick<SleepManage.Database, Keys<SleepManage.Database, any>>[]> {
    return ctx.database.get('sleep_manage_v2', {
      uid,
      messageAt: { $gte: start, $lte: end }
    })
  }

  function text(period: Period, path: string, args?: any[]): Element {
    return <p>
      <i18n path={`sleep.${period}.${path}`}>
        {[
          config.kuchiguse,
          ...args
        ]}
      </i18n>
    </p>
  }

  ctx.middleware(async (session: Session<SleepManage.User | 'id'>, next) => {
    let period: Period
    let calcTime: number = -1
    let rank: number = -1

    const { content, isDirect, platform, guildId } = session
    const nowTime = new Date().getTime() + (config.timezone === true ? new Date().getTimezoneOffset() * 60000 : config.timezone * 3600000)
    const morningStartTime = genUTCHours(nowTime, this.config.morningSpan[0])
    const morningEndTime = genUTCHours(nowTime, this.config.morningSpan[1])
    const eveningStartTime = genUTCHours(nowTime, this.config.eveningSpan[0])
    const eveningEndTime = genUTCHours(nowTime, this.config.eveningSpan[1]) + (Math.abs(this.config.eveningSpan[0] - (this.config.eveningSpan[1] + 24)) < 24 ? 86400000 : 0)
    const startTime = morningStartTime
    const endTime = eveningEndTime
    const userLoggerBefore: SleepManage.Database[] = await getData(session.user.id, reduceDay(startTime), reduceDay(endTime))
    const userLoggerToDay: SleepManage.Database[] = await getData(session.user.id, startTime, endTime)
    const guildRank = isDirect ? -1 : await ctx.database.select('sleep_manage_v2', {
      messageAt: { $gte: startTime, $lte: endTime },
      from: `${platform}:${guildId}`
    }).execute(row => $.count(row.id))
    const first = userLoggerBefore.length <= 0

    if (nowTime >= morningStartTime && nowTime <= morningEndTime) {
      if (this.config.morningPet.includes(content) || (this.config.autoMorning && session.user.sleeping)) {
        period = 'morning'
        session.user.sleeping = false
      }
    } else if (nowTime >= eveningStartTime && nowTime <= eveningEndTime) {
      if (this.config.eveningPet.includes(content)) {
        period = 'evening'
        session.user.sleeping = true
        session.user.eveningCount++
      }
    } else {
      // TODO
      return next()
    }

    // 记录本次早/晚安
    session.sleepField.time = nowTime
    session.sleepField.save = true

    if (period === 'morning') {
      const lastEveningTimes = userLoggerBefore
        .filter(v => v.messageAt >= reduceDay(eveningStartTime) && v.messageAt <= reduceDay(eveningEndTime))
        .sort((a, b) => b.messageAt - a.messageAt)
      if (lastEveningTimes[0].messageAt >= reduceDay(eveningStartTime) && lastEveningTimes[0].messageAt <= reduceDay(eveningEndTime)) {
        calcTime = nowTime - lastEveningTimes[0].messageAt
      }
    }

    if (period === 'evening') {
      if (userLoggerToDay.length > 0) {
        calcTime = nowTime - userLoggerToDay[0].messageAt
      }
    }

    if (userLoggerToDay.length > 0) {
      calcTime = nowTime - userLoggerToDay[0].messageAt
    } else {
      calcTime = nowTime - userLoggerBefore[userLoggerBefore.length - 1].messageAt
    }

    return <message>{
      first
        ? <text period={period} path={'first'}></text>
        : <>
          <text period={period} path={'reply'}></text>
          <text period={period} path={'timer'} args={timerFormat(calcTime, true)}></text>
          {isDirect ?? <text period={period} path={'rank'} args={[rank]}></text>}
        </>
    }</message>
  })

  ctx.middleware(async ({ sleepField }) => {
    sleepField.$update()
  })
}

/** time(123456) to HH:MM:SS or [HH, MM, SS] */
function timerFormat(time: number, tuple?: boolean): string | [string, string, string] {
  const t = (n: number) => Math.trunc(n)
  const S = t((time % (1000 * 60)) / 1000)
  const M = t((time % (1000 * 60 * 60)) / (1000 * 60))
  const H = t((time % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const T = [H, M, S].map(v => (`${v}`.length === 1 ? `0${v}` : v).toString()) as [string, string, string]
  return tuple ? T : T.join(':')
}

function genUTCHours(now: number, hh: number, mm: number = 0, ss: number = 0): number {
  return new Date(now).setUTCHours(hh, mm, ss, 0)
}
export const Config: Schema<SleepManage.Config> = Schema.object({
  kuchiguse: Schema.string().default('喵').description('谜之声Poi~'),
  command: Schema.boolean().default(false).description('是否启用指令喵').hidden(),
  timezone: Schema.union([
    Schema.number().min(-12).max(12).description('自定义喵'),
    Schema.const(true).description('使用用户本机时区'),
  ]).default(true).description('时区喵'),
  interval: Schema.number().min(0).max(6).default(3).description('在这个时长内都是重复的喵'),
  morning: Schema.boolean().default(true).description('将早安时间内的第一条消息视为早安'),
  toomany: Schema.number().min(3).max(114514).default(3).description('真的重复晚安太多了喵，要骂人了喵！'),
  morningSpan: Schema.tuple([Schema.number().min(0).max(12), Schema.number().min(0).max(12)]).default([6, 12]).description('早安 响应时间范围喵'),
  eveningSpan: Schema.tuple([Schema.number().min(12).max(23), Schema.number().min(0).max(23)]).default([21, 3]).description('晚安 响应时间范围喵'),
  morningPet: Schema.array(String).default(['早', '早安', '早哇', '起床', '早上好', 'ohayo', '哦哈哟', 'お早う', 'good morning']).description('人家会响应这些早安消息哦！'),
  eveningPet: Schema.array(String).default(['晚', '晚安', '晚好', '睡觉', '晚上好', 'oyasuminasai', 'おやすみなさい', 'good evening', 'good night']).description('人家会响应这些晚安消息哦！'),
})
