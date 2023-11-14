import { $, Bot, Command, Context } from "koishi"
import { SleepManage } from "./types"
import { genUTCHours, getTimeByTZ, timerFormat } from "./utils"

export function apply(ctx: Context, config: SleepManage.Config) {
  const getHours = (userTZ: number, time: number) => genUTCHours(getTimeByTZ(userTZ || config.timezone === true ? new Date().getTimezoneOffset() / -60 : config.timezone).getTime(), time)

  const root = ctx.command('sleep')
    .option('timezone', '-t <tz:number>')
    .userFields(['id', SleepManage.User.TimeZone, SleepManage.User.EveningCount, SleepManage.User.Sleeping])
    .action(async ({ session, options }) => {
      if (options.timezone >= -12 || options.timezone <= 12) {
        session.user.timezone = options.timezone
        session.send(session.text('sleep.timezone.done', [config.kuchiguse, `${options.timezone >= 0 ? '+' + options.timezone : options.timezone}`]))
      }

      if (Object.keys(options).length <= 0) {

      }
    })

  root.subcommand('.auto')
    .userFields([SleepManage.User.FirstMorning])
    .action(async ({ session }) => {
      session.user[SleepManage.User.FirstMorning] = true
      session.send(session.text('.done', [config.kuchiguse]))
    })

  root.subcommand('.gagme')
    .option('off', '-x')
    .option('on', '-o')
    .userFields([SleepManage.User.Gag])
    .action(async ({ session }) => {
      session.user[SleepManage.User.Gag] = true
      session.send(session.text('.done', [config.kuchiguse]))
    })

  ctx.guild().command('sleep.rank')
    .action(async ({ session }) => {
      const { T } = session.$sleep
      const { platform, guildId } = session
      const rank = await ctx.database.select('sleep_manage_v2', {
        messageAt: { $gte: T.start, $lte: T.end },
        from: `${platform}:${guildId}`
      }).execute(row => $.count(row.id))
      session.send(session.text('.rank', [config.kuchiguse, rank]))
    })

  withTriggerByMiddleCommand(root, 'morning', config, true)
    .before(async ({ session }) => {
      session.user[SleepManage.User.Sleeping] = false
      session.user[SleepManage.User.EveningCount] = 0

      session.$sleep.period = 'morning'
    })

  withTriggerByMiddleCommand(root, 'evening', config, true)
    .before(async ({ session }) => {
      session.user[SleepManage.User.Sleeping] = true
      session.user[SleepManage.User.EveningCount]++

      if (session.user[SleepManage.User.Gag]){
        // mute 6 hours
        await session.bot.muteGuildMember(session.guildId, session.userId, 21600, 'sleep-manage: gag!')
        session.$sleep.period = 'evening-gag'
      } else {
        session.$sleep.period = 'evening'
      }
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
