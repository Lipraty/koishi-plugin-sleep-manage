import { Channel, Command, Context, Next, Schema, Session } from 'koishi'
import { } from '@koishijs/plugin-help'

//#region 
declare module 'koishi' {
  interface Tables {
    sleep_manage_v2: SleepManageLogger
  }
  interface User {
    timezone: number
    sleeping: boolean
  }
}

export interface SleepManageLogger {
  id: number          //记录ID
  uid: number         //用户ID
  messageAt: number   //消息时间
  from: string        //消息来源: platfrom:channelId (if platform is private, channelId is user id)
  endMessage: string  //最后一次消息
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
      sleeping: { type: 'boolean', initial: false },
    })
    ctx.model.extend('sleep_manage_v2', {
      id: 'unsigned',
      uid: 'unsigned',
      messageAt: 'integer(14)',
      from: 'string(32)',
      endMessage: 'string(256)'
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
          // gencode by copilot👇
          const _nowTime = new Date().getTime()
          const localeTimezone = new Date().getTimezoneOffset() / -60
          const userTimezone = session.user.timezone || localeTimezone
          const nowTime = _nowTime + (userTimezone * 3600000)
          const nowHour = new Date(nowTime).getHours()
          const reduceDay = (time: number) => time - 86400000
          const startTime = new Date(nowTime).setUTCHours(this.config.morningSpan[0], 0, 0, 0)
          const endTime = new Date(nowTime).setUTCHours(this.config.eveningSpan[1], 0, 0, 0) + (this.config.eveningSpan[1] > 0 ? 86400000 : 0)

          const sleepLogger = await ctx.database.get('sleep_manage_v2', { uid: session.user.id })
          const sleepLoggerCount = sleepLogger.length
          const sleepLoggerLast = sleepLogger[sleepLoggerCount - 1]
          const sleepLoggerLastTime = sleepLoggerLast ? sleepLoggerLast.messageAt : 0
          const sleepLoggerLastMessage = sleepLoggerLast ? sleepLoggerLast.endMessage : ''
          const sleepLoggerLastFrom = sleepLoggerLast ? sleepLoggerLast.from : ''
          const sleepLoggerLastFromPlatform = sleepLoggerLastFrom.split(':')[0]
          const sleepLoggerLastFromChannel = sleepLoggerLastFrom.split(':')[1]
          const sleepLoggerLastFromChannelName = sleepLoggerLastFromPlatform === 'private' ? sleepLoggerLastFromChannel : (await ctx.database.get('channel', { id: sleepLoggerLastFromChannel }))[0].name
          const sleepLoggerLastFromChannelNameText = sleepLoggerLastFromChannelName ? `「${sleepLoggerLastFromChannelName}」` : ''
          
        }
      })
  }

  private async onMessage(session: Session<'id' | 'timezone' | 'sleeping'>) {
    let peiod: 'morning' | 'evening'


    const _nowTime = new Date().getTime()
    const localeTimezone = new Date().getTimezoneOffset() / -60
    const userTimezone = session.user.timezone || localeTimezone
    const nowTime = _nowTime + (userTimezone * 3600000)
    const nowHour = new Date(nowTime).getHours()
    const reduceDay = (time: number) => time - 86400000
    const startTime = new Date(nowTime).setUTCHours(this.config.morningSpan[0], 0, 0, 0)
    const endTime = new Date(nowTime).setUTCHours(this.config.eveningSpan[1], 0, 0, 0) + (this.config.eveningSpan[1] > 0 ? 86400000 : 0)

    if ((nowHour >= this.config.morningSpan[0] && nowHour <= this.config.morningSpan[1])
      && ((this.config.autoMorning && session.user.sleeping) || this.config.morningPet.includes(session.content))) {
      peiod = 'morning'
      session.user.sleeping = false
    } else if (this.config.eveningPet.includes(session.content)) {
      peiod = 'evening'
      session.user.sleeping = true
    } else return


    const userSleepBefore = await this.ctx.database.get('sleep_manage_v2', { 
      uid: session.user.id,
      messageAt: { $gte: reduceDay(startTime), $lte: reduceDay(endTime) }
    })
    const newSleep = userSleepBefore.length <= 0
    const direct = session.isDirect || session.subtype === 'private' // fallback old version

    await this.ctx.database.create('sleep_manage_v2', {
      uid: session.user.id,
      messageAt: nowTime,
      from: `${direct ? 'private' : session.platform}:${session.channelId || session.userId}`,
      endMessage: session.content
    })
  }

  // private async onMessage(session: SleepSession, self: this, next: Next) {
  //   const nowTime = Date.now() + ((session.user.timezone || 0) * 3600000)
  //   const nowHour = new Date(nowTime).getHours()
  //   const priv = session.subtype === 'private'
  //   let peiod: SleepPeiod
  //   let rank: number

  //   if ((self.config.morningPet.includes(session.content) || (self.config.autoMorning && session.user.fristMorning)) && ((nowHour >= self.config.morningSpan[0]) && (nowHour <= self.config.morningSpan[1]))) {
  //     peiod = 'morning'
  //     session.user.fristMorning = false
  //     session.user.eveningCount = 0
  //   }
  //   else if (self.config.eveningPet.includes(session.content) && ((nowHour >= self.config.eveningSpan[0]) || (nowHour <= self.config.eveningSpan[1]))) {
  //     peiod = 'evening'
  //     session.user.fristMorning = true
  //   }
  //   else return next()


  //   const oldTime = session.user.lastMessageAt || nowTime
  //   if (peiod) session.user.lastMessageAt = nowTime
  //   const calcTime = nowTime - oldTime
  //   const duration = self.timerFormat(calcTime, true) as string[]
  //   let multiple = +duration[0] < self.config.interval
  //   let tag: string

  //   // Channel Rank
  //   if (!priv) {
  //     let rankList = (await self.ctx.database.get('channel', { id: session.channelId }))[0][`${peiod}Rank`]
  //     rankList = rankList.map(Number) // to number
  //     if (rankList.includes(session.user.id)) rankList = self.moveEnd(rankList, session.user.id)
  //     else rankList.push(session.user.id)
  //     rank = rankList.length
  //     await self.ctx.database.set('channel', { id: session.channelId }, { [`${peiod}Rank`]: rankList })
  //   }

  //   //Sleep Logger
  //   await self.ctx.database.create('sleep_manage_record', {
  //     uid: session.user.id,
  //     messageAt: nowTime,
  //     peiod,
  //     channelRank: rank ? { [session.channelId]: rank } : undefined
  //   })

  //   if (oldTime) {
  //     tag = 'prefix'
  //     if (multiple) {
  //       session.user.eveningCount++
  //       if (peiod === 'evening' && session.user.eveningCount >= this.config.manyEvening) tag = 'count'
  //     } else { session.user.eveningCount = 0 }
  //   } else tag = 'frist'

  //   let output = `<message><p>${session.text(`sleep.${peiod}.${tag}`, [self.config.kuchiguse, session.user.eveningCount])}</p><p>`
  //   if (!multiple) {
  //     output += `${multiple ? '' : session.text(`sleep.${peiod}.timer`, duration)}`
  //     if (!priv) output += ', '
  //   }
  //   if (!priv) output += session.text(`sleep.${peiod}.rank${multiple ? 'Renew' : ''}`, [rank, self.config.kuchiguse])
  //   return output + '</p></message>'
  // }

  private moveEnd<T extends unknown>(array: T[], source: T) {
    let e = 0
    for (let i = 0; e < array.length; e++) {
      if (array[i] === source) array.push(array.splice(i, 1)[0])
      else i++
    }
    return array
  }

  /** time(123456) to HH:MM:SS or [HH, MM, SS] */
  private timerFormat(time: number, tuple?: boolean) {
    const t = (n: number) => Math.trunc(n)
    const S = t((time % (1000 * 60)) / 1000)
    const M = t((time % (1000 * 60 * 60)) / (1000 * 60))
    const H = t((time % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const T = [H, M, S].map(v => (`${v}`.length === 1 ? `0${v}` : v).toString())
    return tuple ? T : T.join(':')
  }

  private calcTZ(time: number, tz: number) {

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
    interval: Schema.number().min(0).max(12).default(3).description('在这个时长内都是重复的喵'),
    autoMorning: Schema.boolean().default(true).description('将早安时间内的第一条消息视为早安'),
    manyEvening: Schema.number().min(3).max(114514).default(3).description('真的重复晚安太多了喵，要骂人了喵！'),
    morningSpan: Schema.tuple([Schema.number().min(0).max(24), Schema.number().min(0).max(24)]).default([6, 12]).description('早安 响应时间范围喵'),
    eveningSpan: Schema.tuple([Schema.number().min(0).max(24), Schema.number().min(0).max(24)]).default([21, 3]).description('晚安 响应时间范围喵'),
    morningPet: Schema.array(String).default(['早', '早安', '早哇', '起床', '早上好', 'ohayo', '哦哈哟', 'お早う', 'good morning']).description('人家会响应这些早安消息哦！'),
    eveningPet: Schema.array(String).default(['晚', '晚安', '晚好', '睡觉', '晚上好', 'oyasuminasai', 'おやすみなさい', 'good evening', 'good night']).description('人家会响应这些晚安消息哦！'),
  })
}

export default SleepManage
