import { Context, Schema } from 'koishi'
import * as command from './command'
import * as listener from './listener'
import { SleepManage, SleepManageCommand, SleepManageListener } from './types'

declare module 'koishi' {
  interface Tables {
    'sleep-record': SleepManageListener.RecordDatabase
  }
  interface User {
    [SleepManage.UserKey.Timezone]: SleepManage.TimeZone
    [SleepManage.UserKey.FirstWake]: Date
    [SleepManage.UserKey.LastSleep]: Date
    [SleepManage.UserKey.Gag]: boolean
  }
}

export type Config = SleepManage.Config & SleepManageCommand.Config & SleepManageListener.Config

export const Config: Schema<Config> = Schema.intersect([
  listener.Config,
  command.Config,
  Schema.object({
    tolerance: Schema.number().default(3).description('睡眠间隔时间'),
    multiTrigger: Schema.number().default(1).description('多次触发间隔时间'),
  }),
]) as Schema<Config>

export const name = 'sleep-manage'

export const inject = ['database']

export function apply(ctx: Context, config: Config) {
  ctx.model.extend('user', {
    [SleepManage.UserKey.Timezone]: 'string',
    [SleepManage.UserKey.FirstWake]: 'timestamp',
    [SleepManage.UserKey.LastSleep]: 'timestamp',
    [SleepManage.UserKey.Gag]: 'boolean',
  })
  ctx.model.extend('sleep-record', {
    id: 'unsigned',
    uid: 'unsigned',
    sleep_at: 'timestamp',
    wake_at: 'timestamp',
    duration: 'integer',
    from: 'string',
    created_at: 'timestamp',
  })
  ctx.plugin(command, config)
  ctx.plugin(listener, config)
}
