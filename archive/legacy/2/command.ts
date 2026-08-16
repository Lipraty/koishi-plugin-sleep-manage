import { Context, Schema } from 'koishi'
import { SleepManageCommand } from './types'

export const Config: Schema<SleepManageCommand.Config> = Schema.object({
  firstMorning: Schema.boolean().default(true).description('是否开启早安模式'),
  gagme: Schema.boolean().default(true).description('是否开启禁言模式'),
})

export function apply(ctx: Context) {
  // write your plugin here
}
