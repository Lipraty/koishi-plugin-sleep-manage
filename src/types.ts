import { Element } from "koishi"

declare module 'koishi' {
  interface User {
    sm_timezone: Timezone
    sm_state: SleepState
    sm_lastTransition: Date
    sm_lastSleep: Date
    sm_lastWake: Date
    sm_gag: boolean
  }

  interface Tables {
    sleep_record: SleepRecord
  }
}

export interface Config {
  suffix: string
  cooldown: number
  timezone: true | number
  autoGag: boolean
  recordFirst: boolean
  maxMulti: number
  morningRange: number[]
  eveningRange: number[]
  morningWords: string[]
  eveningWords: string[]
}

export type SMPick = 'sm_timezone' | 'sm_state' | 'sm_lastTransition' | 'sm_lastSleep' | 'sm_lastWake'

export type SleepState = 'AWAKE' | 'SLEEPING' | 'JUST_WOKE_UP' | 'JUST_SLEPT'
export type StateEvent = 'MORNING_TRIGGER' | 'EVENING_TRIGGER' | 'TIME_UPDATE'
export type StateAction =
  | { type: 'UPDATE_RECORD', record: Partial<SleepRecord> }
  | { type: 'SEND_MESSAGE', message: Element.Fragment }
  | { type: 'SET_GAG', until: number }
  | { type: 'RELEASE_GAG', }
export type StateActionByType<T> = Extract<StateAction, { type: T }>

export interface StateContext {
  userId: number
  currentState: SleepState
  timezone: Timezone
  lastTransition: Date
  lastSleepTime: Date | null
  lastWakeTime: Date | null
}

export interface TransitionResult {
  success: boolean
  fromState: SleepState
  toState: SleepState
  context: StateContext
  actions: StateAction[]
  update?: Partial<SleepRecord>
}

export interface SleepRecord {
  id: number
  userId: number
  sleepTime: Date
  wakeTime: Date | null
  duration: number | null
  quality: number | null
  platform: string
  createdAt: Date
}

export type Timezone = 'UTC' | 'LOCAL' | `-${number}` | `+${number}`
