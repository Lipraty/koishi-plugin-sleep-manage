import assert from 'node:assert/strict'
import test from 'node:test'

import SqliteDriver from '@minatojs/driver-sqlite'
import { Context } from 'cordis'
import { Database } from 'minato'

import {
  mkDurationMin,
  mkSource,
  mkTimestamp,
  mkUserId,
} from '../src/domain'
import { isLeft, isRight, none, RTE, some } from '../src/fp'
import { Db, DbEnv, makeSqliteRepo, RepoError } from '../src/repo'

type RepoTables = {
  sleep_record: {
    id?: number
    userId: number
    sleepTime: Date
    wakeTime?: Date | null
    durationMin?: number | null
    quality?: number | null
    platform: string
    from: string
    createdAt: Date
  }
  sleep_daily: {
    id?: number
    userId: number
    dayKey: string
    reminded: boolean
    createdAt: Date
  }
}

const setup = async () => {
  const ctx = new Context()
  const db = new Database<RepoTables>(ctx)
  ;(ctx as any).model = db

  const driver = new SqliteDriver(ctx as any, { path: ':memory:' })
  await driver.start()
  ;(ctx as any).set('database', { _driver: driver })

  db.extend('sleep_record', {
    id: 'unsigned',
    userId: 'unsigned',
    sleepTime: 'timestamp',
    wakeTime: { type: 'timestamp', nullable: true },
    durationMin: { type: 'unsigned', nullable: true },
    quality: { type: 'unsigned', nullable: true },
    platform: 'string',
    from: 'string(64)',
    createdAt: 'timestamp',
  }, { autoInc: true, unique: ['id'] })

  db.extend('sleep_daily', {
    id: 'unsigned',
    userId: 'unsigned',
    dayKey: 'string(10)',
    reminded: 'boolean',
    createdAt: 'timestamp',
  }, { autoInc: true, unique: ['id'] })

  const repo = makeSqliteRepo(db as unknown as Db)
  const run = async <A>(task: RTE<DbEnv, RepoError, A>) =>
    task({ db: db as unknown as Db })

  return { ctx, db, driver, repo, run }
}

test('repo：open/close/phase 状态由记录派生', async () => {
  const { driver, repo, run } = await setup()
  try {
    const phase0 = await run(repo.phase(mkUserId(42)))
    assert.ok(isRight(phase0))
    assert.deepEqual(phase0.right, { _tag: 'AWAKE' })

    const sleepTime = mkTimestamp(new Date('2026-01-01T14:00:00.000Z'))
    const createdResult = await run(repo.open({
      userId: mkUserId(42),
      at: sleepTime,
      from: mkSource('test:g1'),
      platform: 'test',
    }))
    assert.ok(isRight(createdResult))
    assert.equal(createdResult.right.sleepTime.toISOString(), '2026-01-01T14:00:00.000Z')
    assert.equal(createdResult.right.wakeTime, null)
    assert.equal(createdResult.right.from, 'test:g1')

    const duplicated = await run(repo.open({
      userId: mkUserId(42),
      at: mkTimestamp(new Date('2026-01-01T14:05:00.000Z')),
      from: mkSource('test:g1'),
      platform: 'test',
    }))
    assert.ok(isLeft(duplicated))
    assert.equal(duplicated.left._tag, 'OPEN_EXISTS')

    const phase1 = await run(repo.phase(mkUserId(42)))
    assert.ok(isRight(phase1))
    assert.deepEqual(phase1.right, { _tag: 'SLEEPING' })

    const wake = mkTimestamp(new Date('2026-01-01T23:00:00.000Z'))
    const closed = await run(repo.close(mkUserId(42), wake))
    assert.ok(isRight(closed))
    assert.deepEqual(closed.right, some({
      id: 1,
      userId: 42,
      sleepTime: new Date('2026-01-01T14:00:00.000Z'),
      wakeTime: new Date('2026-01-01T23:00:00.000Z'),
      durationMin: mkDurationMin(540),
      quality: null,
      platform: 'test',
      from: 'test:g1',
      createdAt: new Date('2026-01-01T14:00:00.000Z'),
    }))

    const closedAgain = await run(repo.close(mkUserId(42), wake))
    assert.ok(isRight(closedAgain))
    assert.deepEqual(closedAgain.right, none)
  } finally {
    await driver.stop()
  }
})

test('repo：latestClosed / hasRecords 查询', async () => {
  const { driver, repo, run } = await setup()
  try {
    const noneYet = await run(repo.latestClosed(mkUserId(42)))
    assert.ok(isRight(noneYet))
    assert.deepEqual(noneYet.right, none)

    const noHistory = await run(repo.hasRecords(mkUserId(42)))
    assert.ok(isRight(noHistory))
    assert.equal(noHistory.right, false)

    assert.ok(isRight(await run(repo.open({
      userId: mkUserId(42),
      at: mkTimestamp(new Date('2026-01-01T14:00:00.000Z')),
      from: mkSource('private'),
      platform: 'test',
    }))))
    assert.ok(isRight(await run(repo.close(mkUserId(42), mkTimestamp(new Date('2026-01-01T23:00:00.000Z'))))))

    const closed = await run(repo.latestClosed(mkUserId(42)))
    assert.ok(isRight(closed))
    assert.equal(closed.right._tag, 'Some')
    if (closed.right._tag === 'Some') {
      assert.equal(closed.right.value.wakeTime!.toISOString(), '2026-01-01T23:00:00.000Z')
    }

    const history = await run(repo.hasRecords(mkUserId(42)))
    assert.ok(isRight(history))
    assert.equal(history.right, true)
  } finally {
    await driver.stop()
  }
})

test('repo：rank 按 from 与时间区间统计记录数', async () => {
  const { driver, repo, run } = await setup()
  try {
    const sleep = (id: number, time: string, from: string) => repo.open({
      userId: mkUserId(id),
      at: mkTimestamp(new Date(time)),
      from: mkSource(from),
      platform: 'test',
    })

    assert.ok(isRight(await run(sleep(1, '2026-01-01T14:00:00.000Z', 'test:g1'))))
    assert.ok(isRight(await run(sleep(2, '2026-01-01T15:00:00.000Z', 'test:g1'))))
    assert.ok(isRight(await run(sleep(3, '2026-01-01T16:00:00.000Z', 'test:g2'))))

    const rank = await run(repo.rank(
      mkSource('test:g1'),
      mkTimestamp(new Date('2026-01-01T00:00:00.000Z')),
      mkTimestamp(new Date('2026-01-02T00:00:00.000Z')),
    ))
    assert.ok(isRight(rank))
    assert.equal(rank.right, 2)
  } finally {
    await driver.stop()
  }
})

test('repo：dailyReminder upsert 与查询', async () => {
  const { driver, repo, run } = await setup()
  try {
    assert.ok(isRight(await run(repo.saveDailyReminder(mkUserId(42), '2026-01-01'))))
    assert.ok(isRight(await run(repo.saveDailyReminder(mkUserId(42), '2026-01-01'))))

    const yes = await run(repo.getDailyReminder(mkUserId(42), '2026-01-01'))
    assert.ok(isRight(yes))
    assert.equal(yes.right, true)

    const no = await run(repo.getDailyReminder(mkUserId(42), '2026-01-02'))
    assert.ok(isRight(no))
    assert.equal(no.right, false)
  } finally {
    await driver.stop()
  }
})

test('repo：S4 区间不重叠，后一段睡眠必须晚于前一段起床', async () => {
  const { db, driver, repo, run } = await setup()
  try {
    const openAt = (time: string) => repo.open({
      userId: mkUserId(42),
      at: mkTimestamp(new Date(time)),
      from: mkSource('private'),
      platform: 'test',
    })
    const closeAt = (time: string) => repo.close(mkUserId(42), mkTimestamp(new Date(time)))

    assert.ok(isRight(await run(openAt('2026-01-01T14:00:00.000Z'))))
    assert.ok(isRight(await run(closeAt('2026-01-01T23:00:00.000Z'))))
    assert.ok(isRight(await run(openAt('2026-01-02T14:00:00.000Z'))))
    assert.ok(isRight(await run(closeAt('2026-01-02T23:00:00.000Z'))))

    const rows = await db.get('sleep_record', { userId: 42 }, { sort: { sleepTime: 'asc' } })
    assert.equal(rows.length, 2)
    assert.ok(rows[0].wakeTime!.getTime() < rows[1].sleepTime.getTime())
  } finally {
    await driver.stop()
  }
})

test('repo：recordsInRange 按 sleepTime 过滤', async () => {
  const { driver, repo, run } = await setup()
  try {
    const open = (id: number, time: string) => repo.open({
      userId: mkUserId(id),
      at: mkTimestamp(new Date(time)),
      from: mkSource('private'),
      platform: 'test',
    })
    assert.ok(isRight(await run(open(42, '2026-01-01T14:00:00.000Z'))))
    assert.ok(isRight(await run(repo.close(mkUserId(42), mkTimestamp(new Date('2026-01-02T00:00:00.000Z'))))))
    assert.ok(isRight(await run(open(42, '2026-01-05T14:00:00.000Z'))))

    const rows = await run(repo.recordsInRange(
      mkUserId(42),
      mkTimestamp(new Date('2026-01-02T00:00:00.000Z')),
      mkTimestamp(new Date('2026-01-06T00:00:00.000Z')),
    ))
    assert.ok(isRight(rows))
    assert.equal(rows.right.length, 1)
    assert.equal(rows.right[0].sleepTime.toISOString(), '2026-01-05T14:00:00.000Z')
  } finally {
    await driver.stop()
  }
})
