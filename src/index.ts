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
type SleepSession = Session<'id' | 'lastMessageAt' | 'eveningCount' | 'fristMorning' | 'timezone', 'id'>
//#endregion

class SleepManage {
  public readonly name = 'sleep-manage'
  public readonly using = ['database']


  constructor(private ctx: Context, private config: SleepManage.Config) {
    ctx.i18n.define('zh', require('./locales/zh-cn'))
    ctx.model.extend('user', { lastMessageAt: 'integer(14)', fristMorning: { type: 'boolean', initial: true }, timezone: 'integer(3)', eveningCount: 'integer(3)' })
    ctx.model.extend('channel', { morningRank: 'list', eveningRank: 'list' })
    ctx.model.extend('sleep_manage_record', {
      id: 'unsigned',
      uid: 'unsigned',
      messageAt: 'integer(14)',
      peiod: 'string',
      channelRank: 'json'
    }, { autoInc: true, foreign: { uid: ['user', 'id'] } })

    ctx.before('attach-user', (_, filters) => {
      filters.add('lastMessageAt')
      filters.add('eveningCount')
    })

    ctx.middleware((session: SleepSession, next) => this.onMessage(session, this, next))
    ctx.command('sleep')
      .option('timezone', '-t [tz:number]', { fallback: config.defTimeZone })
      .userFields(['id', 'lastMessageAt', 'eveningCount', 'timezone'])
      .action(async ({ session, options }) => {
        if (options.timezone >= -12 || options.timezone <= 12) {
          session.user.timezone = options.timezone
          session.send(session.text('sleep.timezone.done', [config.kuchiguse, options.timezone]))
        }
      })
  }

  private async onMessage(session: SleepSession, self: this, next: Next) {
    const getRankList = (peiod: SleepPeiod) => self.ctx.database.get('channel', { id: session.channel.id }, [`${peiod}Rank`])
    const onRankList = (peiod: SleepPeiod, newData: number[]) => self.ctx.database.set('channel', { id: session.channel.id }, { [`${peiod}Rank`]: newData })
    const reset = (peiod: SleepPeiod) => self.ctx.database.set('channel', { id: session.channel.id }, { [`${peiod === 'morning' ? 'evening' : 'morning'}Rank`]: [] })
    // const tzd = (n: number) => n + (session.user.timezone || self.config.defTimeZone)
    const tzd = (n: number) => n

    const nowHour = new Date().getHours()
    const priv = session.subtype === 'private'
    let peiod: SleepPeiod
    let rankList: number[] = []

    if ((self.config.morningPet.includes(session.content) || (self.config.autoMorning && session.user.fristMorning)) && ((nowHour >= tzd(self.config.morningSpan[0])) && (nowHour <= tzd(self.config.morningSpan[1])))) {
      peiod = 'morning'
      session.user.fristMorning = false
    }
    else if (self.config.eveningPet.includes(session.content) && ((nowHour >= tzd(self.config.eveningSpan[0])) || (nowHour <= tzd(self.config.eveningSpan[1])))) {
      peiod = 'evening'
      session.user.fristMorning = true
    }
    else return next()

    const oldTime = session.user.lastMessageAt
    const nowTime = session.user.lastMessageAt = Date.now()
    const calcTime = nowTime - oldTime
    const duration = self.timerFormat(calcTime, true) as string[]
    let multiple = nowHour - new Date(oldTime).getHours() < self.config.interval
    let tag: string

    await self.ctx.database.upsert('sleep_manage_record', [{
      uid: session.user.id,
      messageAt: nowTime,
      peiod,
      channelRank: rankList ? { [session.channelId]: rankList.length } : undefined
    }])

    if (!priv && multiple) {
      await reset(peiod)
      const _RL = await getRankList(peiod)
      if (_RL.length > 0) rankList = _RL.map(v => v[`${peiod}Rank`])[0]
      rankList.push(session.user.id)
      await onRankList(peiod, rankList)
    }

    if (oldTime) {
      tag = 'prefix'
      if (multiple) {
        session.user.eveningCount++
        if (peiod === 'evening') tag = 'count'
      } else { session.user.eveningCount = 0 }
    } else tag = 'frist'

    const defMsg = session.text(`sleep.${peiod}.${tag}`, [self.config.kuchiguse, 0, session.user.eveningCount])
    const timeMsg = session.text(`sleep.${peiod}.timer`, duration)

    return `<message>
      <p>${defMsg}</p>
      <p>${multiple ? '' : timeMsg}${!priv && !multiple ? ', ' + session.text(`sleep.${peiod}.rank`, [rankList.length + 1]) : ''}</p>
    </message>`
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

  private calcTZ(time: number, tz: number) { }
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

> 由于 0.2 完全重写了数据库的代码，如果主人是从 0.1.x 版本升级上来的，可能会遇到一些问题哦！

主人好喵~ 你可以在我存在的任何地方跟我说“早安”或“晚安”来记录你的作息哦~

请注意下列时间设置是24小时制哦

然后没有什么要说明的了~<span class="rotationStar">⭐</span>
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
    defTimeZone: Schema.number().min(-12).max(12).default(8).description('用户默认时区，范围是 -12 至 12 喵'),
    kuchiguse: Schema.string().default('喵').description('谜之声Poi~'),
    interval: Schema.number().min(0).max(12).default(3).description('在这个时长内都是重复的喵'),
    autoMorning: Schema.boolean().default(true).description('将早安时间内的第一条消息视为早安'),
    manyEvening: Schema.number().min(3).max(114514).default(3).description('真的重复晚安太多了喵，要骂人了喵！'),
    morningSpan: Schema.tuple([Schema.number().min(0).max(24), Schema.number().min(0).max(24)]).default([6, 12]).description('早安 响应时间范围喵'),
    eveningSpan: Schema.tuple([Schema.number().min(0).max(24), Schema.number().min(0).max(24)]).default([21, 3]).description('晚安 响应时间范围喵'),
    morningPet: Schema.array(String).default(['早', '早安', '早哇', '早上好', 'ohayo', '哦哈哟', 'お早う', 'good morning']).description('人家会响应这些早安消息哦！'),
    eveningPet: Schema.array(String).default(['晚', '晚安', '晚好', '晚上好', 'oyasuminasai', 'おやすみなさい', 'good evening', 'good night']).description('人家会响应这些晚安消息哦！'),
  })
}

export default SleepManage
