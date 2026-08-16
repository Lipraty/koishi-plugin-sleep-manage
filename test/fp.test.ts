import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ap,
  bind,
  chain,
  const_,
  Either,
  flap,
  flow,
  fold,
  fromPredicate,
  identity,
  left,
  map,
  matchW,
  none,
  Option,
  orElse,
  pipe,
  right,
  RTE,
  sequence,
  some,
  tapError,
  traverse,
  tryCatch,
} from '../src/fp'

const deep = (actual: unknown, expected: unknown) => assert.deepEqual(actual, expected)

test('pipe / flow / identity / const_', () => {
  assert.equal(pipe(1, (n) => n + 1, (n) => n * 2), 4)
  assert.equal(flow((n: number) => n + 1, (n: number) => n * 2)(1), 4)
  assert.equal(identity(42), 42)
  assert.equal(const_(42)('ignored'), 42)
})

test('Option map / chain / bind / matchW / fold / orElse', () => {
  deep(map(some(1), (n) => n + 1), some(2))
  deep(map(none, (n: number) => n + 1), none)
  deep(chain(some(1), (n) => some(n + 1)), some(2))
  deep(chain(none, (n: number) => some(n)), none)
  deep(bind(some(1), 'n', (n) => n + 1), some({ n: 2 }))
  assert.equal(matchW(some(1), () => 0, (n) => n), 1)
  assert.equal(fold(none, () => 0, (n: number) => n), 0)
  deep(orElse(none, () => some(9)), some(9))
  deep(orElse(some(1), () => some(9)), some(1))
})

test('Either map / chain / bind / matchW / fold / orElse / tapError / fromPredicate / tryCatch', () => {
  const err = left('boom')
  deep(map(right(1), (n) => n + 1), right(2))
  deep(map(err, (n: number) => n + 1), err)
  deep(chain(right(1), (n) => right(n + 1)), right(2))
  deep(chain(err, (n: number) => right(n)), err)
  deep(bind(right(1), 'n', (n) => n + 1), right({ n: 2 }))
  assert.equal(matchW(right(1), (e: string) => e, (n) => n), 1)
  assert.equal(fold(left('x'), (e) => e.toUpperCase(), (n: number) => String(n)), 'X')
  deep(orElse(left('x'), (e) => right(e.length)), right(1))
  let tapped: string | undefined
  deep(tapError(err, (e) => { tapped = e }), err)
  assert.equal(tapped, 'boom')
  deep(fromPredicate((n: number) => n > 0, (n) => `bad:${n}`)(-1), left('bad:-1'))
  deep(fromPredicate((n: number) => n > 0, (n) => `bad:${n}`)(1), right(1))
  deep(tryCatch(() => JSON.parse('{"a":1}'), (cause) => String(cause)), right({ a: 1 }))
  assert.equal(tryCatch(() => JSON.parse('{'), (cause) => String(cause))._tag, 'Left')
})

test('ap / flap / traverse / sequence', () => {
  deep(ap(some(2))(some((n: number) => n * 3)), some(6))
  deep(ap(none)(some((n: number) => n * 3)), none)
  deep(flap(2)(some((n: number) => n * 3)), some(6))
  deep(Either.flap(2)(left<string, (value: number) => number>('x')), left('x'))

  deep(traverse([1, 2, 3], (n) => some(n * 2)), some([2, 4, 6]))
  deep(traverse([1, 2, 3], (n) => n === 2 ? none : some(n)), none)
  deep(sequence([some(1), some(2)]), some([1, 2]))
  deep(sequence([some(1), none]), none)

  deep(traverse([1, 2], (n) => right(n + 1)), right([2, 3]))
  deep(traverse([1, 2], (n) => n === 2 ? left('x') : right(n)), left('x'))
  deep(sequence([right(1), right(2)]), right([1, 2]))
})

test('RTE.of / ask / asks / map / chain / bind / fold / orElse / tapError / tryCatch', async () => {
  type Env = { n: number }

  const env: Env = { n: 3 }
  deep(await RTE.of(1)(env), right(1))
  deep(await RTE.ask<Env>()(env), right(env))
  deep(await RTE.asks((e: Env) => e.n)(env), right(3))

  const doubled = pipe(RTE.of(2), RTE.map((n: number) => n * 2))
  deep(await doubled(env), right(4))

  const chained = pipe(RTE.of(2), RTE.chain((n) => RTE.of(n + 1)))
  deep(await chained(env), right(3))

  const recovered = pipe(
    RTE.left<string, number>('x'),
    RTE.orElse((e) => RTE.of(e.length)),
  )
  deep(await recovered(env), right(1))

  let tapped: string | undefined
  const tappedTask = pipe(RTE.left<string, number>('x'), RTE.tapError((e) => { tapped = e }))
  deep(await tappedTask(env), left('x'))
  assert.equal(tapped, 'x')

  deep(await RTE.tryCatch(async () => JSON.parse('{"ok":1}'), (cause) => String(cause))(env), right({ ok: 1 }))
  assert.equal((await RTE.tryCatch(async () => JSON.parse('{'), (cause) => String(cause))(env))._tag, 'Left')

  deep(
    await pipe(RTE.left<string, number>('x'), RTE.fold((e) => e, (n) => String(n)))(env),
    'x',
  )
  deep(
    await pipe(RTE.left<string, number>('x'), RTE.matchW((e) => e, (n) => String(n)))(env),
    'x',
  )
})

test('RTE.Do + bind 逐步累积对象', async () => {
  type Env = { n: number }
  const env: Env = { n: 3 }

  const task = pipe(
    RTE.of<Env, never, {}>({}),
    RTE.bind('phase', () => RTE.of('AWAKE' as const)),
    RTE.bind('clock', ({ phase }) => RTE.of(phase === 'AWAKE' ? 8 : 23)),
    RTE.bind('total', ({ clock }) => RTE.of(clock + env.n)),
  )

  deep(await task(env), right({ phase: 'AWAKE', clock: 8, total: 11 }))
})

test('RTE traverse / sequence 顺序执行', async () => {
  const order: number[] = []
  const task = RTE.traverse([1, 2, 3], (n) => pipe(
    RTE.tryCatch(async () => { order.push(n); return n * 10 }, () => 'x'),
  ))
  deep(await task({}), right([10, 20, 30]))
  deep(order, [1, 2, 3])

  deep(await RTE.sequence([RTE.of(1), RTE.of(2)])({}), right([1, 2]))
})

test('命名空间形态：Option / Either 的 pipe 友好组合子', () => {
  deep(pipe(some(1), Option.map((n: number) => n + 1)), some(2))
  deep(pipe(some(1), Option.chain((n) => some(n + 1))), some(2))
  deep(pipe(right(1), Either.map((n: number) => n + 1)), right(2))
  deep(pipe(right(1), Either.chain((n) => right(n + 1))), right(2))
  deep(pipe(some(1), Option.matchW(() => 0, (n) => n)), 1)
  deep(pipe(right(1), Either.fold((e: string) => e, (n) => String(n))), '1')
})
