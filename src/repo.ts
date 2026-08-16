import type { Context } from 'koishi'

import {
  awake,
  mkDurationMin,
  NewSleepRecord,
  Phase,
  sleeping,
  SleepRecord,
  Source,
  Timestamp,
  unSource,
  unTimestamp,
  unUserId,
  UserId,
} from './domain'
import {
  Either,
  left,
  matchW,
  none,
  Option,
  pipe,
  right,
  RTE,
  some,
} from './fp'

export type Db = Context['database']

export type DbEnv = { readonly db: Db }

export type RepoError =
  | { readonly _tag: 'OPEN_EXISTS' }
  | { readonly _tag: 'NOTHING_TO_CLOSE' }
  | { readonly _tag: 'DB_ERROR'; readonly cause: unknown }

export interface SleepRepo {
  readonly phase: (userId: UserId) => RTE<DbEnv, RepoError, Phase>
  readonly open: (input: NewSleepRecord) => RTE<DbEnv, RepoError, SleepRecord>
  readonly close: (userId: UserId, at: Timestamp) => RTE<DbEnv, RepoError, Option<SleepRecord>>
  readonly rank: (from: Source, start: Timestamp, end: Timestamp) => RTE<DbEnv, RepoError, number>
  readonly saveDailyReminder: (userId: UserId, dayKey: string) => RTE<DbEnv, RepoError, void>
  readonly getDailyReminder: (userId: UserId, dayKey: string) => RTE<DbEnv, RepoError, boolean>
  readonly recordsInRange: (userId: UserId, start: Timestamp, end: Timestamp) => RTE<DbEnv, RepoError, readonly SleepRecord[]>
  readonly findOpen: (userId: UserId) => RTE<DbEnv, RepoError, Option<SleepRecord>>
  readonly latestClosed: (userId: UserId) => RTE<DbEnv, RepoError, Option<SleepRecord>>
  readonly hasRecords: (userId: UserId) => RTE<DbEnv, RepoError, boolean>
}

const toDbError = (cause: unknown): RepoError => ({ _tag: 'DB_ERROR', cause })

const query = <A>(thunk: (env: DbEnv) => Promise<A>): RTE<DbEnv, RepoError, A> =>
  RTE.tryCatch(thunk, toDbError)

const firstOf = <A>(rows: readonly A[]): Option<A> => rows.length ? some(rows[0]) : none

const withTx = <A>(thunk: (db: Db) => Promise<Either<RepoError, A>>): RTE<DbEnv, RepoError, Either<RepoError, A>> =>
  RTE.tryCatch(({ db }) => new Promise<Either<RepoError, A>>((resolve, reject) => {
    let done = false
    let result: Either<RepoError, A> | undefined
    db.withTransaction(async (tx) => {
      result = await thunk(tx)
      done = true
    }).then(
      () => {
        if (done && result) resolve(result)
        else reject(new Error('transaction did not produce a result'))
      },
      reject,
    )
  }), toDbError)

const findOpenRows = (db: Db, userId: number) =>
  db.get('sleep_record', {
    userId,
    wakeTime: null as never,
  }, { sort: { sleepTime: 'desc' }, limit: 1 })

const findOpenTask = (userId: UserId): RTE<DbEnv, RepoError, Option<SleepRecord>> =>
  pipe(
    query(({ db }) => findOpenRows(db, unUserId(userId))),
    RTE.map(firstOf),
  )

export const makeSqliteRepo = (db: Db): SleepRepo => {
  const findOpen = (userId: UserId) => findOpenTask(userId)

  const phase = (userId: UserId): RTE<DbEnv, RepoError, Phase> =>
    pipe(
      findOpen(userId),
      RTE.map((open) => matchW(open, () => awake, () => sleeping)),
    )

  const open = (input: NewSleepRecord): RTE<DbEnv, RepoError, SleepRecord> =>
    pipe(
      withTx(async (tx) => {
        const existing = await findOpenRows(tx, unUserId(input.userId))
        if (existing.length) return left<RepoError, SleepRecord>({ _tag: 'OPEN_EXISTS' })
        const at = unTimestamp(input.at)
        const created = await tx.create('sleep_record', {
          userId: unUserId(input.userId),
          sleepTime: at,
          wakeTime: null,
          durationMin: null,
          quality: null,
          platform: input.platform,
          from: unSource(input.from),
          createdAt: at,
        })
        return right<RepoError, SleepRecord>(created)
      }),
      RTE.chain((result) => RTE.fromEither(result)),
    )

  const close = (userId: UserId, at: Timestamp): RTE<DbEnv, RepoError, Option<SleepRecord>> =>
    pipe(
      withTx(async (tx) => {
        const openRows = await findOpenRows(tx, unUserId(userId))
        if (!openRows.length) return right<RepoError, Option<SleepRecord>>(none)

        const record = openRows[0]
        const wake = unTimestamp(at)
        const duration = Math.round((wake.getTime() - record.sleepTime.getTime()) / 60000)
        const result = await tx.set('sleep_record', {
          id: record.id,
          wakeTime: null as never,
        }, {
          wakeTime: wake,
          durationMin: duration,
        })

        return result.matched
          ? right<RepoError, Option<SleepRecord>>(some({
            ...record,
            wakeTime: wake,
            durationMin: mkDurationMin(duration),
          }))
          : left<RepoError, Option<SleepRecord>>({ _tag: 'NOTHING_TO_CLOSE' })
      }),
      RTE.chain((result) => RTE.fromEither(result)),
    )

  const rank = (from: Source, start: Timestamp, end: Timestamp): RTE<DbEnv, RepoError, number> =>
    pipe(
      query(({ db }) => db.get('sleep_record', {
        from: unSource(from),

        $or: [
          { sleepTime: { $gte: unTimestamp(start), $lt: unTimestamp(end) } },
          { wakeTime: { $gte: unTimestamp(start), $lt: unTimestamp(end) } },
        ],
      })),
      RTE.map((rows) => rows.length),
    )

  const saveDailyReminder = (userId: UserId, dayKey: string): RTE<DbEnv, RepoError, void> =>
    pipe(
      query(({ db }) => db.upsert('sleep_daily', [{
        userId: unUserId(userId),
        dayKey,
        reminded: true,
        createdAt: new Date(),
      }], ['userId', 'dayKey'])),
      RTE.map(() => undefined),
    )

  const getDailyReminder = (userId: UserId, dayKey: string): RTE<DbEnv, RepoError, boolean> =>
    pipe(
      query(({ db }) => db.get('sleep_daily', {
        userId: unUserId(userId),
        dayKey,
      }, { limit: 1 })),
      RTE.map((rows) => rows.length > 0),
    )

  const recordsInRange = (userId: UserId, start: Timestamp, end: Timestamp): RTE<DbEnv, RepoError, readonly SleepRecord[]> =>
    pipe(
      query(({ db }) => db.get('sleep_record', {
        userId: unUserId(userId),
        sleepTime: { $gte: unTimestamp(start), $lt: unTimestamp(end) },
      }, { sort: { sleepTime: 'asc' } })),
      RTE.map((rows) => rows as readonly SleepRecord[]),
    )

  const latestClosed = (userId: UserId): RTE<DbEnv, RepoError, Option<SleepRecord>> =>
    pipe(
      query(({ db }) => db.get('sleep_record',
        (row) => (row.wakeTime !== null) as never,
        { sort: { wakeTime: 'desc' }, limit: 1 })),
      RTE.map(firstOf),
    )

  const hasRecords = (userId: UserId): RTE<DbEnv, RepoError, boolean> =>
    pipe(
      query(({ db }) => db.get('sleep_record', {
        userId: unUserId(userId),
      }, { limit: 1 })),
      RTE.map((rows) => rows.length > 0),
    )

  return {
    phase,
    open,
    close,
    rank,
    saveDailyReminder,
    getDailyReminder,
    recordsInRange,
    findOpen,
    latestClosed,
    hasRecords,
  }
}
