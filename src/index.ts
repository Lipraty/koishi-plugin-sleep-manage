import { Context, Schema, Session } from 'koishi'

declare module 'koishi' {
  interface User {
    lastGreetingTime: number
    eveningCount: number
    greetingChannels: string[]
  }

  interface Channel {
    eveningRank: string[]
    morningRank: string[]
  }
}

//#region plugin configs
export const name = 'sleep-manage'

export const using = ['database']

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

## 插件说明

主人好喵~ 你可以在我存在的任何地方跟我说“早安”或“晚安”来记录你的作息哦~

请注意下列时间设置是24小时制哦

然后没有什么要说明的了~<span class="rotationStar">⭐</span>
`

export interface Config {
  interval: number
  manyEvening: number
  petPhrase: string
  morningStart: number
  morningEnd: number
  eveningStart: number
  eveningEnd: number
}

export const Config: Schema<Config> = Schema.object({
  interval: Schema.number().min(0).max(12).default(3).description('在这个时长内都是重复的喵'),
  manyEvening: Schema.number().min(3).max(114514).default(3).description('真的重复晚安太多了喵，要骂人了喵！'),
  petPhrase: Schema.string().default('喵').description('想要人家怎么说 DA⭐ZE~'),
  morningStart: Schema.number().min(0).max(24).default(6).description('早安 响应时间范围开始喵'),
  morningEnd: Schema.number().min(0).max(24).default(12).description('早安 响应时间范围结束喵'),
  eveningStart: Schema.number().min(0).max(24).default(21).description('晚安 响应时间范围开始喵'),
  eveningEnd: Schema.number().min(0).max(24).default(3).description('晚安 响应时间范围结束喵'),
})
//#endregion
export function apply(ctx: Context, config: Config) {
  const fmtTime = (time: Date) => [time.getHours(), time.getMinutes(), time.getSeconds()].map(v => v.toString().length === 2 ? v : '0' + v).join(':')

  ctx.i18n.define('zh', require('./locales/zh-cn'))

  ctx.model.extend('user', {
    eveningCount: 'integer(3)',
    lastGreetingTime: 'integer(14)',
    greetingChannels: 'list'
  })

  ctx.before('attach-user', (session, filters) => {
    filters.add('lastGreetingTime')
    filters.add('greetingChannels')
    filters.add('eveningCount')
  })

  ctx.middleware(async (session: Session<'id' | 'lastGreetingTime' | 'greetingChannels' | 'eveningCount'>, next) => {
    const content = session.content
    const nowTime = new Date().getTime()
    const oldTime = session.user.lastGreetingTime
    const nowHour = new Date(nowTime).getHours()
    const greetTime = fmtTime(new Date(nowTime - oldTime)).split(':')
    let peiod: 'morning' | 'evening'
    let tag: string

    if (['早', '早安'].includes(content) && (nowHour >= config.morningStart && nowHour <= config.morningEnd)) peiod = 'morning'

    if (['晚', '晚安'].includes(content) && (nowHour >= config.eveningStart || nowHour <= config.eveningEnd)) peiod = 'evening'

    if (oldTime) {
      if (nowHour - new Date(oldTime).getHours() < config.interval) {
        tag = 'repleated'
        if (peiod === 'evening')
          session.user.eveningCount++
      } else {
        session.user.eveningCount = 0
        tag = 'private'
      }
      // else if (session.subtype === 'private')
      //   tag = 'private'
      // else if (session.subtype !== 'private')
      //   tag = 'channel'
    } else tag = 'frist'

    if (peiod === 'evening')
      if (tag === 'repleated' && session.user.eveningCount <= config.manyEvening)
        tag += '.frist'
      else if (tag === 'repleated' && session.user.eveningCount > config.manyEvening)
        tag += '.many'

    if (peiod) {
      session.user.lastGreetingTime = nowTime
      return session.text(`sleep.${peiod}.${tag}`, [config.petPhrase, greetTime[0], greetTime[1], greetTime[2], 0,session.user.eveningCount])
    } else {
      return next()
    }
  })
}
