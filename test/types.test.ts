import assert from 'node:assert/strict'
import test from 'node:test'

import {
  EffectByKind,
  DomainEvent,
  mkDurationMin,
  mkUserId,
  Timezone,
  Timestamp,
  UserId,
} from '../src/domain'
import { IsNever, Kind, RTE, right, some, ValueOf } from '../src/fp'
import type { ReplySlot } from '../src/render'

const kindOption: Kind<'Option', number> = some(1)
const kindEither: Kind<'Either', string> = right('x')
const kindRTE: Kind<'RTE', number> = RTE.of<never, never, number>(1)

const userId: UserId = mkUserId(1)
// @ts-expect-error 裸 number 不能冒充品牌化的 UserId
const badUserId: UserId = 1
// @ts-expect-error 'GMT' 不是合法时区值
const badTimezone: Timezone = 'GMT'
// @ts-expect-error 'typo' 不在 ReplySlot 联合中
const badSlot: ReplySlot = 'typo'

const timestamp: Timestamp = new Date() as Timestamp
const duration = mkDurationMin(480)

// @ts-expect-error 缺失 BEDTIME_REACHED 分支
const missingEventBranch = (event: DomainEvent): string => {
  switch (event._tag) {
    case 'MORNING_TRIGGER': return event.content
    case 'EVENING_TRIGGER': return event.content
    case 'FIRST_MESSAGE': return event.content
  }
}

const openEffect: EffectByKind<'OPEN_RECORD'> = {
  _tag: 'OPEN_RECORD',
  userId,
  at: timestamp,
  from: 'private',
}
const badEffect: EffectByKind<'OPEN_RECORD'> = {
  _tag: 'OPEN_RECORD',
  userId,
  at: timestamp,
  from: 'private',
  // @ts-expect-error OPEN_RECORD 不携带 slot 字段
  slot: 'normal',
}

type KindTable = ValueOf<typeof import('../src/fp').RTE>
const isNeverNever: IsNever<never> = true
const isNeverString: IsNever<string> = false

test('类型体操测试在运行期也有可触碰的锚点', () => {
  assert.deepEqual(kindOption, some(1))
  assert.deepEqual(kindEither, right('x'))
  assert.equal(userId, 1)
  assert.equal(openEffect._tag, 'OPEN_RECORD')
  assert.equal(duration, 480)
  assert.equal(missingEventBranch.length >= 0, true)
  assert.equal(isNeverNever, true)
  assert.equal(isNeverString, false)
  assert.equal(typeof kindRTE, 'function')
  assert.equal(typeof (null as unknown as KindTable), 'object')
})
