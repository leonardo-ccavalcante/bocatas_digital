import { createTRPCReact } from "@trpc/react-query";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import superjson from "superjson";
import type { AppRouter } from "../../../server/routers";

export const trpc = createTRPCReact<AppRouter>();

export type RouterOutputs = inferRouterOutputs<AppRouter>;

/**
 * Vanilla (non-React) tRPC client for imperative calls made OUTSIDE the React
 * tree — e.g. the signed-URL helper. Mirrors the link config in main.tsx
 * (same `/api/trpc` endpoint, superjson transformer, credentialed fetch).
 */
export const trpcVanilla = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch: (input, init) =>
        globalThis.fetch(input, { ...(init ?? {}), credentials: "include" }),
    }),
  ],
});
