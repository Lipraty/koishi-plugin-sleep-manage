import { Command, Context } from "koishi";
import { SleepManage } from "./types";
import { getTimeByTZ, timerFormat } from "./utils";


interface ResultMessagerProps {
  first: boolean
  period: 'morning' | 'evening'
  calcTime: number
  rank?: number
  isDirect?: boolean
}

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

  withSubcommand(cmd, 'morning', config, true)
    .action(async ({ session, options }) => {
      session.user[SleepManage.User.Sleeping] = false
      const calcTime = 0

      return <ResultMessager 
      first={options.first} 
      period="morning" 
      calcTime={calcTime} 
      rank={options.rank ?? 0}/>
    })

  withSubcommand(cmd, 'evening', config, true)
    .action(async ({ session, options }) => {
      session.user[SleepManage.User.Sleeping] = true
      session.user[SleepManage.User.EveningCount]++
      const calcTime = 0

      return <ResultMessager 
      first={options.first} 
      period="evening" 
      calcTime={calcTime} 
      rank={options.rank ?? 0}/>
    })
}

function withSubcommand(cmd: Command, sub: string, config: SleepManage.Config, hidden = false) {
  return cmd.subcommand(`.${sub}`, { hidden })
    .userFields(['id', SleepManage.User.TimeZone, SleepManage.User.EveningCount, SleepManage.User.Sleeping])
    .option('rank', '-r <rank:number>')
    .option('first', '-f')
    .before(async ({ session, options }) => {
      const now = getTimeByTZ(session.user[SleepManage.User.TimeZone] || config.timezone === true ? new Date().getTimezoneOffset() / -60 : config.timezone)

    })
}

function ResultMessager({ first, period, calcTime, rank, isDirect }: ResultMessagerProps) {
  return (<message>{
    first
      ? <text period={period} path={'first'}></text>
      : <>
        <text period={period} path={'reply'}></text>
        <text period={period} path={'timer'} args={timerFormat(calcTime, true)}></text>
        {isDirect ?? <text period={period} path={'rank'} args={[rank]}></text>}
      </>
  }</message>)
}
