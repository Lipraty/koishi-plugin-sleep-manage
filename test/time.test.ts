import assert from 'node:assert/strict'
import test from 'node:test'

import { mkDurationMin, mkTimestamp, Timezone, unTimestamp } from '../src/domain'
import { fromNullable, isRight, left, none, right, some } from '../src/fp'
import {
  formatDuration,
  isInTimeRange,
  meanClock,
  offsetHours,
  parseBedtime,
  parseTimezone,
  reportRange,
  resolveTimezone,
  summarizeRecords,
  todayRange,
  userDayKey,
  wallClock,
} from '../src/time'

const iso = (date: Date) => date.toISOString()

const tzOf = (raw: string): Timezone => {
  const parsed = parseTimezone(raw)
  assert.ok(parsed._tag === 'Right')
  return parsed.right
}

test('parseTimezone：合法值品牌化，非法值 Left', () => {
  assert.deepEqual(parseTimezone('+8'), right('+8' as never))
  assert.deepEqual(parseTimezone('-5'), right('-5' as never))
  assert.deepEqual(parseTimezone('LOCAL'), right('LOCAL' as never))
  assert.deepEqual(parseTimezone('UTC'), right('UTC' as never))
  assert.deepEqual(parseTimezone(' local '), right('LOCAL' as never))
  assert.equal(parseTimezone('+15')._tag, 'Left')
  assert.equal(parseTimezone('8')._tag, 'Left')
  assert.equal(parseTimezone('GMT')._tag, 'Left')
})

test('resolveTimezone：Option 输入 + true/number fallback，永不产生脏值', () => {
  assert.equal(resolveTimezone(fromNullable('+8'), true), '+8')
  assert.equal(resolveTimezone(fromNullable('-3'), 9), '-3')
  assert.equal(resolveTimezone(none, true), 'LOCAL')
  assert.equal(resolveTimezone(none, 8), '+8')
  assert.equal(resolveTimezone(none, -5), '-5')
  assert.equal(resolveTimezone(none, 0), '+0')
  assert.equal(resolveTimezone(fromNullable('+999'), 8), '+8')
  assert.equal(resolveTimezone(fromNullable(''), true), 'LOCAL')
})

test('offsetHours / wallClock / userDayKey', () => {
  assert.equal(offsetHours(tzOf('UTC')), 0)
  assert.equal(offsetHours(tzOf('+8')), 8)
  assert.equal(offsetHours(tzOf('-5')), -5)
  const local = offsetHours(tzOf('LOCAL'))
  assert.equal(local, -new Date().getTimezoneOffset() / 60)

  const now = new Date(Date.UTC(2026, 0, 1, 0, 30))
  assert.deepEqual(wallClock(now, tzOf('+8')), { hour: 8, minute: 30, minutes: 510 })
  assert.deepEqual(wallClock(now, tzOf('-5')), { hour: 19, minute: 30, minutes: 1170 })
  assert.equal(userDayKey(new Date(Date.UTC(2026, 0, 1, 16)), tzOf('+8')), '2026-01-02')
})

test('isInTimeRange：普通区间与跨天区间', () => {
  const clock = (h: number, m = 0) => ({ hour: h, minute: m, minutes: h * 60 + m })
  assert.equal(isInTimeRange([6, 12], clock(6)), true)
  assert.equal(isInTimeRange([6, 12], clock(12)), false)
  assert.equal(isInTimeRange([21, 3], clock(21)), true)
  assert.equal(isInTimeRange([21, 3], clock(23, 59)), true)
  assert.equal(isInTimeRange([21, 3], clock(0)), true)
  assert.equal(isInTimeRange([21, 3], clock(3)), false)
  assert.equal(isInTimeRange([21, 3], clock(20, 59)), false)
})

test('parseBedtime / formatDuration', () => {
  assert.deepEqual(parseBedtime('23:00'), some({ hour: 23, minute: 0, minutes: 1380 }))
  assert.equal(parseBedtime('24:00')._tag, 'None')
  assert.equal(parseBedtime('9:00')._tag, 'None')
  assert.deepEqual(formatDuration(mkDurationMin(490)), ['08', '10', '00'])
  assert.deepEqual(formatDuration(mkDurationMin(0)), ['00', '00', '00'])
})

test('reportRange / todayRange：以用户本地日界为边界', () => {
  const now = new Date(Date.UTC(2026, 0, 15, 0, 0))
  const tz = tzOf('+8')

  assert.equal(iso(unTimestamp(reportRange('week', now, tz).start)), '2026-01-08T16:00:00.000Z')
  assert.equal(iso(unTimestamp(reportRange('week', now, tz).end)), '2026-01-15T16:00:00.000Z')
  assert.equal(iso(unTimestamp(reportRange('month', now, tz).start)), '2025-12-31T16:00:00.000Z')
  assert.equal(iso(unTimestamp(reportRange('year', now, tz).end)), '2026-12-31T16:00:00.000Z')

  const today = todayRange(now, tz)
  assert.equal(iso(unTimestamp(today.start)), '2026-01-14T16:00:00.000Z')
  assert.equal(iso(unTimestamp(today.end)), '2026-01-15T16:00:00.000Z')
})

test('meanClock：跨午夜用圆平均', () => {
  const avg = meanClock([23 * 60 + 30, 0 * 60 + 30])
  assert.equal(avg.hour, 0)
  assert.equal(avg.minute, 0)
})

test('summarizeRecords：空/有记录的统计', () => {
  const tz = tzOf('+8')
  const record = (sleepTime: string, wakeTime: string, durationMin = 480) => ({
    id: 1,
    userId: 1,
    sleepTime: new Date(sleepTime),
    wakeTime: new Date(wakeTime),
    durationMin,
    quality: null,
    platform: 'test',
    from: 'test:g1',
    createdAt: new Date(sleepTime),
  })

  assert.equal(summarizeRecords([], tz)._tag, 'None')
  const summary = summarizeRecords([
    record('2026-01-14T14:00:00.000Z', '2026-01-14T22:00:00.000Z'),
  ], tz)
  assert.equal(summary._tag, 'Some')
  if (summary._tag === 'Some') {
    assert.equal(summary.value.count, 1)
    assert.equal(summary.value.durationHour, 8)
    assert.equal(summary.value.durationMinute, 0)
  }
})
