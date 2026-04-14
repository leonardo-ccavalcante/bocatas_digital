import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { checkinRouter } from "./routers/checkin";
import { dashboardRouter } from "./routers/dashboard";
import { personsRouter } from "./routers/persons";
import { programsRouter } from "./routers/programs";
import { adminRouter } from "./routers/admin";
import { familiesRouter } from "./routers/families";
import { announcementsRouter } from "./routers/announcements";
import { ocrRouter } from "./routers/ocr";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  persons: personsRouter,
  checkin: checkinRouter,
  dashboard: dashboardRouter,
  programs: programsRouter,
  admin: adminRouter,
  families: familiesRouter,
  announcements: announcementsRouter,
  ocr: ocrRouter,
});

export type AppRouter = typeof appRouter;
