import { Context, Schema, Session } from 'koishi'

import { StateEvent, SleepState, Config as TConfig, StateContext, TransitionResult, SMPick, Timezone, StateAction, StateActionByType } from './types'
import { SleepManageDefault } from './default'
import { cond, is, match } from './utils'
import { calcDuration, isInTimeRange, toUserLocalTime } from './service'

export const name = 'sleep-manage'
export const inject = ['database']

export const Config: Schema<TConfig> = Schema.object({
  suffix: Schema.string().default(SleepManageDefault.Suffix),
  autoGag: Schema.boolean().default(SleepManageDefault.AutoGag),
  timezone: Schema.union([
    Schema.number().min(-12).max(12),
    Schema.const(true),
  ]).default(SleepManageDefault.Timezone),
  cooldown: Schema.number().min(0).max(6).default(SleepManageDefault.Cooldown),
  recordFirst: Schema.boolean().default(SleepManageDefault.RecordFirst),
  maxMulti: Schema.number().min(3).max(114514).default(SleepManageDefault.MaxMulti),
  morningRange: Schema.tuple([Schema.number().min(0).max(12), Schema.number().min(0).max(12)]).default(SleepManageDefault.MorningRange),
  eveningRange: Schema.tuple([Schema.number().min(12).max(23), Schema.number().min(0).max(23)]).default(SleepManageDefault.EveningRange),
  morningWords: Schema.array(String).default(SleepManageDefault.MorningWords),
  eveningWords: Schema.array(String).default(SleepManageDefault.EveningWords),
})

export function apply(ctx: Context, config: TConfig) {
  const isMorning = (content: string) =>
    config.morningWords.includes(content)
  const isEvening = (content: string) =>
    config.eveningWords.includes(content)
  const stateMachine = createStateMachine(ctx, config)

  ctx.model.extend('user', {
    sm_timezone: 'string(5)',
    sm_state: 'string(20)',
    sm_lastTransition: 'timestamp',
    sm_lastSleep: 'timestamp',
    sm_lastWake: 'timestamp',
    sm_gag: 'boolean',
  })

  ctx.model.extend('sleep_record', {
    id: 'unsigned',
    userId: 'unsigned',
    sleepTime: 'timestamp',
    wakeTime: 'timestamp',
    duration: 'unsigned',
    quality: 'unsigned',
    platform: 'string',
    createdAt: 'timestamp',
  }, {
    autoInc: true,
    unique: ['id'],
  })

  ctx.before('attach-user', (_, fields) => {
    fields.add('id')
    fields.add('sm_timezone')
    fields.add('sm_state')
    fields.add('sm_lastTransition')
    fields.add('sm_lastSleep')
    fields.add('sm_lastWake')
  })

  ctx.middleware(async (session: Session<'id' | SMPick>, next) => {
    const content = session.content.trim()
    const {
      id: userId,
      sm_state,
      sm_timezone,
      sm_lastTransition,
      sm_lastSleep: lastSleepTime,
      sm_lastWake: lastWakeTime,
    } = session.user

    const currentContext = {
      userId,
      currentState: sm_state || 'AWAKE',
      timezone: sm_timezone || (config.timezone.toString().startsWith('+') ? config.timezone : `+${config.timezone}`) as Timezone,
      lastTransition: sm_lastTransition || new Date(),
      lastSleepTime,
      lastWakeTime
    }

    return await cond([
      [isMorning, () => stateMachine('MORNING_TRIGGER', currentContext, session)],
      [isEvening, () => stateMachine('EVENING_TRIGGER', currentContext, session)],
      [() => true, () => next()],
    ])(content)
  })


}

const createStateMachine = (ctx: Context, config: TConfig) => {
  return async (event: StateEvent, context: StateContext, session: Session<'id' | SMPick>) => {
    // rule handle
    const result = cond<StateEvent, TransitionResult>([
      [is('MORNING_TRIGGER'), () => {
        const userLocalTime = toUserLocalTime(new Date(), context.timezone)

        if (!isInTimeRange(config.morningRange as [number, number], userLocalTime)) {
          return {
            success: false,
            context,
            fromState: context.currentState,
            toState: context.currentState,
            actions: [],
          }
        }

        if (context.currentState === 'SLEEPING') {
          const duration = calcDuration(context.lastSleepTime!, userLocalTime)

          return {
            success: true,
            fromState: 'SLEEPING',
            toState: 'JUST_WOKE_UP',
            context: {
              ...context,
              currentState: 'JUST_WOKE_UP',
              lastTransition: new Date(),
              lastWakeTime: userLocalTime,
            },
            actions: [
              {
                type: 'UPDATE_RECORD',
                record: {
                  userId: context.userId,
                  wakeTime: userLocalTime,
                  duration
                }
              },
              {
                type: 'SEND_MESSAGE',
                message: 'Good morning!'
              },
            ]
          }
        } else {
          return {
            success: true,
            fromState: context.currentState,
            toState: 'AWAKE',
            context: {
              ...context,
              lastWakeTime: userLocalTime
            },
            actions: [{
              type: 'SEND_MESSAGE',
              message: `Good morning`
            }]
          }
        }
      }],
      [is('EVENING_TRIGGER'), () => {
        const userLocalTime = toUserLocalTime(new Date(), context.timezone)

        if (!isInTimeRange(config.eveningRange as [number, number], userLocalTime)) {
          return {
            success: false,
            context,
            fromState: context.currentState,
            toState: context.currentState,
            actions: [],
          }
        }

        // reduction
        const timeLast = Date.now() - context.lastTransition.getTime()
        if (timeLast < config.cooldown * 60 * 60 * 1000) {
          return {
            success: false,
            context,
            fromState: context.currentState,
            toState: context.currentState,
            actions: [],
          }
        }

        if (context.currentState === 'AWAKE') {
          return {
            success: true,
            fromState: 'AWAKE',
            toState: 'JUST_SLEPT',
            context: {
              ...context,
              currentState: 'JUST_SLEPT',
              lastTransition: new Date(),
              lastSleepTime: userLocalTime
            },
            actions: [
              {
                type: 'UPDATE_RECORD',
                record: {
                  userId: context.userId,
                  sleepTime: userLocalTime
                }
              },
              {
                type: 'SEND_MESSAGE',
                message: 'Good evening!'
              },
            ]
          }
        } else {
          return {
            success: true,
            fromState: context.currentState,
            toState: 'SLEEPING',
            context: {
              ...context,
              lastSleepTime: userLocalTime
            },
            actions: [
              {
                type: 'SEND_MESSAGE',
                message: 'Good evening!'
              },
            ]
          }
        }
      }],
    ])(event)

    // state transition
    if (result.success) {
      await ctx.database.upsert('user', [{
        id: context.userId,
        sm_state: result.context.currentState,
        sm_lastTransition: result.context.lastTransition,
        sm_lastSleep: result.context.lastSleepTime,
        sm_lastWake: result.context.lastWakeTime,
      }], ['id'])
    }

    for (const action of result.actions) {
      await handleAction(ctx, action, context, session)
    }
  }
}

const handleAction = async (ctx: Context, action: StateAction, context: StateContext, session: Session) => {
  const { send, event, bot } = session
  return await match<StateAction, 'type', Promise<void>>('type', {
    'UPDATE_RECORD': async ({ record }) => {
      await ctx.database.upsert('sleep_record', [{
        ...record,
        createdAt: new Date(),
      }])
    },
    'SEND_MESSAGE': async ({ message }) => {
      send(message)
    },
    'SET_GAG': async ({ until }) => {
      if (!event?.guild) return
      bot.muteGuildMember(event.guild.id, event.user.id, until)
    },
    'RELEASE_GAG': async () => {
      // TODO
    },
  })(action)
}
