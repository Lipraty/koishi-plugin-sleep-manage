import assert from 'node:assert/strict'
import test from 'node:test'

import {
  awake,
  bedtimeReached,
  DomainEvent,
  Effect,
  eveningTrigger,
  firstMessage,
  mkDurationMin,
  mkSource,
  mkTimestamp,
  mkUserId,
  morningTrigger,
  Phase,
  privateSource,
  sleeping,
  Timestamp,
  transition,
} from '../src/domain'
import { none, some } from '../src/fp'
import { decide, PolicyDecision } from '../src/policy'

const at = mkTimestamp(new Date('2026-01-01T14:00:00.000Z'))
const gagUntil = mkTimestamp(new Date('2026-01-01T20:00:00.000Z'))
const input = {
  userId: mkUserId(42),
  from: mkSource('test:g1'),
  guildId: some('g1'),
  durationMin: some(mkDurationMin(480)),
  rank: some(3),
  gagUntil,
  muteUserId: 'u42',
}

const decisionFor = (event: DomainEvent, overrides: Partial<PolicyDecision> = {}): PolicyDecision => ({
  event,
  slot: 'normal',
  multiCount: 1,
  shouldMute: false,
  rangeOk: true,
  allowed: true,
  period: event._tag === 'EVENING_TRIGGER' ? 'evening' : 'morning',
  first: false,
  lastTrigger: new Date(),
  ...overrides,
})

const tags = (effects: readonly Effect[]) => effects.map((effect) => effect._tag)

test('迁移表：2 Phase × 4 Event 全部断言', () => {
  const events: readonly DomainEvent[] = [
    morningTrigger(at, '早安'),
    eveningTrigger(at, '晚安'),
    firstMessage(at, '第一条消息'),
    bedtimeReached(at),
  ]

  for (const event of events) {
    const result = transition(awake, event, decisionFor(event), input)
    assert.equal(result.phase._tag, event._tag === 'EVENING_TRIGGER' ? 'SLEEPING' : 'AWAKE')
    assert.equal(
      tags(result.effects).includes('OPEN_RECORD'),
      event._tag === 'EVENING_TRIGGER',
      `AWAKE × ${event._tag} 应${event._tag === 'EVENING_TRIGGER' ? '' : '不'}开记录`,
    )
    assert.equal(tags(result.effects).includes('CLOSE_RECORD'), false, `AWAKE × ${event._tag} 不应闭合`)
    assert.equal(tags(result.effects).includes('REPLY'), true, `AWAKE × ${event._tag} 应回复`)
  }

  for (const event of events) {
    const result = transition(sleeping, event, decisionFor(event), input)
    assert.equal(
      result.phase._tag,
      event._tag === 'MORNING_TRIGGER' || event._tag === 'FIRST_MESSAGE' ? 'AWAKE' : 'SLEEPING',
    )
    assert.equal(
      tags(result.effects).includes('CLOSE_RECORD'),
      event._tag === 'MORNING_TRIGGER' || event._tag === 'FIRST_MESSAGE',
      `SLEEPING × ${event._tag} 应${event._tag === 'MORNING_TRIGGER' || event._tag === 'FIRST_MESSAGE' ? '' : '不'}闭合`,
    )
    assert.equal(tags(result.effects).includes('OPEN_RECORD'), false)
    assert.equal(tags(result.effects).includes('REPLY'), true)
  }
})

test('rangeOk=false 时 transition 不产生任何效果且状态不变', () => {
  const event = eveningTrigger(at, '晚安')
  const result = transition(awake, event, decisionFor(event, { rangeOk: false }), input)
  assert.deepEqual(result, { phase: awake, effects: [] })
})

test('shouldMute 且群聊时产生 MUTE；私聊不产生', () => {
  const event = eveningTrigger(at, '晚安')
  const decision = decisionFor(event, { slot: 'eveningGag', shouldMute: true })
  const guild = transition(awake, event, decision, input)
  assert.equal(tags(guild.effects).includes('MUTE'), true)

  const direct = transition(awake, event, decision, { ...input, guildId: none, from: privateSource })
  assert.equal(tags(direct.effects).includes('MUTE'), false)
})

const baseUser = (overrides = {}) => ({
  timezone: none,
  lastTrigger: none,
  multiCount: 0,
  dayKey: none,
  recordFirst: none,
  gagme: none,
  first: false,
  ...overrides,
})

const baseConfig = {
  kuchiguse: '喵',
  gagme: false,
  timezone: true as const,
  interval: 3,
  firstMorning: true,
  multiTrigger: 3,
  gagMinutes: 360,
  morningSpan: [6, 12] as [number, number],
  eveningSpan: [21, 3] as [number, number],
  morningWord: ['早安'],
  eveningWord: ['晚安'],
}

const eveningClock = { hour: 22, minute: 0, minutes: 22 * 60 }
const morningClock = { hour: 8, minute: 0, minutes: 8 * 60 }

test('decide：首次晚安 frist，窗口内重复晚安 count，第 N 次为 multiCount+1', () => {
  const event = eveningTrigger(at, '晚安')
  const first = decide(baseUser({ first: true }), baseConfig, eveningClock, '晚安', event)
  assert.equal(first.slot, 'frist')
  assert.equal(first.allowed, true)
  assert.equal(first.multiCount, 1)

  const second = decide(baseUser({
    first: false,
    lastTrigger: some(new Date('2026-01-01T13:00:00.000Z')),
    multiCount: 1,
  }), baseConfig, eveningClock, '晚安', event)
  assert.equal(second.slot, 'count')
  assert.equal(second.allowed, true)
  assert.equal(second.multiCount, 2)
})

test('decide：multiTrigger 超出后抑制，窗口外重置计数', () => {
  const event = eveningTrigger(at, '晚安')
  const suppressed = decide(baseUser({
    lastTrigger: some(new Date('2026-01-01T13:00:00.000Z')),
    multiCount: 3,
  }), { ...baseConfig, multiTrigger: 3 }, eveningClock, '晚安', event)
  assert.equal(suppressed.allowed, false)
  assert.equal(suppressed.multiCount, 4)

  const outside = decide(baseUser({
    lastTrigger: some(new Date('2025-01-01T00:00:00.000Z')),
    multiCount: 9,
  }), baseConfig, eveningClock, '晚安', event)
  assert.equal(outside.allowed, true)
  assert.equal(outside.multiCount, 1)
})

test('decide：gagme 晚安覆盖为 eveningGag 并 shouldMute', () => {
  const event = eveningTrigger(at, '晚安')
  const gag = decide(baseUser({ gagme: some(true) }), baseConfig, eveningClock, '晚安', event)
  assert.equal(gag.slot, 'eveningGag')
  assert.equal(gag.shouldMute, true)
})

test('decide：时间窗外 rangeOk=false 且不放行', () => {
  const event = eveningTrigger(at, '晚安')
  const noon = { hour: 12, minute: 0, minutes: 12 * 60 }
  const out = decide(baseUser(), baseConfig, noon, '晚安', event)
  assert.equal(out.rangeOk, false)
  assert.equal(out.allowed, false)
})

test('parseEvent：recordFirst 只把当日第一条视为 FIRST_MESSAGE', () => {
  const user = baseUser({ recordFirst: some(true) })
  const morning = decide(user, baseConfig, morningClock, '今天天气不错', firstMessage(at, '今天天气不错'))
  assert.equal(morning.period, 'morning')
  assert.equal(morning.allowed, true)
})

