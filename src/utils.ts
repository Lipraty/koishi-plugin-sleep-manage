import { TimeSpan } from "./types"

export function getTimeByTZ(tz: number) {
  const date = new Date()
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000)
  const newDate = new Date(utc + (3600000 * tz))
  return newDate
}

export function genUTCHours(now: number, hh: number, mm: number = 0, ss: number = 0): number {
  const date = new Date(now)
  date.setUTCHours(hh, mm, ss)
  return date.getTime()
}

export function timerFormat(time: number, tuple?: boolean): string | [string, string, string] {
  const t = (n: number) => Math.trunc(n)
  const S = t((time % (1000 * 60)) / 1000)
  const M = t((time % (1000 * 60 * 60)) / (1000 * 60))
  const H = t((time % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const T = [H, M, S].map(v => (`${v}`.length === 1 ? `0${v}` : v).toString()) as [string, string, string]
  return tuple ? T : T.join(':')
}

export function getTodaySpan(time: number, config: TimeSpan): TimeSpan{
  const morningStart = genUTCHours(time, config.eveningStart)
  const morningEnd = genUTCHours(time, config.morningEnd)
  const eveningStart = genUTCHours(time, config.eveningStart)
  const eveningEnd = genUTCHours(time, config.eveningEnd) + (Math.abs(this.config.eveningStart - (this.config.eveningEnd + 24)) < 24 ? 86400000 : 0)
  return {
    morningStart,
    morningEnd,
    eveningStart,
    eveningEnd,
    start: morningStart,
    end: eveningEnd
  }
}
