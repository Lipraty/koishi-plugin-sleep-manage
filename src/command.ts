import { Context } from "koishi";
import { SleepManage } from "./types";

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

  cmd.subcommand('morning', { hidden: true })
    .userFields(['id', SleepManage.User.TimeZone, SleepManage.User.EveningCount, SleepManage.User.Sleeping])
    .action(async ({ session }) => {

    })

  cmd.subcommand('evening', { hidden: true })
    .userFields(['id', SleepManage.User.TimeZone, SleepManage.User.EveningCount, SleepManage.User.Sleeping])
    .action(async ({ session }) => {

    })
}
