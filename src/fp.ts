import type { Effect } from './domain'

export interface HKT<F, A> {}

export interface URItoKind<A> {
  readonly Option: Option<A>
  readonly Either: Either<never, A>
  readonly RTE: RTE<never, never, A>
}

export type Kind<F extends keyof URItoKind<any>, A> = URItoKind<A>[F]

export type Nominal<T, B extends PropertyKey> = T & { readonly _brand: B }

export type Brand<T, B extends PropertyKey> = T & { readonly [K in B]: never }

export type ValueOf<T> = T[keyof T]

export type EffectByKind<E extends Effect, K extends E['_tag']> = Extract<E, { readonly _tag: K }>

export type IsNever<T> = [T] extends [never] ? true : false

export type Option<A> =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Some'; readonly value: A }

export type Either<E, A> =
  | { readonly _tag: 'Left'; readonly left: E }
  | { readonly _tag: 'Right'; readonly right: A }

export type Reader<R, A> = (env: R) => A

export interface RTE<R, E, A> {
  (env: R): Promise<Either<E, A>>
}

export const none: Option<never> = { _tag: 'None' }

export const some = <A>(value: A): Option<A> => ({ _tag: 'Some', value })

export const left = <E = never, A = never>(error: E): Either<E, A> => ({ _tag: 'Left', left: error })

export const right = <E = never, A = never>(value: A): Either<E, A> => ({ _tag: 'Right', right: value })

export const isNone = <A>(fa: Option<A>): fa is Extract<Option<A>, { _tag: 'None' }> => fa._tag === 'None'

export const isSome = <A>(fa: Option<A>): fa is Extract<Option<A>, { _tag: 'Some' }> => fa._tag === 'Some'

export const isLeft = <E, A>(fa: Either<E, A>): fa is Extract<Either<E, A>, { _tag: 'Left' }> => fa._tag === 'Left'

export const isRight = <E, A>(fa: Either<E, A>): fa is Extract<Either<E, A>, { _tag: 'Right' }> => fa._tag === 'Right'

export const fromNullable = <A>(value: A | null | undefined): Option<A> =>
  value === null || value === undefined ? none : some(value)

export function pipe<A>(value: A): A
export function pipe<A, B>(value: A, ab: (value: A) => B): B
export function pipe<A, B, C>(value: A, ab: (value: A) => B, bc: (value: B) => C): C
export function pipe<A, B, C, D>(value: A, ab: (value: A) => B, bc: (value: B) => C, cd: (value: C) => D): D
export function pipe<A, B, C, D, E>(
  value: A,
  ab: (value: A) => B,
  bc: (value: B) => C,
  cd: (value: C) => D,
  de: (value: D) => E,
): E
export function pipe<A, B, C, D, E, F>(
  value: A,
  ab: (value: A) => B,
  bc: (value: B) => C,
  cd: (value: C) => D,
  de: (value: D) => E,
  ef: (value: E) => F,
): F
export function pipe<A, B, C, D, E, F, G>(
  value: A,
  ab: (value: A) => B,
  bc: (value: B) => C,
  cd: (value: C) => D,
  de: (value: D) => E,
  ef: (value: E) => F,
  fg: (value: F) => G,
): G
export function pipe<A, B, C, D, E, F, G, H>(
  value: A,
  ab: (value: A) => B,
  bc: (value: B) => C,
  cd: (value: C) => D,
  de: (value: D) => E,
  ef: (value: E) => F,
  fg: (value: F) => G,
  gh: (value: G) => H,
): H
export function pipe(value: unknown, ...fns: readonly ((input: unknown) => unknown)[]): unknown {
  return fns.reduce((acc, fn) => fn(acc), value)
}

export function flow<A, B>(ab: (value: A) => B): (value: A) => B
export function flow<A, B, C>(ab: (value: A) => B, bc: (value: B) => C): (value: A) => C
export function flow<A, B, C, D>(
  ab: (value: A) => B,
  bc: (value: B) => C,
  cd: (value: C) => D,
): (value: A) => D
export function flow<A, B, C, D, E>(
  ab: (value: A) => B,
  bc: (value: B) => C,
  cd: (value: C) => D,
  de: (value: D) => E,
): (value: A) => E
export function flow(...fns: readonly ((input: unknown) => unknown)[]): (input: unknown) => unknown {
  return (input: unknown) => fns.reduce((acc, fn) => fn(acc), input)
}

export const identity = <A>(value: A): A => value

export const const_ = <A>(value: A): <B>(input: B) => A => () => value
export const constant = const_
export const constVoid: <B>(input: B) => undefined = const_(undefined)

const isOptionValue = (value: unknown): value is Option<unknown> =>
  typeof value === 'object' && value !== null
  && '_tag' in value
  && (value._tag === 'None' || value._tag === 'Some')

const isEitherValue = (value: unknown): value is Either<unknown, unknown> =>
  typeof value === 'object' && value !== null
  && '_tag' in value
  && (value._tag === 'Left' || value._tag === 'Right')

export function map<A, B>(fa: Option<A>, f: (value: A) => B): Option<B>
export function map<E, A, B>(fa: Either<E, A>, f: (value: A) => B): Either<E, B>
export function map(fa: unknown, f: unknown): unknown {
  if (isOptionValue(fa)) {
    return fa._tag === 'None' ? none : some((f as (value: unknown) => unknown)(fa.value))
  }
  if (isEitherValue(fa)) {
    return fa._tag === 'Left' ? fa : right((f as (value: unknown) => unknown)(fa.right))
  }
  throw new Error('map: unsupported higher-kinded type')
}

export function chain<A, B>(fa: Option<A>, f: (value: A) => Option<B>): Option<B>
export function chain<E, A, B>(fa: Either<E, A>, f: (value: A) => Either<E, B>): Either<E, B>
export function chain(fa: unknown, f: unknown): unknown {
  if (isOptionValue(fa)) {
    return fa._tag === 'None' ? none : (f as (value: unknown) => Option<unknown>)(fa.value)
  }
  if (isEitherValue(fa)) {
    return fa._tag === 'Left' ? fa : (f as (value: unknown) => Either<unknown, unknown>)(fa.right)
  }
  throw new Error('chain: unsupported higher-kinded type')
}

export function bind<A, K extends string, B>(
  fa: Option<A>,
  key: K,
  f: (value: A) => B,
): Option<{ readonly [P in K]: B }>
export function bind<E, A, K extends string, B>(
  fa: Either<E, A>,
  key: K,
  f: (value: A) => B,
): Either<E, { readonly [P in K]: B }>
export function bind(fa: unknown, key: string, f: unknown): unknown {
  const wrap = (value: unknown) => ({ [key]: (f as (value: unknown) => unknown)(value) })
  if (isOptionValue(fa)) {
    return fa._tag === 'None' ? none : some(wrap(fa.value))
  }
  if (isEitherValue(fa)) {
    return fa._tag === 'Left' ? fa : right(wrap(fa.right))
  }
  throw new Error('bind: unsupported higher-kinded type')
}

export function ap<A>(fa: Option<A>): <B>(fab: Option<(value: A) => B>) => Option<B>
export function ap<E, A>(fa: Either<E, A>): <B>(fab: Either<E, (value: A) => B>) => Either<E, B>

export function ap(fa: any): (fab: any) => any {
  return (fab: unknown) => {
    if (isOptionValue(fa) && isOptionValue(fab)) {
      if (fa._tag === 'None' || fab._tag === 'None') return none
      return some((fab.value as (value: unknown) => unknown)(fa.value))
    }
    if (isEitherValue(fa) && isEitherValue(fab)) {
      if (fa._tag === 'Left') return fa
      if (fab._tag === 'Left') return fab
      return right((fab.right as (value: unknown) => unknown)(fa.right))
    }
    throw new Error('ap: unsupported higher-kinded type')
  }
}

export function flap<A>(value: A): <B>(fab: Option<(value: A) => B>) => Option<B>
export function flap<E, A>(value: A): <B>(fab: Either<E, (value: A) => B>) => Either<E, B>

export function flap(value: any): (fab: any) => any {
  return (fab: unknown) => {
    if (isOptionValue(fab)) {
      return fab._tag === 'None' ? none : some((fab.value as (value: unknown) => unknown)(value))
    }
    if (isEitherValue(fab)) {
      return fab._tag === 'Left' ? fab : right((fab.right as (value: unknown) => unknown)(value))
    }
    throw new Error('flap: unsupported higher-kinded type')
  }
}

export function traverse<A, B>(as: readonly A[], f: (value: A) => Option<B>): Option<B[]>
export function traverse<E, A, B>(as: readonly A[], f: (value: A) => Either<E, B>): Either<E, B[]>
export function traverse(as: readonly unknown[], f: unknown): unknown {
  if (as.length === 0) return some([])
  const first = (f as (value: unknown) => unknown)(as[0])
  if (isOptionValue(first)) {
    const out: unknown[] = []
    for (const value of as) {
      const next = (f as (value: unknown) => Option<unknown>)(value)
      if (next._tag === 'None') return none
      out.push(next.value)
    }
    return some(out)
  }
  if (isEitherValue(first)) {
    const out: unknown[] = []
    for (const value of as) {
      const next = (f as (value: unknown) => Either<unknown, unknown>)(value)
      if (next._tag === 'Left') return next
      out.push(next.right)
    }
    return right(out)
  }
  throw new Error('traverse: unsupported higher-kinded type')
}

export function sequence<A>(as: readonly Option<A>[]): Option<A[]>
export function sequence<E, A>(as: readonly Either<E, A>[]): Either<E, A[]>
export function sequence(as: readonly unknown[]): unknown {
  if (as.length === 0) return some([])
  const first = as[0]
  if (isOptionValue(first)) {
    const out: unknown[] = []
    for (const value of as) {
      if (!isOptionValue(value) || value._tag === 'None') return none
      out.push(value.value)
    }
    return some(out)
  }
  if (isEitherValue(first)) {
    const out: unknown[] = []
    for (const value of as) {
      if (!isEitherValue(value)) throw new Error('sequence: mixed ADT')
      if (value._tag === 'Left') return value
      out.push(value.right)
    }
    return right(out)
  }
  return some([])
}

export function matchW<A, B, C>(
  fa: Option<A>,
  onNone: () => B,
  onSome: (value: A) => C,
): B | C
export function matchW<E, A, B, C>(
  fa: Either<E, A>,
  onLeft: (error: E) => B,
  onRight: (value: A) => C,
): B | C
export function matchW<T extends { readonly _tag: PropertyKey }, R>(
  tagged: T,
  cases: { readonly [K in T['_tag']]: (value: Extract<T, { readonly _tag: K }>) => R },
): R
export function matchW(fa: unknown, ...rest: unknown[]): unknown {
  if (rest.length === 1 && typeof rest[0] === 'object' && rest[0] !== null) {
    const tagged = fa as { readonly _tag: PropertyKey }
    const cases = rest[0] as Readonly<Record<PropertyKey, (value: unknown) => unknown>>
    const run = cases[tagged._tag]
    if (!run) throw new Error('matchW: missing case')
    return run(tagged)
  }
  const [onFirst, onSecond] = rest
  if (isOptionValue(fa)) {
    return fa._tag === 'None'
      ? (onFirst as () => unknown)()
      : (onSecond as (value: unknown) => unknown)(fa.value)
  }
  if (isEitherValue(fa)) {
    return fa._tag === 'Left'
      ? (onFirst as (error: unknown) => unknown)(fa.left)
      : (onSecond as (value: unknown) => unknown)(fa.right)
  }
  throw new Error('matchW: unsupported higher-kinded type')
}

export function fold<A, B>(fa: Option<A>, onNone: () => B, onSome: (value: A) => B): B
export function fold<E, A, B>(fa: Either<E, A>, onLeft: (error: E) => B, onRight: (value: A) => B): B
export function fold(fa: unknown, onFirst: unknown, onSecond: unknown): unknown {
  if (isOptionValue(fa)) {
    return fa._tag === 'None'
      ? (onFirst as () => unknown)()
      : (onSecond as (value: unknown) => unknown)(fa.value)
  }
  if (isEitherValue(fa)) {
    return fa._tag === 'Left'
      ? (onFirst as (error: unknown) => unknown)(fa.left)
      : (onSecond as (value: unknown) => unknown)(fa.right)
  }
  throw new Error('fold: unsupported higher-kinded type')
}

export function orElse<A>(fa: Option<A>, onNone: () => Option<A>): Option<A>
export function orElse<E, E2, A>(fa: Either<E, A>, onLeft: (error: E) => Either<E2, A>): Either<E2, A>
export function orElse(fa: unknown, onFirst: unknown): unknown {
  if (isOptionValue(fa)) {
    return fa._tag === 'None' ? (onFirst as () => Option<unknown>)() : fa
  }
  if (isEitherValue(fa)) {
    return fa._tag === 'Left' ? (onFirst as (error: unknown) => Either<unknown, unknown>)(fa.left) : fa
  }
  throw new Error('orElse: unsupported higher-kinded type')
}

export function tapError<E, A>(fa: Either<E, A>, onLeft: (error: E) => void): Either<E, A> {
  if (fa._tag === 'Left') onLeft(fa.left)
  return fa
}

export function fromPredicate<E, A>(
  predicate: (value: A) => boolean,
  onFalse: (value: A) => E,
): (value: A) => Either<E, A> {
  return (value) => predicate(value) ? right(value) : left(onFalse(value))
}

export function tryCatch<E, A>(thunk: () => A, onThrow: (cause: unknown) => E): Either<E, A> {
  try {
    return right(thunk())
  } catch (cause) {
    return left(onThrow(cause))
  }
}

export const Option = {
  none,
  some,
  fromNullable,
  isNone,
  isSome,
  map<A, B>(f: (value: A) => B): (fa: Option<A>) => Option<B> {
    return (fa) => map(fa, f)
  },
  chain<A, B>(f: (value: A) => Option<B>): (fa: Option<A>) => Option<B> {
    return (fa) => chain(fa, f)
  },
  bind<A, K extends string, B>(key: K, f: (value: A) => B): (fa: Option<A>) => Option<{ readonly [P in K]: B }> {
    return (fa) => bind(fa, key, f)
  },
  ap,
  flap,
  matchW<A, B, C>(onNone: () => B, onSome: (value: A) => C): (fa: Option<A>) => B | C {
    return (fa) => matchW(fa, onNone, onSome)
  },
  fold<A, B>(onNone: () => B, onSome: (value: A) => B): (fa: Option<A>) => B {
    return (fa) => fold(fa, onNone, onSome)
  },
  orElse,
  traverse<A, B>(f: (value: A) => Option<B>): (as: readonly A[]) => Option<B[]> {
    return (as) => traverse(as, f)
  },
  sequence,
}

export const Either = {
  left,
  right,
  isLeft,
  isRight,
  map<E, A, B>(f: (value: A) => B): (fa: Either<E, A>) => Either<E, B> {
    return (fa) => map(fa, f)
  },
  mapLeft<E, E2, A>(f: (error: E) => E2): (fa: Either<E, A>) => Either<E2, A> {
    return (fa) => fa._tag === 'Left' ? left(f(fa.left)) : fa
  },
  chain<E, A, B>(f: (value: A) => Either<E, B>): (fa: Either<E, A>) => Either<E, B> {
    return (fa) => chain(fa, f)
  },
  bind<E, A, K extends string, B>(key: K, f: (value: A) => B): (fa: Either<E, A>) => Either<E, { readonly [P in K]: B }> {
    return (fa) => bind(fa, key, f)
  },
  ap,
  flap<A>(value: A) {
    return <E, B>(fab: Either<E, (value: A) => B>): Either<E, B> =>
      fab._tag === 'Left' ? fab : right(fab.right(value))
  },
  matchW<E, A, B, C>(onLeft: (error: E) => B, onRight: (value: A) => C): (fa: Either<E, A>) => B | C {
    return (fa) => matchW(fa, onLeft, onRight)
  },
  fold<E, A, B>(onLeft: (error: E) => B, onRight: (value: A) => B): (fa: Either<E, A>) => B {
    return (fa) => fold(fa, onLeft, onRight)
  },
  orElse,
  tapError,
  fromPredicate,
  tryCatch,
  traverse<E, A, B>(f: (value: A) => Either<E, B>): (as: readonly A[]) => Either<E, B[]> {
    return (as) => traverse(as, f)
  },
  sequence,
}

export const Reader = {
  of<R, A>(value: A): Reader<R, A> {
    return () => value
  },
  ask<R>(): Reader<R, R> {
    return identity
  },
  asks<R, A>(f: (env: R) => A): Reader<R, A> {
    return f
  },
  map<R, A, B>(fa: Reader<R, A>, f: (value: A) => B): Reader<R, B> {
    return (env) => f(fa(env))
  },
  chain<R, A, B>(fa: Reader<R, A>, f: (value: A) => Reader<R, B>): Reader<R, B> {
    return (env) => f(fa(env))(env)
  },
  bind<R, A, K extends string, B>(
    fa: Reader<R, A>,
    key: K,
    f: (value: A) => B,
  ): Reader<R, { readonly [P in K]: B }> {
    return (env) => ({ [key]: f(fa(env)) } as { readonly [P in K]: B })
  },
}

const rteOf = <R, E, A>(value: A): RTE<R, E, A> => async () => right(value)

const rteLeft = <E, A>(error: E): RTE<unknown, E, A> => async () => left(error)

const rteMap = <A, B>(f: (value: A) => B) =>
  <R, E>(ma: RTE<R, E, A>): RTE<R, E, B> =>
    async (env) => map(await ma(env), f)

const rteMapError = <E, E2>(f: (error: E) => E2) =>
  <R, A>(ma: RTE<R, E, A>): RTE<R, E2, A> =>
    async (env) => {
      const result = await ma(env)
      return result._tag === 'Left' ? left(f(result.left)) : right(result.right)
    }

const rteChain = <A, B>(f: (value: A) => RTE<never, unknown, B>) =>
  <R, E>(ma: RTE<R, E, A>): RTE<R, E, B> =>
    async (env) => {
      const result = await ma(env)
      if (result._tag === 'Left') return left(result.left)
      const next = await f(result.right)(env as never)
      return next._tag === 'Left' ? left(next.left as E) : right(next.right)
    }

const rteBind = <K extends string, A extends object, B>(
  key: K,
  f: (value: A) => RTE<never, unknown, B>,
) =>
  <R, E>(ma: RTE<R, E, A>): RTE<R, E, A & { readonly [P in K]: B }> =>
    async (env) => {
      const result = await ma(env)
      if (result._tag === 'Left') return left(result.left)
      const next = await f(result.right)(env as never)
      if (next._tag === 'Left') return left(next.left as E)
      return right(Object.assign({}, result.right, { [key]: next.right }) as A & { readonly [P in K]: B })
    }

const rteAp = <R, E, A>(ma: RTE<R, E, A>) =>
  <B>(mab: RTE<R, E, (value: A) => B>): RTE<R, E, B> =>
    async (env) => {
      const [ea, ef] = await Promise.all([ma(env), mab(env)])
      if (ea._tag === 'Left') return left(ea.left)
      if (ef._tag === 'Left') return left(ef.left)
      return right(ef.right(ea.right))
    }

const rteFlap = <A>(value: A) =>
  <R, E, B>(mab: RTE<R, E, (value: A) => B>): RTE<R, E, B> =>
    async (env) => {
      const result = await mab(env)
      return result._tag === 'Left' ? result : right(result.right(value))
    }

const rteTraverse = <R, E, A, B>(
  as: readonly A[],
  f: (value: A) => RTE<R, E, B>,
): RTE<R, E, readonly B[]> =>
  async (env) => {
    const out: B[] = []
    for (const value of as) {
      const next = await f(value)(env)
      if (next._tag === 'Left') return next
      out.push(next.right)
    }
    return right(out)
  }

const rteSequence = <R, E, A>(as: readonly RTE<R, E, A>[]): RTE<R, E, readonly A[]> =>
  rteTraverse(as, identity)

const rteMatchW = <E, A, B, C>(
  onLeft: (error: E) => B,
  onRight: (value: A) => C,
) =>
  <R>(ma: RTE<R, E, A>): (env: R) => Promise<B | C> =>
    async (env) => matchW(await ma(env), onLeft, onRight)

const rteFold = <E, A, B>(
  onLeft: (error: E) => B,
  onRight: (value: A) => B,
) =>
  <R>(ma: RTE<R, E, A>): (env: R) => Promise<B> =>
    async (env) => fold(await ma(env), onLeft, onRight)

const rteOrElse = <E, E2, A>(onLeft: (error: E) => RTE<never, unknown, A>) =>
  <R>(ma: RTE<R, E, A>): RTE<R, E2, A> =>
    async (env) => {
      const result = await ma(env)
      if (result._tag === 'Right') return right(result.right)
      const next = await onLeft(result.left)(env as never)
      return next._tag === 'Left' ? left(next.left as E2) : right(next.right)
    }

const rteTapError = <E>(onLeft: (error: E) => void) =>
  <R, A>(ma: RTE<R, E, A>): RTE<R, E, A> =>
    async (env) => {
      const result = await ma(env)
      if (result._tag === 'Left') onLeft(result.left)
      return result
    }

const rteTryCatch = <R, E, A>(
  thunk: (env: R) => Promise<A>,
  onThrow: (cause: unknown) => E,
): RTE<R, E, A> =>
  async (env) => {
    try {
      return right(await thunk(env))
    } catch (cause) {
      return left(onThrow(cause))
    }
  }

const rteFromEither = <R, E, A>(value: Either<E, A>): RTE<R, E, A> => async () => value

const rteFromOption = <R, E, A>(value: Option<A>, onNone: () => E): RTE<R, E, A> =>
  async () => value._tag === 'None' ? left(onNone()) : right(value.value)

const rteFromPredicate = <R, E, A>(
  predicate: (value: A) => boolean,
  onFalse: (value: A) => E,
): (value: A) => RTE<R, E, A> =>
  (value) => async () => predicate(value) ? right(value) : left(onFalse(value))

export const RTE = {
  Do: rteOf<unknown, never, Record<string, never>>({}),
  of: rteOf,
  left: rteLeft,
  ask: <R>(): RTE<R, never, R> => async (env) => right(env),
  asks: <R, A>(f: (env: R) => A): RTE<R, never, A> => async (env) => right(f(env)),
  map: rteMap,
  mapError: rteMapError,
  chain: rteChain,
  bind: rteBind,
  ap: rteAp,
  flap: rteFlap,
  traverse: rteTraverse,
  sequence: rteSequence,
  matchW: rteMatchW,
  fold: rteFold,
  orElse: rteOrElse,
  tapError: rteTapError,
  tryCatch: rteTryCatch,
  fromEither: rteFromEither,
  fromOption: rteFromOption,
  fromPredicate: rteFromPredicate,
}

