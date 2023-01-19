import { Context, Schema, Session } from 'koishi'

export const name = 'sleep-manage'

export const using = ['database']

//#endregion
export function apply(ctx: Context, config: Config) {
  const fmtTime = (time: Date) => [time.getHours(), time.getMinutes(), time.getSeconds()].map(v => v.toString().length === 2 ? v : '0' + v).join(':')

  ctx.i18n.define('zh', require('./locales/zh-cn'))

  ctx.before('attach-user', (session, filters) => {
    filters.add('lastGreetingTime')
    filters.add('eveningCount')
  })

  ctx.middleware(async (session: Session<'id' | 'lastGreetingTime' | 'eveningCount'>, next) => {
    const content = session.content
    const nowTime = new Date().getTime()
    const oldTime = session.user.lastGreetingTime
    const nowHour = new Date(nowTime).getHours()
    const greetTime = fmtTime(new Date(nowTime - oldTime)).split(':')
    let peiod: 'morning' | 'evening'
    let tag: string

    if (['早', '早安'].includes(content) && (nowHour >= config.morningSpan[0] && nowHour <= config.morningSpan[1])) peiod = 'morning'

    if (['晚', '晚安'].includes(content) && (nowHour >= config.eveningSpan[0] || nowHour <= config.eveningSpan[1])) peiod = 'evening'

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
      return session.text(`sleep.${peiod}.${tag}`, ['喵', greetTime[0], greetTime[1], greetTime[2], 0, session.user.eveningCount])
    } else {
      return next()
    }
  })
}

//#region plugin configs
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
  interval: number
  manyEvening: number
  morningSpan: number[]
  eveningSpan: number[]
  morningPet: string[]
  eveningPet: string[]
}

export const Config: Schema<Config> = Schema.object({
  defTimeZone: Schema.number().min(-12).max(12).default(8).description('用户默认时区，范围是 -12 至 12 喵'),
  interval: Schema.number().min(0).max(12).default(3).description('在这个时长内都是重复的喵'),
  manyEvening: Schema.number().min(3).max(114514).default(3).description('真的重复晚安太多了喵，要骂人了喵！'),
  morningSpan: Schema.tuple([Schema.number().min(0).max(24), Schema.number().min(0).max(24)]).default([6, 12]).description('早安 响应时间范围喵'),
  eveningSpan: Schema.tuple([Schema.number().min(0).max(24), Schema.number().min(0).max(24)]).default([21, 3]).description('晚安 响应时间范围喵'),
  morningPet: Schema.array(String).default(['早', '早安', '早哇', '早上好', 'ohayo', '哦哈哟', 'お早う', 'good morning']).description('人家会响应这些早安消息哦！'),
  eveningPet: Schema.array(String).default(['晚', '晚安', '晚好', '晚上好', 'oyasuminasai', 'おやすみなさい', 'good evening', 'good night']).description('人家会响应这些晚安消息哦！'),
})

