import { Timezone } from './types'

// #region Time service
export const toUserLocalTime = (date: Date, timezone: Timezone) => {
  const offset = (timezone === 'LOCAL' ? -date.getTimezoneOffset() / 60 : timezone === 'UTC' ? 0 : parseInt(timezone)) * 60 * 60 * 1000

  return new Date(date.getTime() + offset)
}

export const isInTimeRange = (range: [number, number], time: Date) => {
  const [start, end] = range
  const hour = time.getHours()

  if (start > end) {
    return hour >= start || hour < end
  }

  return hour >= start && hour < end
}

export const calcDuration = (sleepTime: Date, wakeTime: Date) => {
  return (wakeTime.getTime() - sleepTime.getTime()) / (1000 * 60 * 60)
}
// #endregion
