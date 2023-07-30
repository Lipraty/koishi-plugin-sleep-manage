import { Context, Schema, Session } from 'koishi'
import { } from '@koishijs/plugin-help'

//#region 
declare module 'koishi' {
  interface Tables {
    sleep_manage_v2: SleepManageLogger
  }
  interface User {
    timezone: number
    eveningCount: number
    sleeping: boolean
  }
}

export interface SleepManageLogger {
  id: number          //记录ID
  uid: number         //用户ID
  messageAt: number   //消息时间
  from: string        //消息来源: platfrom:guildId (if platform is private, guildId is user id)
}
//#endregion

class SleepManage {
  public readonly name = 'sleep-manage'
  public readonly using = ['database']

  constructor(private ctx: Context, private config: SleepManage.Config) {
    //#region Database
    ctx.i18n.define('zh', require('./locales/zh-cn'))
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
      filters.add('id')
        .add('timezone')
    })
    //#endregion
    ctx.on('message', this.onMessage.bind(this))
    ctx.command('sleep')
      .option('timezone', '-t <tz:number>')
      .option('week', '-w')
      .option('month', '-m')
      .option('year', '-y')
      .userFields(['id', 'timezone'])
      .action(async ({ session, options }) => {
        if (options.timezone >= -12 || options.timezone <= 12) {
          session.user.timezone = options.timezone
          session.send(session.text('sleep.timezone.done', [config.kuchiguse, `${options.timezone >= 0 ? '+' + options.timezone : options.timezone}`]))
        }

        if (Object.keys(options).length <= 0) {

        }
      })
  }

  private async onMessage(session: Session<'id' | 'timezone' | 'sleeping' | 'eveningCount'>) {
    let peiod: 'morning' | 'evening'
    let calcTime: number = -1
    let rank: number = -1

    const reduceDay = (time: number) => time - 86400000
    const msg = (path: string, args?: any[]) => session.text(`sleep.${peiod}.${path}`, [this.config.kuchiguse, ...args])
    const direct = session.isDirect || session.subtype === 'private' || !session.subtype && !session.guildId // fallback old version
    const userContent = session.content
    const nowTime = new Date().getTime() + (session.user.timezone || new Date().getTimezoneOffset() / -60 * 3600000)
    const morningStartTime = new Date(nowTime).setUTCHours(this.config.morningSpan[0], 0, 0, 0)
    const morningEndTime = new Date(nowTime).setUTCHours(this.config.morningSpan[1], 0, 0, 0)
    const eveningStartTime = new Date(nowTime).setUTCHours(this.config.eveningSpan[0], 0, 0, 0)
    const eveningEndTime = new Date(nowTime).setUTCHours(this.config.eveningSpan[1], 0, 0, 0) + (Math.abs(this.config.eveningSpan[0] - (this.config.eveningSpan[1] + 24)) < 24 ? 86400000 : 0)
    const startTime = morningStartTime
    const endTime = eveningEndTime
    const userLoggerBefore: SleepManageLogger[] = await this.ctx.database.get('sleep_manage_v2', {
      uid: session.user.id,
      messageAt: { $gte: reduceDay(startTime), $lte: reduceDay(endTime) }
    })
    const userLoggerToDay: SleepManageLogger[] = await this.ctx.database.get('sleep_manage_v2', {
      uid: session.user.id,
      messageAt: { $gte: startTime, $lte: endTime }
    })
    const guildRank: SleepManageLogger[] = await this.ctx.database.get('sleep_manage_v2', {
      messageAt: { $gte: startTime, $lte: endTime },
      from: `${session.platform}:${session.guildId}`
    })
    const frist = userLoggerBefore.length <= 0

    if (nowTime >= morningStartTime && nowTime <= morningEndTime) {
      if (this.config.morningPet.includes(userContent) || (this.config.autoMorning && session.user.sleeping)) {
        peiod = 'morning'
        session.user.sleeping = false
      }
    } else if (nowTime >= eveningStartTime && nowTime <= eveningEndTime) {
      if (this.config.eveningPet.includes(userContent)) {
        peiod = 'evening'
        session.user.sleeping = true
        session.user.eveningCount++
      }
    } else {
      // TODO
      return
    }

    // 记录本次早/晚安
    await this.ctx.database.create('sleep_manage_v2', {
      uid: session.user.id,
      messageAt: nowTime,
      from: `${direct ? 'private' : session.platform}:${session.guildId || session.userId}`
    })

    if (peiod === 'morning') {
      const lastEveningTimes = userLoggerBefore
        .filter(v => v.messageAt >= reduceDay(eveningStartTime) && v.messageAt <= reduceDay(eveningEndTime))
        .sort((a, b) => b.messageAt - a.messageAt)
      if (lastEveningTimes[0].messageAt >= reduceDay(eveningStartTime) && lastEveningTimes[0].messageAt <= reduceDay(eveningEndTime)) {
        calcTime = nowTime - lastEveningTimes[0].messageAt
      }
    }

    if (peiod === 'evening') {
      if (userLoggerToDay.length > 0) {
        calcTime = nowTime - userLoggerToDay[0].messageAt
      }
    }

    if (userLoggerToDay.length > 0) {
      calcTime = nowTime - userLoggerToDay[0].messageAt
    } else {
      calcTime = nowTime - userLoggerBefore[userLoggerBefore.length - 1].messageAt
    }

    if (frist) {
      return msg('frist')
    } else {
      return `<>
        <p>${msg('reply')}</p>
        <p>${msg('timer', this.timerFormat(calcTime, true) as string[])}</p>
        ${direct ? '' : `<p>${msg('rank', [rank])}</p>`}
      </>`
    }
  }

  private moveEnd<T extends unknown>(array: T[], source: T) {
    let e = 0
    for (let i = 0; e < array.length; e++) {
      if (array[i] === source) array.push(array.splice(i, 1)[0])
      else i++
    }
    return array
  }

  /** time(123456) to HH:MM:SS or [HH, MM, SS] */
  private timerFormat(time: number, tuple?: boolean): string | [string, string, string] {
    const t = (n: number) => Math.trunc(n)
    const S = t((time % (1000 * 60)) / 1000)
    const M = t((time % (1000 * 60 * 60)) / (1000 * 60))
    const H = t((time % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const T = [H, M, S].map(v => (`${v}`.length === 1 ? `0${v}` : v).toString()) as [string, string, string]
    return tuple ? T : T.join(':')
  }
}

namespace SleepManage {
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

  export interface Config {
    kuchiguse: string
    interval: number
    autoMorning: boolean
    manyEvening: number
    morningSpan: number[]
    eveningSpan: number[]
    morningPet: string[]
    eveningPet: string[]
  }

  export const Config: Schema<Config> = Schema.object({
    kuchiguse: Schema.string().default('喵').description('谜之声Poi~'),
    interval: Schema.number().min(0).max(6).default(3).description('在这个时长内都是重复的喵'),
    autoMorning: Schema.boolean().default(true).description('将早安时间内的第一条消息视为早安'),
    manyEvening: Schema.number().min(3).max(114514).default(3).description('真的重复晚安太多了喵，要骂人了喵！'),
    morningSpan: Schema.tuple([Schema.number().min(0).max(12), Schema.number().min(0).max(12)]).default([6, 12]).description('早安 响应时间范围喵'),
    eveningSpan: Schema.tuple([Schema.number().min(12).max(23), Schema.number().min(12).max(23)]).default([21, 3]).description('晚安 响应时间范围喵'),
    morningPet: Schema.array(String).default(['早', '早安', '早哇', '起床', '早上好', 'ohayo', '哦哈哟', 'お早う', 'good morning']).description('人家会响应这些早安消息哦！'),
    eveningPet: Schema.array(String).default(['晚', '晚安', '晚好', '睡觉', '晚上好', 'oyasuminasai', 'おやすみなさい', 'good evening', 'good night']).description('人家会响应这些晚安消息哦！'),
  })
}

export default SleepManage
