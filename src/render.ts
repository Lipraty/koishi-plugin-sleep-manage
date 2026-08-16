import type { Fragment } from 'koishi'

import type { DurationMin } from './domain'
import { none, Option, pipe, Reader } from './fp'
import { formatDuration } from './time'

export type ReplySlot =
  | 'frist'
  | 'normal'
  | 'count'
  | 'timer'
  | 'rank'
  | 'eveningGag'
  | 'outOfRange'

export type Period = 'morning' | 'evening'

export type ReplyPayload = {
  
  readonly period: Period
  
  readonly first: boolean
  
  readonly durationMin: Option<DurationMin>
  
  readonly rank: Option<number>
  
  readonly count: number
}

export type RenderEnv = {
  readonly i18n: (path: string, args: readonly unknown[]) => Fragment
  
  readonly random: <A>(xs: readonly A[]) => A
  readonly suffix: string
}

type FlatFragment = Extract<Fragment, readonly unknown[]>[number]

const flatten = (fragment: Fragment): FlatFragment[] =>
  Array.isArray(fragment)
    ? fragment.flatMap((item) => flatten(item))
    : [fragment]

const appendSuffix = (parts: FlatFragment[], suffix: string): Fragment =>
  suffix.length ? [...parts, suffix] : parts

const pushTimer = (env: RenderEnv, payload: ReplyPayload, base: string, parts: FlatFragment[]): void => {
  pipe(
    payload.durationMin,
    Option.matchW(
      () => undefined,
      (duration) => {
        const [hour, minute, second] = formatDuration(duration)
        parts.push(...flatten(env.i18n(`${base}.timer`, [hour, minute, second])))
        return undefined
      },
    ),
  )
}

const pushRank = (env: RenderEnv, payload: ReplyPayload, base: string, parts: FlatFragment[]): void => {
  pipe(
    payload.rank,
    Option.matchW(
      () => undefined,
      (rank) => {
        parts.push(...flatten(env.i18n(`${base}.rank`, [rank])))
        return undefined
      },
    ),
  )
}

const baseFor = (slot: ReplySlot, payload: ReplyPayload): string =>
  slot === 'eveningGag' ? 'sleep.evening-gag' : `sleep.${payload.period}`

export const renderReply = (
  slot: ReplySlot,
  payload: ReplyPayload,
): Reader<RenderEnv, Fragment> =>
  (env) => {
    const parts: FlatFragment[] = []
    const base = baseFor(slot, payload)

    switch (slot) {
      case 'frist':
        parts.push(...flatten(env.i18n(`${base}.frist`, [])))
        break
      case 'normal':
        parts.push(...flatten(env.i18n(`${base}.reply`, [])))
        pushTimer(env, payload, base, parts)
        pushRank(env, payload, base, parts)
        break
      case 'count':
        parts.push(...flatten(env.i18n('sleep.evening.count', [payload.count])))
        break
      case 'timer':
        pushTimer(env, payload, base, parts)
        break
      case 'rank':
        pushRank(env, payload, base, parts)
        break
      case 'eveningGag':
        if (payload.first) {
          parts.push(...flatten(env.i18n('sleep.evening-gag.frist', [])))
        } else {
          parts.push(...flatten(env.i18n('sleep.evening-gag.reply', [])))
          pushTimer(env, payload, 'sleep.evening-gag', parts)
          pushRank(env, payload, 'sleep.evening-gag', parts)
        }
        break
      case 'outOfRange':
        parts.push(...flatten(env.i18n(`${base}.outOfRange`, [])))
        break
      default: {
        const exhaustive: never = slot
        return exhaustive
      }
    }

    return appendSuffix(parts, env.suffix)
  }

export const replyPayload = (
  period: Period,
  first: boolean,
  durationMin: Option<DurationMin>,
  rank: Option<number>,
  count: number,
): ReplyPayload => ({ period, first, durationMin, rank, count })

export const noPayload = (period: Period): ReplyPayload =>
  replyPayload(period, false, none, none, 0)
