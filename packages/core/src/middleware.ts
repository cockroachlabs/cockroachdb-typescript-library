/** Composable asynchronous middleware around a unit of work. */

/** Wraps a unit of work, calling `next` to continue the chain. */
export type Middleware<T> = (next: () => Promise<T>) => Promise<T>;

/** Runs `final` wrapped by `middlewares`, first element outermost. */
export function compose<T>(middlewares: Middleware<T>[], final: () => Promise<T>): Promise<T> {
  let next = final;
  for (let i = middlewares.length - 1; i >= 0; i--) {
    const mw = middlewares[i]!;
    const prev = next;
    next = () => mw(prev);
  }
  return next();
}
