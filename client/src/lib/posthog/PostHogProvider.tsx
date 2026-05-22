import { useEffect, type ReactNode } from "react";
import { initPostHog } from "./client";

/**
 * Wraps the app and kicks off the (gated) PostHog init once on mount. When no
 * key is configured `initPostHog` resolves to a no-op, so this is inert in CI
 * and in any environment where the EIPD addendum hasn't been signed.
 */
export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    void initPostHog();
  }, []);

  return <>{children}</>;
}
