import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

/**
 * A DEFINITIVE "you are not logged in" answer — not a transient failure. Only
 * this may bounce the user to /login. A rate-limit 429 (or its transform error)
 * is NOT this, so a busy sede is never logged out by the limiter (#166).
 */
function isUnauthorized(error: unknown): boolean {
  return error instanceof TRPCClientError && error.data?.code === "UNAUTHORIZED";
}

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath = getLoginUrl() } =
    options ?? {};
  const utils = trpc.useUtils();
  const supabase = useRef(createClient()).current;

  const meQuery = trpc.auth.me.useQuery(undefined, {
    // Retry transient failures (rate-limit 429, network blip) a couple of times,
    // but never a definitive UNAUTHORIZED — that IS the answer, not a blip (#166).
    retry: (failureCount, error) => failureCount < 2 && !isUnauthorized(error),
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
      window.location.href = "/login";
    }
  }, [logoutMutation, utils, supabase]);

  // ── Persist user info to localStorage (side effect, not in useMemo) ──────────────
  useEffect(() => {
    localStorage.setItem(
      "manus-runtime-user-info",
      JSON.stringify(meQuery.data)
    );
  }, [meQuery.data]);

  // Definitively unauthenticated: auth.me resolved to null, or failed with a real
  // UNAUTHORIZED. A transient 429/network error leaves data undefined and a
  // non-UNAUTHORIZED error → NOT unauthenticated, so it never triggers a logout.
  const isUnauthenticated =
    !meQuery.isLoading && (meQuery.data === null || isUnauthorized(meQuery.error));

  const state = useMemo(() => {
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
      isUnauthenticated,
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
    isUnauthenticated,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (!isUnauthenticated) return;
    if (typeof window === "undefined") return;
    if (window.location.pathname === redirectPath) return;

    window.location.href = redirectPath
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    isUnauthenticated,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
  };
}
