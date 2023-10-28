import { Observed } from "koishi"

declare module 'koishi' {
  interface Tables {
    sleep_manage_v2: SleepManage.Database
  }
  interface User {
    [SleepManage.User.TimeZone]: number
    [SleepManage.User.EveningCount]: number
    [SleepManage.User.Sleeping]: boolean
  }

  interface Session {
    sleepField: Observed<SleepManage.Fields>
  }
}

export namespace SleepManage {
  export const NAME = 'sleep-manage'

  export interface Config {
    kuchiguse: string
    interval: number
    timezone: true | number
    command: boolean
    morning: boolean
    toomany: number
    morningSpan: number[]
    eveningSpan: number[]
    morningPet: string[]
    eveningPet: string[]
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

  export const enum User {
    TimeZone = 'timezone',
    EveningCount = 'eveningCount',
    Sleeping = 'sleeping'
  }

  export type DKeys = keyof Database
}

export type Peiod = 'morning' | 'evening'

export interface TimeSpan {
  morningStart: number
  morningEnd: number
  eveningStart: number
  eveningEnd: number
  start: number
  end: number
}
