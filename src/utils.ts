export const pipe = <T>(...fns: Array<(arg: T) => T>) => {
  return (value: T) => fns.reduce((acc, fn) => fn(acc), value)
}

export const cond = <T, R>(conditions: Array<
  [(value: T) => boolean, (value: T) => R]
  >, fallback?: (value: T) => R) => {
  return (value: T) => {
    for (const [p, t] of conditions) {
      if (p(value)) {
        return t(value)
      }
    }
    return fallback ? fallback(value) : undefined
  }
}

export function match<T extends Record<K, PropertyKey>, K extends keyof T, R>(
  key: K,
  handlers: { [V in T[K] & PropertyKey]: (value: Extract<T, Record<K, V>>) => R },
  fallback?: (value: T) => R
): (value: T) => R
export function match<T, K extends PropertyKey, R>(
  keyFn: (value: T) => K,
  handlers: Record<K, (value: T) => R>,
  fallback?: (value: T) => R
): (value: T) => R
export function match(...args: any[]) {
  const [keyOrFn, handlers, fallback] = args as [
    any,
    Record<PropertyKey, Function>,
    ((v: any) => any) | undefined
  ]

  return (value: any) => {
    const k = typeof keyOrFn === 'function' ? keyOrFn(value) : value[keyOrFn as PropertyKey]
    const handler = handlers[k as PropertyKey] as ((v: any) => any) | undefined

    if (handler) return handler(value)

    return fallback ? fallback(value) : undefined
  }
}

export const is = <T>(expected: T) => (value: T) => value === expected
