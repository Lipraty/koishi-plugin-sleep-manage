import { Context, Schema, Session } from 'koishi'
import moment from 'moment'
import { StringDecoder } from 'string_decoder'

declare module 'koishi' {
  interface User {
    lastGreetingTime: number
  }
}

export const name = 'sleep-manage'

export const using = ['database']

export const usage = `
## 插件说明

主人好喵~ 

请注意下列时间设置是24小时制哦

然后没有什么要说明的了~
`

export interface Config {
  morningStart: number
  morningEnd: number
  eveningStart: number
  eveningEnd: number
}

export const Config: Schema<Config> = Schema.object({
  morningStart: Schema.number().min(0).max(24).default(6).description('早安 响应时间范围开始喵'),
  morningEnd: Schema.number().min(0).max(24).default(12).description('早安 响应时间范围结束喵'),
  eveningStart: Schema.number().min(0).max(24).default(21).description('晚安 响应时间范围开始喵'),
  eveningEnd: Schema.number().min(0).max(24).default(3).description('晚安 响应时间范围结束喵'),
})

export function apply(ctx: Context, config: Config) {
  // 1 = morning, 2 = night
  let contentTag: 0 | 1 | 2 = 0
  let morningRank: number = 0
  let eveningRank: number = 0
  let toDay: number = new Date().getDate()

  ctx.model.extend('user', {
    lastGreetingTime: 'integer'
  })

  ctx.before('attach-user', (session, filters) => {
    filters.add('lastGreetingTime')
  })

  ctx.middleware(async (session: Session<'id' | 'lastGreetingTime'>, next) => {
    const morning = ['早', '早安']
    const night = ['晚', '晚安']
    const content: string = session.content
    const nowTime = new Date().getTime()
    const nowHour: number = new Date(nowTime).getHours()

    let period: string = '早安'
    let action: string = '起床'
    let condition: string = '睡眠'
console.log(toDay)
    if (toDay !== new Date().getDay()) {
      toDay = new Date().getDay()
      morningRank = 0
      eveningRank = 0
    }

    if (morning.includes(content) && (nowHour >= config.morningStart && nowHour <= config.morningEnd)) {
      morningRank++
      period = '早安'
      action = '起床'
      condition = '睡眠'
      contentTag = 1
    }

    if (night.includes(content) && (nowHour >= config.eveningStart || nowHour <= config.eveningEnd)) {
      eveningRank++
      period = '晚安'
      action = '入睡'
      condition = '清醒'
      contentTag = 2
    }

    if (contentTag > 0) {
      if (session.user.lastGreetingTime) {
        const duration = moment(new Date(nowTime - session.user.lastGreetingTime)).format('HH:mm:ss').split(':').map(v => +v)
        await session.send(`${period}喵！你的${condition}时长为${duration[0]}时${duration[1]}分${duration[2]}秒~\n${session.subtype === 'private' ? '' : '你是今天第' + (contentTag === 1 ? morningRank : eveningRank) + '个' + action + '的哦！'}`)
      } else {
        await session.send(`${period}喵！由于是第一次记录，就不计算时间啦~\n${session.subtype === 'private' ? '' : '你是今天第' + (contentTag === 1 ? morningRank : eveningRank) + '个' + action + '的哦！'}`)
      }
      contentTag = 0
      session.user.lastGreetingTime = nowTime
    }
  })

  const parseTime = (time: string) => {
    return new Date('2023-01-01 ' + time).getTime()
  }
}
