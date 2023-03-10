import { Channel, Command, Context, Next, Schema, Session } from 'koishi'
import { } from '@koishijs/plugin-help'

//#region 
declare module 'koishi' {
  interface Tables {
    sleep_manage_record: SleepManegeRecord
  }
  interface User {
    lastMessageAt: number
    fristMorning: boolean
    eveningCount: number
    timezone: number
  }
  interface Channel {
    eveningRank: number[]
    morningRank: number[]
  }
}

export interface SleepManegeRecord {
  id: number
  uid: number
  messageAt: number
  peiod: SleepPeiod
  channelRank: Record<string, number>
}

type SleepPeiod = 'morning' | 'evening'
type SleepSession = Session<'id' | 'lastMessageAt' | 'eveningCount' | 'fristMorning' | 'timezone', 'id' | 'eveningRank' | 'morningRank'>
//#endregion

class SleepManage {
  public readonly name = 'sleep-manage'
  public readonly using = ['database']


  constructor(private ctx: Context, private config: SleepManage.Config) {
    //#region Database
    ctx.i18n.define('zh', require('./locales/zh-cn'))
    ctx.model.extend('user', {
      lastMessageAt: 'integer(14)',
      fristMorning: { type: 'boolean', initial: true },
      timezone: { type: 'integer', initial: config.defTimeZone },
      eveningCount: 'integer(3)'
    })
    ctx.model.extend('channel', { morningRank: 'list', eveningRank: 'list' })
    ctx.model.extend('sleep_manage_record', {
      id: 'unsigned',
      uid: 'unsigned',
      messageAt: 'integer(14)',
      peiod: 'string',
      channelRank: 'json'
    }, { autoInc: true })

    ctx.before('attach-user', (_, filters) => {
      filters.add('id')
        .add('lastMessageAt')
        .add('eveningCount')
        .add('eveningCount')
        .add('timezone')
    })
    ctx.before('attach-channel', (_, filters) => {
      filters.add('id')
        .add('eveningRank')
        .add('morningRank')
    })
    //#endregion
    ctx.middleware((session: SleepSession, next) => this.onMessage(session, this, next))
    ctx.command('sleep')
      .option('timezone', '-t <tz:number>')
      .userFields(['id', 'lastMessageAt', 'eveningCount', 'timezone'])
      .action(async ({ session, options }) => {
        if (options.timezone >= -12 || options.timezone <= 12) {
          session.user.timezone = options.timezone
          session.send(session.text('sleep.timezone.done', [config.kuchiguse, `${options.timezone >= 0 ? '+' + options.timezone : options.timezone}`]))
        }
      })
  }

  private async onMessage(session: SleepSession, self: this, next: Next) {
    const nowTime = Date.now() + ((session.user.timezone || 0) * 3600000)
    const nowHour = new Date(nowTime).getHours()
    const priv = session.subtype === 'private'
    let peiod: SleepPeiod
    let rank: number

    if ((self.config.morningPet.includes(session.content) || (self.config.autoMorning && session.user.fristMorning)) && ((nowHour >= self.config.morningSpan[0]) && (nowHour <= self.config.morningSpan[1]))) {
      peiod = 'morning'
      session.user.fristMorning = false
      session.user.eveningCount = 0
    }
    else if (self.config.eveningPet.includes(session.content) && ((nowHour >= self.config.eveningSpan[0]) || (nowHour <= self.config.eveningSpan[1]))) {
      peiod = 'evening'
      session.user.fristMorning = true
    }
    else return next()


    const oldTime = session.user.lastMessageAt || nowTime
    if (peiod) session.user.lastMessageAt = nowTime
    const calcTime = nowTime - oldTime
    const duration = self.timerFormat(calcTime, true) as string[]
    let multiple = +duration[0] < self.config.interval
    let tag: string

    // Channel Rank
    if (!priv) {
      let rankList = (await self.ctx.database.get('channel', { id: session.channelId }))[0][`${peiod}Rank`]
      rankList = rankList.map(Number) // to number
      if (rankList.includes(session.user.id)) rankList = self.moveEnd(rankList, session.user.id)
      else rankList.push(session.user.id)
      rank = rankList.length
      await self.ctx.database.set('channel', { id: session.channelId }, { [`${peiod}Rank`]: rankList })
    }

    //Sleep Logger
    await self.ctx.database.create('sleep_manage_record', {
      uid: session.user.id,
      messageAt: nowTime,
      peiod,
      channelRank: rank ? { [session.channelId]: rank } : undefined
    })

    if (oldTime) {
      tag = 'prefix'
      if (multiple) {
        session.user.eveningCount++
        if (peiod === 'evening' && session.user.eveningCount >= this.config.manyEvening) tag = 'count'
      } else { session.user.eveningCount = 0 }
    } else tag = 'frist'

    let output = `<message><p>${session.text(`sleep.${peiod}.${tag}`, [self.config.kuchiguse, session.user.eveningCount])}</p><p>`
    if (!multiple) {
      output += `${multiple ? '' : session.text(`sleep.${peiod}.timer`, duration)}`
      if (!priv) output += ', '
    }
    if (!priv) output += session.text(`sleep.${peiod}.rank${multiple ? 'Renew' : ''}`, [rank, self.config.kuchiguse])
    return output + '</p></message>'
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

## ???????????????

????????????~ ????????????????????????????????????????????????????????????????????????????????????????????????~

??????????????????????????????24????????????

?????????????????????????????????~<span class="rotationStar">???</span>
`

  export interface Config {
    defTimeZone: number
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
    defTimeZone: Schema.number().min(-12).max(12).default(8).description('?????????????????????????????? -12 ??? 12 ???'),
    kuchiguse: Schema.string().default('???').description('?????????Poi~'),
    interval: Schema.number().min(0).max(12).default(3).description('????????????????????????????????????'),
    autoMorning: Schema.boolean().default(true).description('????????????????????????????????????????????????'),
    manyEvening: Schema.number().min(3).max(114514).default(3).description('???????????????????????????????????????????????????'),
    morningSpan: Schema.tuple([Schema.number().min(0).max(24), Schema.number().min(0).max(24)]).default([6, 12]).description('?????? ?????????????????????'),
    eveningSpan: Schema.tuple([Schema.number().min(0).max(24), Schema.number().min(0).max(24)]).default([21, 3]).description('?????? ?????????????????????'),
    morningPet: Schema.array(String).default(['???', '??????', '??????', '??????', '?????????', 'ohayo', '?????????', '?????????', 'good morning']).description('???????????????????????????????????????'),
    eveningPet: Schema.array(String).default(['???', '??????', '??????', '??????', '?????????', 'oyasuminasai', '?????????????????????', 'good evening', 'good night']).description('???????????????????????????????????????'),
  })
}

export default SleepManage
