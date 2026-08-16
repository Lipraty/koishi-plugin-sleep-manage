import {
  Config,
  DomainEvent,
  eveningTrigger,
  firstMessage,
  morningTrigger,
  Timestamp,
  unTimestamp,
} from './domain'
import { matchW, none, Option, some } from './fp'
import type { Period, ReplySlot } from './render'
import { isInTimeRange, WallClock } from './time'

export type PolicyUser = {
  readonly timezone: Option<string>
  readonly lastTrigger: Option<Date>
  readonly multiCount: number
  readonly dayKey: Option<string>
  readonly recordFirst: Option<boolean>
  readonly gagme: Option<boolean>
  
  readonly first: boolean
}

export type PolicyDecision = {
  readonly event: DomainEvent
  readonly slot: ReplySlot
  readonly multiCount: number
  readonly shouldMute: boolean
  readonly rangeOk: boolean
  
  readonly allowed: boolean
  readonly period: Period
  readonly first: boolean
  
  readonly lastTrigger: Date
}

export const hitWords = (words: readonly string[], content: string): boolean => {
  const trimmed = content.trim().toLowerCase()
  return words.some((word) => word.length > 0 && trimmed.startsWith(word.toLowerCase()))
}

export const detectTrigger = (
  content: string,
  morningWords: readonly string[],
  eveningWords: readonly string[],
): Option<Period> => {
  if (hitWords(morningWords, content)) return some('morning')
  if (hitWords(eveningWords, content)) return some('evening')
  return none
}

export const parseEvent = (
  user: PolicyUser,
  config: Config,
  clock: WallClock,
  content: string,
  today: string,
  at: Timestamp,
): Option<DomainEvent> => {
  const trimmed = content.trim()
  if (!trimmed) return none

  return matchW(
    detectTrigger(trimmed, config.morningWord, config.eveningWord),
    () => {
      const recordFirst = matchW(user.recordFirst, () => config.firstMorning, (value) => value)
      const dayKey = matchW(user.dayKey, () => '', (value) => value)
      const isFirstToday = recordFirst && dayKey !== today
      return isFirstToday && isInTimeRange(config.morningSpan, clock)
        ? some(firstMessage(at, trimmed))
        : none
    },
    (period) => some(period === 'morning' ? morningTrigger(at, trimmed) : eveningTrigger(at, trimmed)),
  )
}

const cooldownMs = (interval: number): number => Math.max(0, interval) * 3600_000

type CooldownVerdict = {
  readonly within: boolean
  readonly allowed: boolean
  readonly exceeded: boolean
  readonly multiCount: number
  readonly lastTrigger: Date
}

const cooldownVerdict = (
  user: PolicyUser,
  config: Config,
  nowMs: number,
): CooldownVerdict => {
  const lastTriggerMs = matchW(user.lastTrigger, () => undefined, (value) => value.getTime())
  const within = lastTriggerMs !== undefined && nowMs - lastTriggerMs < cooldownMs(config.interval)

  const multiCount = (within ? user.multiCount : 0) + 1
  return {
    within,
    allowed: multiCount <= config.multiTrigger,
    exceeded: multiCount > config.multiTrigger,
    multiCount,
    lastTrigger: within ? new Date(lastTriggerMs) : new Date(nowMs),
  }
}

export const decide = (
  user: PolicyUser,
  config: Config,
  clock: WallClock,
  content: string,
  event: DomainEvent,
): PolicyDecision => {
  const period: Period = event._tag === 'EVENING_TRIGGER' ? 'evening' : 'morning'
  const span = period === 'morning' ? config.morningSpan : config.eveningSpan
  const rangeOk = isInTimeRange(span, clock)
  const verdict = cooldownVerdict(user, config, unTimestamp(event.at).getTime())
  const gagme = matchW(user.gagme, () => config.gagme, (value) => value)

  const slot: ReplySlot = matchW(
    event,
    {
      MORNING_TRIGGER: () => user.first ? 'frist' : 'normal',
      EVENING_TRIGGER: () => {
        if (gagme) return 'eveningGag'
        if (user.first) return 'frist'
        return verdict.within && verdict.allowed ? 'count' : 'normal'
      },
      FIRST_MESSAGE: () => user.first ? 'frist' : 'normal',
      BEDTIME_REACHED: () => 'normal',
    },
  )

  return {
    event,
    slot,
    multiCount: verdict.multiCount,
    shouldMute: gagme && period === 'evening',
    rangeOk,
    allowed: rangeOk && verdict.allowed,
    period,
    first: user.first,
    lastTrigger: verdict.lastTrigger,
  }
}

export const currentPeriod = (config: Config, clock: WallClock): Period =>
  isInTimeRange(config.morningSpan, clock) ? 'morning' : 'evening'

