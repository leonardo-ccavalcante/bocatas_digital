# Bocatas Digital — Manus → Railway: Frictionless Migration Plan

**Date:** 2026-08-16
**Goal:** Reliable, autofix, frictionless, and stable migration from Manus to Railway + Supabase Auth.

---

## Architecture After Migration

```
┌─────────────────────────────────────────────────────────┐
│                    Railway (Node.js)                      │
│  Express + tRPC + Vite SSR                               │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Supabase    │  │ OpenAI API   │  │ LibreOffice   │  │
│  │ Auth (SSR)  │  │ (LLM calls)  │  │ Worker (VM)   │  │
│  └──────┬──────┘  └──────┬───────┘  └───────┬───────┘  │
│         │                │                   │          │
└─────────┼────────────────┼───────────────────┼──────────┘
          │                │                   │
          ▼                ▼                   ▼
┌─────────────────┐  ┌──────────┐  ┌──────────────────┐
│ Supabase Cloud  │  │ OpenAI   │  │ Cloud Computer   │
│ (PostgreSQL +   │  │ API      │  │ 35.231.120.16    │
│  Storage + RLS) │  │          │  │ :7654            │
└─────────────────┘  └──────────┘  └──────────────────┘
```

**Key principle:** The database stays on Supabase Cloud. Only the application server moves to Railway. This eliminates the highest-risk boundary (data migration).

---

## Phase 1: Replace Manus OAuth → Supabase Auth

### 1.1 Install dependencies

```bash
pnpm add @supabase/ssr
```

### 1.2 Create auth utility (server-side)

Replace `server/_core/oauth.ts` and `server/_core/sdk.ts` with Supabase Auth:

```typescript
// server/_core/supabaseAuth.ts
import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import type { Request, Response } from 'express';

export function createSupabaseServerClient(req: Request, res: Response) {
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(req.headers.cookie ?? '');
        },
        setAll(cookiesToSet, cacheHeaders) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.appendHeader('Set-Cookie', serializeCookieHeader(name, value, options));
          });
          Object.entries(cacheHeaders).forEach(([key, value]) => {
            res.setHeader(key, value);
          });
        },
      },
    }
  );
}
```

### 1.3 Replace context.ts

```typescript
// server/_core/context.ts (new)
import { createSupabaseServerClient } from './supabaseAuth';
import type { Request, Response } from 'express';

export async function createContext({ req, res }: { req: Request; res: Response }) {
  const supabase = createSupabaseServerClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();

  // Map Supabase user to app user (lookup role from users table)
  let appUser = null;
  if (user) {
    const { data: dbUser } = await supabase
      .from('users')
      .select('id, role, nombre')
      .eq('supabase_auth_id', user.id)
      .single();
    appUser = dbUser ? { ...dbUser, email: user.email } : null;
  }

  return { user: appUser, supabase };
}
```

### 1.4 Frontend auth (client-side)

```typescript
// client/src/lib/supabase/browser.ts
import { createBrowserClient } from '@supabase/ssr';

export const supabase = createBrowserClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
```

### 1.5 Login/Signup pages

Replace Manus OAuth redirect with Supabase Auth UI or custom forms:

```typescript
// Sign in with email/password
const { error } = await supabase.auth.signInWithPassword({ email, password });

// Sign in with Google OAuth
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: { redirectTo: `${window.location.origin}/auth/callback` }
});
```

### 1.6 Auth callback route

```typescript
// server route: GET /auth/callback
app.get('/auth/callback', async (req, res) => {
  const code = req.query.code as string;
  if (code) {
    const supabase = createSupabaseServerClient(req, res);
    await supabase.auth.exchangeCodeForSession(code);
  }
  res.redirect('/');
});
```

### 1.7 Migrate existing users

```sql
-- Add supabase_auth_id column to users table
ALTER TABLE users ADD COLUMN supabase_auth_id UUID REFERENCES auth.users(id);

-- After creating Supabase Auth users (via admin API), link them:
-- UPDATE users SET supabase_auth_id = '<auth.users.id>' WHERE email = '<email>';
```

Script to bulk-create Supabase Auth users from existing users table:

```typescript
// scripts/migrate-users-to-supabase-auth.mjs
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Fetch all existing users
const { data: users } = await supabase.from('users').select('*');

for (const user of users) {
  // Create auth user with a temporary password (they'll reset)
  const { data, error } = await supabase.auth.admin.createUser({
    email: user.email,
    password: crypto.randomUUID(), // temporary — user resets via magic link
    email_confirm: true,
    user_metadata: { nombre: user.nombre, role: user.role }
  });

  if (data?.user) {
    await supabase.from('users')
      .update({ supabase_auth_id: data.user.id })
      .eq('id', user.id);
  }
}
```

---

## Phase 2: Replace Forge LLM → OpenAI Direct

### 2.1 Change in `server/_core/llm.ts`

```typescript
// Before (Manus Forge):
const url = `${process.env.BUILT_IN_FORGE_API_URL}/v1/chat/completions`;
const key = process.env.BUILT_IN_FORGE_API_KEY;

// After (OpenAI direct):
const url = 'https://api.openai.com/v1/chat/completions';
const key = process.env.OPENAI_API_KEY;
```

### 2.2 Environment variable

```
OPENAI_API_KEY=sk-...
```

### 2.3 Verification

Run one real LLM call in staging (observacionesReviewer with test input).

---

## Phase 3: Replace Forge Storage → Supabase Storage Direct

### 3.1 Rewrite `server/storage.ts`

```typescript
import { createAdminClient } from './db';

const BUCKET = 'app-uploads'; // single bucket for all app uploads

export async function storagePut(relKey: string, data: Buffer, contentType: string) {
  const db = createAdminClient();
  const { error } = await db.storage.from(BUCKET).upload(relKey, data, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(relKey);
  return { key: relKey, url: urlData.publicUrl };
}

export async function storageGet(relKey: string, expiresIn = 3600) {
  const db = createAdminClient();
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(relKey, expiresIn);
  if (error) throw error;
  return { key: relKey, url: data.signedUrl };
}
```

### 3.2 Create bucket in Supabase

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('app-uploads', 'app-uploads', true);
```

### 3.3 Migrate existing Forge S3 objects

```bash
# Script: download all objects from Forge S3, re-upload to Supabase Storage
# Then UPDATE persons SET foto_perfil_url = new_url WHERE foto_perfil_url LIKE '%forge%';
```

---

## Phase 4: Replace Maps Proxy → Google Maps API Key

### 4.1 Get a Google Maps API key

Enable: Maps JavaScript API, Places API, Geocoding API.

### 4.2 Add to environment

```
VITE_GOOGLE_MAPS_KEY=AIza...
```

### 4.3 Update Map.tsx

Replace Manus proxy URL with direct Google Maps script load using the API key.

---

## Phase 5: Railway Deployment Configuration

### 5.1 `railway.json` (config-as-code)

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "RAILPACK",
    "buildCommand": "pnpm install --frozen-lockfile && pnpm build"
  },
  "deploy": {
    "startCommand": "node dist/server/_core/index.js",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 120,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5
  }
}
```

### 5.2 Add build script to package.json

```json
{
  "scripts": {
    "build": "vite build && tsc --project tsconfig.server.json --outDir dist",
    "start": "node dist/server/_core/index.js"
  }
}
```

### 5.3 Health endpoint

```typescript
// server/_core/index.ts — add before other routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});
```

### 5.4 Railway environment variables

| Variable | Value | Notes |
|---|---|---|
| `SUPABASE_URL` | (same as Manus) | Supabase project URL |
| `SUPABASE_ANON_KEY` | (same as Manus) | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | (same as Manus) | **Sealed** — server only |
| `SUPABASE_JWT_SECRET` | (same as Manus) | For JWT validation |
| `OPENAI_API_KEY` | sk-... | **Sealed** |
| `JWT_SECRET` | (same as Manus) | Session signing |
| `LIBREOFFICE_WORKER_URL` | http://35.231.120.16:7654 | Cloud Computer |
| `REPARTO_FIRMA_ENABLED` | 1 | Feature flag |
| `SESSION_LINK_SECRET` | (same as Manus) | HMAC for session links |
| `PII_ENCRYPTION_KEY` | (same as Manus) | **Sealed** — for encrypted data |
| `VITE_SUPABASE_URL` | (same) | Frontend |
| `VITE_SUPABASE_ANON_KEY` | (same) | Frontend |
| `VITE_GOOGLE_MAPS_KEY` | AIza... | Frontend |
| `VITE_PUBLIC_POSTHOG_KEY` | (same) | Analytics |
| `VITE_PUBLIC_POSTHOG_HOST` | (same) | Analytics |

### 5.5 GitHub Autodeploy

Connect Railway to `leonardo-ccavalcante/bocatas_digital` → branch `main`.
Every push to main triggers automatic build + deploy.

---

## Phase 6: Domain & DNS

### 6.1 Custom domain on Railway

```bash
railway domain add bocatas.digital
# Or use Railway-provided domain: bocatas-digital.up.railway.app
```

### 6.2 Update OAuth callback URLs

In Supabase Dashboard → Authentication → URL Configuration:
- Site URL: `https://bocatas.digital`
- Redirect URLs: `https://bocatas.digital/auth/callback`

### 6.3 Update webhook URLs

Update `app_settings.webhook_url` in database to point to new domain.

---

## Phase 7: Autofix & Self-Healing

### 7.1 Railway restart policy

`restartPolicyType: "ON_FAILURE"` with max 5 retries ensures automatic recovery from transient crashes.

### 7.2 Health check

Railway monitors `/api/health` — if it fails, the service is automatically restarted.

### 7.3 Pre-deploy validation

Add to `railway.json`:

```json
{
  "deploy": {
    "preDeployCommand": ["pnpm test -- --run"]
  }
}
```

This runs the full test suite BEFORE the deploy goes live. If tests fail, the deploy is rejected and the previous version stays running.

### 7.4 Zero-downtime deploys

Railway's default behavior: new container starts, passes healthcheck, then old container is drained. No downtime.

### 7.5 Rollback

Railway keeps all previous deployments. One-click rollback from the dashboard or:

```bash
railway deployment rollback <deployment-id>
```

---

## Phase 8: Verification Matrix

| Test | Method | Pass Criteria |
|---|---|---|
| Login (email/password) | Browser on Railway domain | Session cookie set, redirect to / |
| Login (Google OAuth) | Browser on Railway domain | OAuth flow completes, user created |
| Protected tRPC call | Authenticated request | Returns data (not 401) |
| Unauthenticated tRPC call | No cookie | Returns 401 |
| LLM call (observacionesReviewer) | Generate informe | Text returned, no Forge errors |
| File upload (photo) | Upload person photo | URL returned, image accessible |
| DOCX→PDF conversion | Generate informe PDF | PDF returned from LibreOffice worker |
| Map loads | Open /programas/.../mapa | Google Maps renders with markers |
| PostHog events | Click around | Events visible in PostHog dashboard |
| Webhook inbound | POST /api/webhooks/reparto-contacto | 200 response, data saved |
| Cross-tenant isolation | User A tries to access User B data | 403/empty result |

---

## Migration Execution Checklist

```
[ ] Phase 1: Auth replacement implemented and tested locally
[ ] Phase 1: Existing users migrated to Supabase Auth (script run)
[ ] Phase 2: LLM calls working with OpenAI API key
[ ] Phase 3: Storage rewritten to Supabase Storage direct
[ ] Phase 3: Existing Forge S3 objects migrated + URLs updated in DB
[ ] Phase 4: Google Maps API key configured and working
[ ] Phase 5: railway.json committed, build succeeds on Railway
[ ] Phase 5: All environment variables set in Railway (secrets sealed)
[ ] Phase 6: Custom domain configured, SSL working
[ ] Phase 6: OAuth callback URLs updated in Supabase
[ ] Phase 7: Health check passing, restart policy active
[ ] Phase 7: Pre-deploy test gate active
[ ] Phase 8: Full verification matrix passed on Railway staging
[ ] CUTOVER: DNS switched to Railway
[ ] POST-CUTOVER: Monitor errors for 72h
[ ] POST-CUTOVER: Decommission Manus project after 7-day observation
```

---

## Estimated Timeline

| Phase | Effort | Dependencies |
|---|---|---|
| Phase 1 (Auth) | 2-3 days | Google OAuth credentials, Supabase Auth config |
| Phase 2 (LLM) | 30 min | OpenAI API key |
| Phase 3 (Storage) | 1 day | Object migration script |
| Phase 4 (Maps) | 30 min | Google Maps API key |
| Phase 5 (Railway) | 1 day | Railway account, build config |
| Phase 6 (Domain) | 1 hour | DNS access |
| Phase 7 (Autofix) | 30 min | Already configured in railway.json |
| Phase 8 (Verify) | 1 day | All phases complete |
| **Total** | **5-6 days** | |

---

## Risk Mitigations

| Risk | Mitigation |
|---|---|
| Users can't login after migration | Bulk-create Supabase Auth users BEFORE cutover; send password reset emails |
| Forge S3 URLs break | Migrate objects + update DB URLs BEFORE DNS switch |
| LLM calls fail | OpenAI is a drop-in replacement (same API shape); test in staging |
| LibreOffice worker unreachable | Worker is on public IP; Railway can reach it (already tested from Manus) |
| Railway build fails | Pre-deploy command runs tests; failed builds don't go live |
| Session cookies don't work on new domain | Test actual domain in real browser; Supabase SSR handles SameSite correctly |
