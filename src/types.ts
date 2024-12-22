
export namespace SleepManage {
  export const NAME = 'sleep-manage'
  export type TimeZone = `${0 | `${'+' | '-'}${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12}`}`
  export interface Config {
    tolerance: number
    multiTrigger: number
  }
  export const enum UserKey {
    Timezone = 'sm_timezone',
    FirstWake = 'sm_first_wake',
    LastSleep = 'sm_last_sleep',
    Gag = 'sm_gagme',
  }
  export type AttachUserFields = UserKey.Timezone | UserKey.FirstWake | UserKey.LastSleep | UserKey.Gag
}

export namespace SleepManageCommand {
  export interface Config {

  }
}

export namespace SleepManageListener {
  export interface Config {
    gagme: boolean
    morningSpan: number[]
    eveningSpan: number[]
    morningWord: string[]
    eveningWord: string[]
  }
  export interface RecordDatabase {
    id: number
    uid: number
    sleep_at: Date
    wake_at: Date
    duration: number
    from: string // platform:guildId (if platform is private, guildId is user id)
    created_at: Date
  }
  export const enum TriggerPeriod {
    MORNING = 'morning',
    EVENING = 'evening',
  }
}
