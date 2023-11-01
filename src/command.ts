import { Command, Context } from "koishi";
import { SleepManage } from "./types";
import { getTimeByTZ } from "./utils";

export function apply(ctx: Context, config: SleepManage.Config) {
  const cmd = ctx.command('sleep')
    .option('timezone', '-t <tz:number>')
    .option('week', '-w')
    .option('month', '-m')
    .option('year', '-y')
    .userFields(['id', SleepManage.User.TimeZone, SleepManage.User.EveningCount, SleepManage.User.Sleeping])
    .action(async ({ session, options }) => {
      if (options.timezone >= -12 || options.timezone <= 12) {
        session.user.timezone = options.timezone
        session.send(session.text('sleep.timezone.done', [config.kuchiguse, `${options.timezone >= 0 ? '+' + options.timezone : options.timezone}`]))
      }

      if (Object.keys(options).length <= 0) {

      }
    })

  withSubcommand(cmd, 'morning', config,true)
    .action(async ({ session }) => {
      session.user[SleepManage.User.Sleeping] = false
    })

  withSubcommand(cmd, 'evening', config,true)
    .action(async ({ session }) => {
      session.user[SleepManage.User.Sleeping] = true
      session.user[SleepManage.User.EveningCount]++
    })
}

function withSubcommand(cmd: Command, sub: string, config: SleepManage.Config, hidden = false) {
  return cmd.subcommand(`.${sub}`, { hidden })
    .userFields(['id', SleepManage.User.TimeZone, SleepManage.User.EveningCount, SleepManage.User.Sleeping])
    .before(async ({ session, options }) => {
      const now = getTimeByTZ(session.user[SleepManage.User.TimeZone] || config.timezone === true ? new Date().getTimezoneOffset() / -60 : config.timezone)
      
    })
}
