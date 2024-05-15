import { $, Context, Keys, Schema, Session, observe } from 'koishi'
import { } from '@koishijs/plugin-help'
import * as Commander from './command'
import { SleepManage } from './types'
import { getTimeByTZ, getTodaySpan } from './utils'


export const usage = require('fs').readFileSync(require.resolve('./usage.md'), 'utf8')

export const name = SleepManage.NAME

export const inject = ['database']

const reduceDay = (time: number) => time - 86400000

export function apply(ctx: Context, config: SleepManage.Config) {
  const logger = ctx.logger(SleepManage.NAME)


  ctx.i18n.define('zh', require('./locales/zh-cn'))
  //#region Database
  ctx.model.extend('user', {
    [SleepManage.User.TimeZone]: 'integer(2)',
    [SleepManage.User.EveningCount]: 'integer(2)',
    [SleepManage.User.Sleeping]: { type: 'boolean', initial: false },
    [SleepManage.User.FirstMorning]: { type: 'boolean', initial: config.firstMorning },
    [SleepManage.User.Gag]: { type: 'boolean', initial: config.gagme }
  })
  ctx.model.extend('sleep_manage_v2', {
    id: 'unsigned',
    uid: 'unsigned',
    messageAt: 'integer(14)',
    from: 'string(32)'
  }, { autoInc: true })

  ctx.before('attach-user', ({ }, filters) => {
    filters
      .add('id')
      .add(SleepManage.User.TimeZone)
      .add(SleepManage.User.EveningCount)
      .add(SleepManage.User.Sleeping)
  })

  ctx.before('attach', async (session: Session<'id' | SleepManage.User.TimeZone, 'guildId' | 'platform'>) => {
    const { id: uid } = session.user
    const timezone = session.user[SleepManage.User.TimeZone] || new Date().getTimezoneOffset() / -60
    session.sleepField = observe<SleepManage.Fields, void>({
      uid,
      from: `${session.isDirect ? 'private' : session.guild.platform}:${session.guild.guildId || session.user.id}`,
      save: false
    }, ({ save, uid, time, from }) => {
      if (save) {
        ctx.database.create('sleep_manage_v2', {
          uid,
          messageAt: time,
          from
        }).then(() => {
          logger.debug('saved: ', uid, time)
        }).catch(e => {
          logger.error('Error: ', e)
        })
      }
    })
  })
  //#endregion

  ctx.on('ready', () => {
    // loop by half-day
    ctx.setInterval(async () => {

    }, 43200000)
  })

  ctx.plugin(Commander, config)

  function getData(uid: number, start: number, end: number): Promise<Pick<SleepManage.Database, Keys<SleepManage.Database, any>>[]> {
    return ctx.database.get('sleep_manage_v2', {
      uid,
      messageAt: { $gte: start, $lte: end }
    })
  }

  ctx.middleware(async ({ content, isDirect, platform, guildId, user, $sleep, sleepField, execute }: Session<SleepManage.User | 'id'>, next) => {
    const nowTime = getTimeByTZ(config.timezone === true ? new Date().getTimezoneOffset() / -60 : config.timezone).getTime()
    const {
      morningStart, morningEnd,
      eveningStart, eveningEnd,
      start: startTime, end: endTime
    } = getTodaySpan(nowTime, {
      morningStart: config.morningSpan[0],
      morningEnd: config.morningSpan[1],
      eveningStart: config.eveningSpan[0],
      eveningEnd: config.eveningSpan[1],
    })
    const userLoggerBefore: SleepManage.Database[] = await getData(user.id, reduceDay(startTime), reduceDay(endTime))
    const userLoggerToDay: SleepManage.Database[] = await getData(user.id, startTime, endTime)

    $sleep.first = userLoggerBefore.length <= 0
    $sleep.rank = isDirect ? -1 : await ctx.database.select('sleep_manage_v2', {
      messageAt: { $gte: startTime, $lte: endTime },
      from: `${platform}:${guildId}`
    }).execute(row => $.count(row.id))
    $sleep.T = {
      start: startTime,
      end: endTime
    }

    if (nowTime >= morningStart && nowTime <= morningEnd) {
      if (userLoggerToDay.length > 0) {
        $sleep.calcTime = nowTime - userLoggerToDay[0].messageAt
      } else {
        $sleep.calcTime = nowTime - userLoggerBefore[userLoggerBefore.length - 1].messageAt
      }

      if (config.morningWord.includes(content) || (user[SleepManage.User.FirstMorning] && user[SleepManage.User.Sleeping])) {
        $sleep.now = nowTime
        $sleep.startT = morningStart
        $sleep.endT = morningEnd
        const lastEveningTimes = userLoggerBefore
          .filter(v => v.messageAt >= reduceDay(eveningStart) && v.messageAt <= reduceDay(eveningEnd))
          .sort((a, b) => b.messageAt - a.messageAt)
        if (lastEveningTimes[0].messageAt >= reduceDay(eveningStart) && lastEveningTimes[0].messageAt <= reduceDay(eveningEnd)) {
          $sleep.calcTime = nowTime - lastEveningTimes[0].messageAt
        }
        await execute(`sleep.morning`)
      }
    } else if (nowTime >= eveningStart && nowTime <= eveningEnd) {
      if (config.eveningWord.includes(content)) {
        $sleep.now = nowTime
        $sleep.startT = eveningStart
        $sleep.endT = eveningEnd
        if (userLoggerToDay.length > 0) {
          $sleep.calcTime = nowTime - userLoggerToDay[0].messageAt
        }
        await execute(`sleep.evening`)
      }
    } else {
      // TODO
      return next()
    }

    sleepField.time = nowTime
    sleepField.save = true
  })

  ctx.middleware(async ({ sleepField }) => {
    sleepField.$update()
  })
}

export const Config: Schema<SleepManage.Config> = Schema.object({
  kuchiguse: Schema.string().default('喵').description('谜之声Poi~'),
  gagme: Schema.boolean().default(false).description('给晚安的用户一个口球喵'),
  timezone: Schema.union([
    Schema.number().min(-12).max(12).description('自定义喵'),
    Schema.const(true).description('使用用户本机时区'),
  ]).default(true).description('时区喵'),
  interval: Schema.number().min(0).max(6).default(3).description('在这个时长内都是重复的喵'),
  firstMorning: Schema.boolean().default(true).description('将早安时间内的第一条消息视为早安'),
  multiTrigger: Schema.number().min(3).max(114514).default(3).description('真的重复晚安太多了喵，要骂人了喵！'),
  morningSpan: Schema.tuple([Schema.number().min(0).max(12), Schema.number().min(0).max(12)]).default([6, 12]).description('早安 响应时间范围喵'),
  eveningSpan: Schema.tuple([Schema.number().min(12).max(23), Schema.number().min(0).max(23)]).default([21, 3]).description('晚安 响应时间范围喵'),
  morningWord: Schema.array(String).default(['早', '早安', '早哇', '起床', '早上好', 'ohayo', '哦哈哟', 'お早う', 'good morning']).description('人家会响应这些早安消息哦！'),
  eveningWord: Schema.array(String).default(['晚', '晚安', '晚好', '睡觉', '晚上好', 'oyasuminasai', 'おやすみなさい', 'good evening', 'good night']).description('人家会响应这些晚安消息哦！'),
})
