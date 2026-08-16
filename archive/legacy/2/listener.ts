import { Context, Schema, Session, SessionError, User } from 'koishi'
import { SleepManage, SleepManageListener } from './types'
import type { Config as _CONFIG } from '.'

export const Config: Schema<SleepManageListener.Config> = Schema.object({
  gagme: Schema.boolean().default(true).description('是否开启禁言模式'),
  morningSpan: Schema.tuple([Schema.number().min(0).max(12), Schema.number().min(0).max(12)]).default([6, 12]).description('早安 响应时间范围喵'),
  eveningSpan: Schema.tuple([Schema.number().min(12).max(23), Schema.number().min(0).max(23)]).default([21, 3]).description('晚安 响应时间范围喵'),
  morningWord: Schema.array(String).default(['早', '早安', '早哇', '起床', '早上好', 'ohayo', '哦哈哟', 'お早う', 'good morning']).description('人家会响应这些早安消息哦！'),
  eveningWord: Schema.array(String).default(['晚', '晚安', '晚好', '睡觉', '晚上好', 'oyasuminasai', 'おやすみなさい', 'good evening', 'good night']).description('人家会响应这些晚安消息哦！'),
})

export function apply(ctx: Context, config: _CONFIG) {
  ctx.before('attach-user', async (_, fields) => {
    fields
      .add('id')
      .add(SleepManage.UserKey.Timezone)
      .add(SleepManage.UserKey.FirstWake)
      .add(SleepManage.UserKey.LastSleep)
      .add(SleepManage.UserKey.Gag)
  })

  ctx.middleware(async (session: Session<'id' | SleepManage.AttachUserFields>, next) => {
    const now = Date.now()
    const toleranceTime = config.tolerance * 60 * 60 * 1000
    const triggerPeriod = handleTrigger(session, config, session.user)
    if (!triggerPeriod) {
      return next()
    }

    if (now - session.user[SleepManage.UserKey.LastSleep].getTime() < toleranceTime && triggerPeriod === SleepManageListener.TriggerPeriod.EVENING) {
      throw new SessionError('sleep.error.tooFrequent')
    }

    if (triggerPeriod === SleepManageListener.TriggerPeriod.MORNING) {
      session.user[SleepManage.UserKey.LastSleep] = new Date(now)
    }

    if (triggerPeriod === SleepManageListener.TriggerPeriod.EVENING) {
      const lastSleep = session.user[SleepManage.UserKey.LastSleep]
    }
  })
}

function handleTrigger(
  session: Session,
  config: _CONFIG,
  user: User.Observed<'id' | SleepManage.AttachUserFields>
): SleepManageListener.TriggerPeriod.MORNING | SleepManageListener.TriggerPeriod.EVENING | false {
  const now = new Date()
  const nowTime = now.getTime()
  const timezone = user[SleepManage.UserKey.Timezone] || (Math.floor(new Date().getTimezoneOffset() / 60).toString() as SleepManage.TimeZone)
  const firstWake = user[SleepManage.UserKey.FirstWake] || now

  if (!firstWake) {
    return SleepManageListener.TriggerPeriod.MORNING
  }

  // offset of the timezone
  const morningStart = timezoneCalculate(firstWake.getTime(), timezone)
  const morningEnd = timezoneCalculate(firstWake.getTime() + config.morningSpan[0], timezone)
  const eveningStart = timezoneCalculate(firstWake.getTime() + config.morningSpan[1], timezone)
  const eveningEnd = timezoneCalculate(firstWake.getTime() + config.morningSpan[1] + config.eveningSpan[0], timezone)

  if (nowTime >= morningStart && nowTime <= morningEnd) {
    if (config.morningWord.includes(session.content)) {
      return SleepManageListener.TriggerPeriod.MORNING
    }
  } else if (nowTime >= eveningStart && nowTime <= eveningEnd) {
    if (config.eveningWord.includes(session.content)) {
      return SleepManageListener.TriggerPeriod.EVENING
    }
  }
  return false
}

function timezoneCalculate(baseTime: number, timezone: SleepManage.TimeZone): number {
  if (timezone === '0') {
    return baseTime
  }
  const time = new Date(baseTime)
  const offsetOrient = timezone[0] === '+' ? 1 : -1
  const offset = parseInt(timezone.slice(1))
  time.setHours(time.getHours() + offsetOrient * offset)
  return time.getTime()
}
