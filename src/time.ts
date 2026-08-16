import {
  DurationMin,
  mkTimestamp,
  mkTimezone,
  SleepRecord,
  Timestamp,
  Timezone,
  TimezoneValue,
  unDurationMin,
  unTimezone,
} from './domain'
import { Either, left, matchW, none, Option, right, some } from './fp'

export type TimeError =
  | { readonly _tag: 'INVALID_TIMEZONE'; readonly raw: string }
  | { readonly _tag: 'INVALID_BEDTIME'; readonly raw: string }

export interface WallClock {
  readonly hour: number
  readonly minute: number
  
  readonly minutes: number
}

export type ReportKind = 'week' | 'month' | 'year'

const TZ_RE = /^([+-])(\d{1,2})$/

export const parseTimezone = (raw: string): Either<TimeError, Timezone> => {
  const value = raw.trim().toUpperCase()
  if (value === 'UTC' || value === 'LOCAL') {
    return right(mkTimezone(value))
  }
  const matched = TZ_RE.exec(value)
  if (!matched) return left({ _tag: 'INVALID_TIMEZONE', raw })
  const offset = parseInt(value, 10)
  if (Math.abs(offset) > 14) return left({ _tag: 'INVALID_TIMEZONE', raw })
  return right(mkTimezone(value as TimezoneValue))
}

export const resolveTimezone = (
  userTimezone: Option<string>,
  fallback: true | number,
): Timezone =>
  matchW(
    Option.chain((raw: string) =>
      matchW(
        parseTimezone(raw),
        () => none,
        (timezone) => some(timezone),
      ))(userTimezone),
    () => {
      if (fallback === true) return mkTimezone('LOCAL')
      const offset = Math.trunc(fallback)
      return mkTimezone((offset >= 0 ? `+${offset}` : `-${Math.abs(offset)}`) as TimezoneValue)
    },
    (timezone) => timezone,
  )

export const offsetHours = (timezone: Timezone, now = new Date()): number => {
  const value = unTimezone(timezone)
  if (value === 'LOCAL') return -now.getTimezoneOffset() / 60
  if (value === 'UTC') return 0
  return parseInt(value, 10)
}

export const wallClock = (now: Date, timezone: Timezone): WallClock => {
  const shifted = new Date(now.getTime() + offsetHours(timezone, now) * 3600_000)
  const hour = shifted.getUTCHours()
  const minute = shifted.getUTCMinutes()
  return { hour, minute, minutes: hour * 60 + minute }
}

export const userDayKey = (now: Date, timezone: Timezone): string => {
  const shifted = new Date(now.getTime() + offsetHours(timezone, now) * 3600_000)
  return shifted.toISOString().slice(0, 10)
}

export const isInTimeRange = (range: [number, number], clock: WallClock): boolean => {
  const [start, end] = range
  if (start === end) return true
  const value = clock.minutes
  const startMin = start * 60
  const endMin = end * 60
  if (startMin > endMin) return value >= startMin || value < endMin
  return value >= startMin && value < endMin
}

export const parseBedtime = (raw: string): Option<WallClock> => {
  const value = raw.trim()
  const matched = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  if (!matched) return none
  const hour = parseInt(matched[1], 10)
  const minute = parseInt(matched[2], 10)
  return some({ hour, minute, minutes: hour * 60 + minute })
}

const DAY = 86400_000

export type ReportRange = { readonly start: Timestamp; readonly end: Timestamp }

export const reportRange = (kind: ReportKind, now: Date, timezone: Timezone): ReportRange => {
  const offset = offsetHours(timezone, now) * 3600_000
  const dayKey = userDayKey(now, timezone)
  const [year, month, day] = dayKey.split('-').map(Number)
  const todayMidnight = Date.UTC(year, month - 1, day) - offset

  switch (kind) {
    case 'week':
      return {
        start: mkTimestamp(new Date(todayMidnight - 6 * DAY)),
        end: mkTimestamp(new Date(todayMidnight + DAY)),
      }
    case 'month':
      return {
        start: mkTimestamp(new Date(Date.UTC(year, month - 1, 1) - offset)),
        end: mkTimestamp(new Date(Date.UTC(year, month, 1) - offset)),
      }
    case 'year':
      return {
        start: mkTimestamp(new Date(Date.UTC(year, 0, 1) - offset)),
        end: mkTimestamp(new Date(Date.UTC(year + 1, 0, 1) - offset)),
      }
  }
}

export const todayRange = (now: Date, timezone: Timezone): ReportRange => {
  const offset = offsetHours(timezone, now) * 3600_000
  const dayKey = userDayKey(now, timezone)
  const [year, month, day] = dayKey.split('-').map(Number)
  const todayMidnight = Date.UTC(year, month - 1, day) - offset
  return {
    start: mkTimestamp(new Date(todayMidnight)),
    end: mkTimestamp(new Date(todayMidnight + DAY)),
  }
}

export const formatDuration = (min: DurationMin): [string, string, string] => {
  const total = Math.max(0, Math.trunc(unDurationMin(min)))
  const hour = Math.floor(total / 60)
  const minute = total % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return [pad(hour), pad(minute), '00']
}

export type ReportSummary = {
  readonly count: number
  readonly days: number
  readonly durationMin: number
  readonly durationHour: number
  readonly durationMinute: number
  readonly sleepClock: string
  readonly wakeClock: string
}

export const summarizeRecords = (
  records: readonly SleepRecord[],
  timezone: Timezone,
): Option<ReportSummary> => {
  const closed = records.filter((record) => record.wakeTime)
  if (!closed.length) return none

  const pad = (value: number) => String(value).padStart(2, '0')
  const days = new Set(closed.map((record) => userDayKey(record.sleepTime, timezone))).size
  const total = closed.reduce((sum, record) => sum + (record.durationMin ?? 0), 0)
  const avg = Math.round(total / closed.length)
  const avgSleep = meanClock(closed.map((record) => wallClock(record.sleepTime, timezone).minutes))
  const avgWake = meanClock(closed.map((record) => wallClock(record.wakeTime!, timezone).minutes))

  return some({
    count: closed.length,
    days,
    durationMin: avg,
    durationHour: Math.floor(avg / 60),
    durationMinute: avg % 60,
    sleepClock: `${pad(avgSleep.hour)}:${pad(avgSleep.minute)}`,
    wakeClock: `${pad(avgWake.hour)}:${pad(avgWake.minute)}`,
  })
}

export const meanClock = (minutes: readonly number[]): WallClock => {
  if (!minutes.length) return { hour: 0, minute: 0, minutes: 0 }
  const n = minutes.length
  const cos = minutes.reduce((sum, m) => sum + Math.cos((m / 1440) * 2 * Math.PI), 0) / n
  const sin = minutes.reduce((sum, m) => sum + Math.sin((m / 1440) * 2 * Math.PI), 0) / n
  let mean = (Math.atan2(sin, cos) * 1440) / (2 * Math.PI)
  if (mean < 0) mean += 1440
  const rounded = Math.round(mean) % 1440
  return { hour: Math.floor(rounded / 60), minute: rounded % 60, minutes: rounded }
}

