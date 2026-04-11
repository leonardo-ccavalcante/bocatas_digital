import { useRef } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyFn = (...args: any[]) => any;
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * usePersistFn instead of useCallback to reduce cognitive load.
 * Returns a stable function reference that always calls the latest version of fn.
 * The `any` type here is intentional — it is the minimal constraint needed to
 * accept all React event handler signatures (KeyboardEvent, CompositionEvent, etc.)
 * without losing the concrete generic T at the call site.
 */
export function usePersistFn<T extends AnyFn>(fn: T): T {
  const fnRef = useRef<T>(fn);
  fnRef.current = fn;

  const persistFn = useRef<T | null>(null);
  if (!persistFn.current) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    persistFn.current = function (this: unknown, ...args: any[]) {
      return fnRef.current!.apply(this, args);
    } as T;
  }

  return persistFn.current;
}
