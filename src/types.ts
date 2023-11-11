import { Observed } from "koishi"

declare module 'koishi' {
  interface Tables {
    sleep_manage_v2: SleepManage.Database
  }
  interface User {
    [SleepManage.User.TimeZone]: number
    [SleepManage.User.EveningCount]: number
    [SleepManage.User.Sleeping]: boolean
    [SleepManage.User.FirstMorning]: boolean
  }

  interface Session {
    sleepField: Observed<SleepManage.Fields>
    $sleep: SleepManage.Session
  }
}

export namespace SleepManage {
  export const NAME = 'sleep-manage'

  export interface Config {
    kuchiguse: string
    interval: number
    timezone: true | number
    command: boolean
    firstMorning: boolean
    multiTrigger: number
    morningSpan: number[]
    eveningSpan: number[]
    morningWord: string[]
    eveningWord: string[]
  }

  export interface Database {
    id: number          //记录ID
    uid: number         //用户ID
    messageAt: number   //消息时间
    from: string        //消息来源: platfrom:guildId (if platform is private, guildId is user id)
  }

  export type Fields = Pick<SleepManage.Database, 'uid' | 'from'> & {
    save: boolean
    time?: number
  }

  export interface Session {
    now: number
    first: boolean
    period: Period
    startT: number
    endT: number
    T: {
      start: number
      end: number
    }
    calcTime: number
    rank?: number
  }

  export const enum User {
    TimeZone = 'timezone',
    EveningCount = 'eveningCount',
    Sleeping = 'sleeping',
    FirstMorning = 'firstMorning',
  }

  export type DKeys = keyof Database
}

export type Period = 'morning' | 'evening'

export interface TimeSpan {
  morningStart: number
  morningEnd: number
  eveningStart: number
  eveningEnd: number
  start: number
  end: number
}
