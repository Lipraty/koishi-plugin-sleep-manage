import { matchW, Nominal, none, Option } from './fp'
import type { PolicyDecision } from './policy'
import type { ReplyPayload } from './render'

export type UserId = Nominal<number, 'UserId'>
export type Timestamp = Nominal<Date, 'Timestamp'>
export type DurationMin = Nominal<number, 'DurationMin'>
export type TimezoneValue = 'LOCAL' | 'UTC' | `+${number}` | `-${number}`
export type Timezone = Nominal<TimezoneValue, 'Timezone'>

export const mkUserId = (id: number): UserId => id as UserId
export const unUserId = (id: UserId): number => id
export const mkTimestamp = (at: Date): Timestamp => at as Timestamp
export const unTimestamp = (at: Timestamp): Date => at
export const mkDurationMin = (minutes: number): DurationMin => minutes as DurationMin
export const unDurationMin = (minutes: DurationMin): number => minutes
export const mkTimezone = (value: TimezoneValue): Timezone => value as Timezone
export const unTimezone = (timezone: Timezone): TimezoneValue => timezone as TimezoneValue

export type Source = 'private' | Nominal<string, 'Source'>

export const privateSource: Source = 'private'

export const mkSource = (raw: string): Source => raw as Source

export const unSource = (source: Source): string => source

export type Phase =
  | { readonly _tag: 'AWAKE' }
  | { readonly _tag: 'SLEEPING' }

export const awake: Phase = { _tag: 'AWAKE' }
export const sleeping: Phase = { _tag: 'SLEEPING' }

export type DomainEvent =
  | { readonly _tag: 'MORNING_TRIGGER'; readonly at: Timestamp; readonly content: string }
  | { readonly _tag: 'EVENING_TRIGGER'; readonly at: Timestamp; readonly content: string }
  | { readonly _tag: 'FIRST_MESSAGE'; readonly at: Timestamp; readonly content: string }
  | { readonly _tag: 'BEDTIME_REACHED'; readonly at: Timestamp }

export const morningTrigger = (at: Timestamp, content: string): DomainEvent => ({ _tag: 'MORNING_TRIGGER', at, content })
export const eveningTrigger = (at: Timestamp, content: string): DomainEvent => ({ _tag: 'EVENING_TRIGGER', at, content })
export const firstMessage = (at: Timestamp, content: string): DomainEvent => ({ _tag: 'FIRST_MESSAGE', at, content })
export const bedtimeReached = (at: Timestamp): DomainEvent => ({ _tag: 'BEDTIME_REACHED', at })

export type Effect =
  | { readonly _tag: 'OPEN_RECORD'; readonly userId: UserId; readonly at: Timestamp; readonly from: Source }
  | { readonly _tag: 'CLOSE_RECORD'; readonly userId: UserId; readonly at: Timestamp }
  | { readonly _tag: 'REPLY'; readonly slot: import('./render').ReplySlot; readonly payload: ReplyPayload }
  | { readonly _tag: 'MUTE'; readonly guildId: string; readonly userId: string; readonly until: Timestamp }

export type EffectByKind<K extends Effect['_tag']> = import('./fp').EffectByKind<Effect, K>

export type Transition = {
  
  readonly phase: Phase
  readonly effects: readonly Effect[]
}

export type TransitionInput = {
  readonly userId: UserId
  readonly from: Source
  readonly guildId: Option<string>
  
  readonly durationMin: Option<DurationMin>
  readonly rank: Option<number>
  readonly gagUntil: Timestamp
  
  readonly muteUserId: string
}

export const transition = (
  phase: Phase,
  event: DomainEvent,
  decision: PolicyDecision,
  input: TransitionInput,
): Transition => {
  if (!decision.rangeOk) return { phase, effects: [] }

  const nextPhase: Phase = matchW(
    phase,
    {
      AWAKE: () => matchW(event, {
        MORNING_TRIGGER: () => phase,
        EVENING_TRIGGER: () => sleeping,
        FIRST_MESSAGE: () => phase,
        BEDTIME_REACHED: () => phase,
      }),
      SLEEPING: () => matchW(event, {
        MORNING_TRIGGER: () => awake,
        EVENING_TRIGGER: () => phase,
        FIRST_MESSAGE: () => awake,
        BEDTIME_REACHED: () => phase,
      }),
    },
  )

  const stateEffect: readonly Effect[] = matchW(
    phase,
    {
      AWAKE: () => matchW(event, {
        MORNING_TRIGGER: () => [],
        EVENING_TRIGGER: () => [{
          _tag: 'OPEN_RECORD',
          userId: input.userId,
          at: event.at,
          from: input.from,
        } as const],
        FIRST_MESSAGE: () => [],
        BEDTIME_REACHED: () => [],
      }),
      SLEEPING: () => matchW(event, {
        MORNING_TRIGGER: () => [{
          _tag: 'CLOSE_RECORD',
          userId: input.userId,
          at: event.at,
        } as const],
        EVENING_TRIGGER: () => [],
        FIRST_MESSAGE: () => [{
          _tag: 'CLOSE_RECORD',
          userId: input.userId,
          at: event.at,
        } as const],
        BEDTIME_REACHED: () => [],
      }),
    },
  )

  const replyEffects: Effect[] = decision.allowed ? [{
    _tag: 'REPLY',
    slot: decision.slot,
    payload: {
      period: decision.period,
      first: decision.first,
      durationMin: decision.first ? none : input.durationMin,
      rank: decision.first ? none : input.rank,
      count: decision.multiCount,
    } satisfies ReplyPayload,
  }] : []

  const muteEffects: Effect[] = matchW(
    input.guildId,
    () => [],
    (guildId) => decision.shouldMute && decision.allowed ? [{
      _tag: 'MUTE',
      guildId,
      userId: input.muteUserId,
      until: input.gagUntil,
    }] : [],
  )

  return { phase: nextPhase, effects: [...stateEffect, ...muteEffects, ...replyEffects] }
}

export interface SleepRecord {
  id: number
  userId: number
  sleepTime: Date
  wakeTime: Date | null
  durationMin: number | null
  quality: number | null
  platform: string
  
  from: string
  createdAt: Date
}

export interface SleepDaily {
  id: number
  userId: number
  dayKey: string
  reminded: boolean
  createdAt: Date
}

export type NewSleepRecord = {
  readonly userId: UserId
  readonly at: Timestamp
  readonly from: Source
  readonly platform: string
}

export interface Config {
  
  kuchiguse: string
  
  gagme: boolean
  
  timezone: true | number
  
  interval: number
  
  firstMorning: boolean
  
  multiTrigger: number
  
  gagMinutes: number
  morningSpan: [number, number]
  eveningSpan: [number, number]
  morningWord: string[]
  eveningWord: string[]
}

declare module 'koishi' {
  interface User {
    
    sm_timezone: string
    
    sm_bedtime: string
    
    sm_recordFirst: boolean
    
    sm_lastTrigger: Date
    
    sm_dayKey: string
    
    sm_multiCount: number
    
    sm_gagme: boolean
    
    sm_gagUntil: Date
  }

  interface Tables {
    sleep_record: SleepRecord
    sleep_daily: SleepDaily
  }
}

