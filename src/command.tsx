import { Command, Context } from "koishi";
import { SleepManage } from "./types";
import { genUTCHours, getTimeByTZ, timerFormat } from "./utils";

interface ResultMessagerProps {
  first: boolean
  period: 'morning' | 'evening'
  calcTime: number
  rank?: number
  isDirect?: boolean
}

export function apply(ctx: Context, config: SleepManage.Config) {
  const getHours = (userTZ: number, time: number) => genUTCHours(getTimeByTZ(userTZ || config.timezone === true ? new Date().getTimezoneOffset() / -60 : config.timezone).getTime(), time)

  const root = ctx.command('sleep')
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

  withTriggerByMiddleCommand(root, 'morning', config, true)
    .before(async ({ session }) => {
      session.user[SleepManage.User.Sleeping] = false
      session.user[SleepManage.User.EveningCount] = 0

      session.$sleep.period = 'morning'
      session.$sleep.calcTime = 0
    })

  withTriggerByMiddleCommand(root, 'evening', config, true)
    .before(async ({ session }) => {
      session.user[SleepManage.User.Sleeping] = true
      session.user[SleepManage.User.EveningCount]++

      session.$sleep.period = 'evening'
      session.$sleep.calcTime = 0
    })
}

function withTriggerByMiddleCommand(cmd: Command, sub: string, config: SleepManage.Config, hidden = false) {
  return cmd.subcommand(`.${sub}`, { hidden })
    .userFields(['id', SleepManage.User.TimeZone, SleepManage.User.EveningCount, SleepManage.User.Sleeping])
    .action(async ({ session }) => {
      const { first, period, calcTime, rank } = session.$sleep
      const { isDirect } = session

      await session.send(<message>{
        first
          ? <text period={period} path={'first'}></text>
          : <>
            <text period={period} path={'reply'}></text>
            <text period={period} path={'timer'} args={timerFormat(calcTime, true)}></text>
            {isDirect ?? <text period={period} path={'rank'} args={[rank]}></text>}
          </>
      }</message>)
    })
}
