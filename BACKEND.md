# Nepal Territory Conquest — Backend Specification

> Status: **design document only**. The shipped app runs a fully mocked client (localStorage auth, in-memory leaderboard, simulated zone ownership). This file is the blueprint for turning it into a real multiplayer backend on **Lovable Cloud** (Supabase under the hood + TanStack Start server functions).

---

## 1. Overview

The game's core loop is:

```
walk into a zone  →  prove you're physically there  →  claim it  →  defend it
```

Everything sensitive — distance verification, ownership writes, leaderboard math — must run on the server. The client is treated as hostile (anyone can spoof GPS in DevTools).

**Recommended stack**

| Concern        | Choice                                               |
| -------------- | ---------------------------------------------------- |
| Auth           | Supabase Auth (email/password + Google)              |
| Database       | Supabase Postgres                                    |
| Server logic   | TanStack Start `createServerFn` (NOT Edge Functions) |
| Realtime       | Supabase Realtime channel on the `zones` table       |
| Scheduled jobs | `pg_cron` → `/api/public/cron/*` endpoint            |
| File storage   | Not required for v1                                  |

---

## 2. Authentication

### Providers (v1)

- Email + password
- Google OAuth (via Lovable broker)

### Profile bootstrapping

Every `auth.users` row gets a matching `public.profiles` row via a `SECURITY DEFINER` trigger so the client never has to "create profile" manually.

```sql
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, emoji, color)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'username', 'player_' || substr(new.id::text, 1, 6)),
          coalesce(new.raw_user_meta_data->>'emoji', '🦅'),
          coalesce(new.raw_user_meta_data->>'color', 'cyan'));
  return new;
end$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

The signup flow (already built on the client) passes `username`, `emoji`, and `color` via `options.data` so the trigger picks them up.

---

## 3. Data Model

### `profiles`

| column     | type        | notes                                                  |
| ---------- | ----------- | ------------------------------------------------------ |
| id         | uuid PK     | FK → `auth.users(id)` ON DELETE CASCADE                |
| username   | text UNIQUE | citext-style validation, 3–12 chars                    |
| emoji      | text        | single grapheme                                        |
| color      | text        | enum: crimson / cyan / volt / magenta / amber / violet |
| created_at | timestamptz | default `now()`                                        |

### `zones`

The world is a coarse grid of cells (~0.001° ≈ 100 m).

| column     | type        | notes                                      |
| ---------- | ----------- | ------------------------------------------ |
| id         | text PK     | `"{lat6}_{lng6}"` deterministic cell id    |
| lat        | double      | cell center latitude                       |
| lng        | double      | cell center longitude                      |
| owner_id   | uuid        | FK → `profiles.id`, nullable               |
| color      | text        | denormalized from owner for fast map paint |
| contested  | boolean     | true while another player is challenging   |
| defense    | int         | 0–100, decays daily                        |
| claimed_at | timestamptz | last successful conquest                   |
| updated_at | timestamptz | trigger-updated                            |

Index: `(owner_id)`, `(lat, lng)` for bbox queries, partial index on contested rows.

### `claims` (audit log)

| column     | type        | notes                                  |
| ---------- | ----------- | -------------------------------------- | -------- | ------- |
| id         | uuid PK     | default `gen_random_uuid()`            |
| zone_id    | text        | FK → `zones.id`                        |
| user_id    | uuid        | FK → `profiles.id`                     |
| action     | text        | `'conquer'                             | 'defend' | 'lose'` |
| lat        | double      | client-reported position at claim time |
| lng        | double      | client-reported position at claim time |
| created_at | timestamptz | default `now()`                        |

Used for: rate limiting, anti-cheat heuristics, replay/history.

### `leaderboard_mv` (materialized view)

```sql
create materialized view public.leaderboard_mv as
select
  p.id,
  p.username,
  p.emoji,
  p.color,
  count(z.id)                          as zones,
  count(z.id) * 30.0                   as area_km2_estimate,
  count(z.id) * 12
    + coalesce(sum(z.defense), 0) / 10 as points
from profiles p
left join zones z on z.owner_id = p.id
group by p.id;

create unique index on public.leaderboard_mv (id);
```

Refresh strategy: `refresh materialized view concurrently leaderboard_mv` every 30 s via `pg_cron`, plus on-demand after big conquests.

---

## 4. RLS Policies

| Table    | SELECT    | INSERT                   | UPDATE / DELETE      |
| -------- | --------- | ------------------------ | -------------------- |
| profiles | public    | trigger only             | self only            |
| zones    | public    | **server function only** | server function only |
| claims   | self only | self only (via server)   | none                 |

Critical: **the client never writes to `zones` directly**. All ownership changes go through `conquerZone()` / `defendZone()` server functions that re-verify GPS distance. Grants follow the public-schema-grants rule:

```sql
grant select on public.zones to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant select, insert on public.claims to authenticated;
grant all on public.zones to service_role;
```

---

## 5. Server Functions

Located in `src/lib/game/zones.functions.ts`, called from the client via `useServerFn`.

### `conquerZone({ zoneId, lat, lng })`

1. `requireSupabaseAuth` middleware → resolves `context.userId`
2. Fetch zone center; compute Haversine distance between `(lat, lng)` and the cell center.
3. **Reject if distance > 80 m** → return `{ ok: false, reason: 'too_far' }`.
4. Rate limit: max 30 conquests per user per minute (Redis or `pg_advisory_lock`).
5. Inside a transaction:
   - `insert into claims (...)`
   - `update zones set owner_id = $user, color = $userColor, defense = 60, contested = false, claimed_at = now() where id = $zoneId`
6. Realtime broadcast happens automatically via Postgres logical replication.

### `defendZone({ zoneId })`

If the caller already owns the zone, bump `defense = least(defense + 10, 100)` and log a `'defend'` claim. Cooldown of 60 s per zone per user.

### `getViewportZones({ bbox: [w, s, e, n], limit = 2000 })`

Public read, no auth required. Returns owned + contested zones inside the bounding box, joined with owner color/emoji. The client merges this against its locally generated empty grid for paint.

### `getLeaderboard({ limit = 50 })`

Public read from `leaderboard_mv`. Includes the caller's own rank even when outside the top N.

---

## 6. Realtime

Subscribe once from `GameMap.tsx`:

```ts
supabase
  .channel("zones")
  .on("postgres_changes", { event: "UPDATE", schema: "public", table: "zones" }, (payload) =>
    store.applyZoneUpdate(payload.new),
  )
  .subscribe();
```

Only diffs are pushed. The client batches updates into the existing `feature-state` calls so painted color changes animate without re-fetching the viewport.

---

## 7. Scheduled Jobs (pg_cron)

| Job                   | Cadence       | Purpose                                                                                              |
| --------------------- | ------------- | ---------------------------------------------------------------------------------------------------- |
| `decay_defense`       | every 6 hours | `update zones set defense = greatest(0, defense - 5) where claimed_at < now() - interval '12 hours'` |
| `refresh_leaderboard` | every 30 s    | `refresh materialized view concurrently leaderboard_mv`                                              |
| `purge_old_claims`    | daily         | delete `claims` older than 90 days                                                                   |
| `release_dead_zones`  | daily         | `update zones set owner_id = null, color = null where defense = 0`                                   |

Cron calls a public route `/api/public/cron/<job>` with an `x-cron-secret` header verified inside the handler.

---

## 8. Security Checklist

- ✅ Server-side Haversine check (client value is hint only)
- ✅ Per-user rate limits on `conquerZone` (token bucket: 30/min, 200/hr)
- ✅ Per-zone cooldown on `defendZone` (60 s)
- ✅ Velocity check: reject if two consecutive claims imply > 60 km/h travel
- ✅ Bind `lat/lng` accuracy threshold (reject claims with `accuracy > 50 m`)
- ✅ All RLS policies scoped to `auth.uid()`; no broad `using (true)` writes
- ✅ Service role key NEVER imported at module scope outside `*.server.ts` files
- ✅ Webhook/cron endpoints under `/api/public/*` with HMAC or shared-secret verification
- ✅ Input validation with Zod on every server function (lat/lng range, zoneId regex)
- ⏳ Optional later: signed map-tile proxy if CARTO usage exceeds free tier

---

## 9. Migration Roadmap

| Phase | Scope                                               | Outcome                                            |
| ----- | --------------------------------------------------- | -------------------------------------------------- |
| **1** | Auth + `profiles` + trigger                         | Real signup/login, profile persists across devices |
| **2** | `zones` + `claims` tables + `conquerZone` server fn | Real territory ownership, server-verified GPS      |
| **3** | `leaderboard_mv` + `getLeaderboard`                 | Real cross-player ranking                          |
| **4** | Realtime subscription                               | Live conquest pulses on the map                    |
| **5** | `pg_cron` decay + leaderboard refresh               | Territories you abandon eventually fall            |
| **6** | Achievements table + triggers                       | Unlock conditions stored, badges revealed in UI    |

Each phase is independently shippable; the existing mock store should be swapped one selector at a time so the UI never goes blank during migration.

---

## 10. Environment Variables

### Client (Vite, bundled — never put secrets here)

| Name                            | Purpose              |
| ------------------------------- | -------------------- |
| `VITE_SUPABASE_URL`             | Project URL          |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon/publishable key |

### Server (process.env, never bundled)

| Name                        | Purpose                                    |
| --------------------------- | ------------------------------------------ |
| `SUPABASE_URL`              | Same URL, server-side                      |
| `SUPABASE_PUBLISHABLE_KEY`  | For `requireSupabaseAuth` middleware       |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin client — used inside server fns only |
| `CRON_SHARED_SECRET`        | HMAC for `/api/public/cron/*`              |

---

## 11. Out of Scope (v1)

- Friends / parties / chat
- Push notifications when a zone is under attack
- Cosmetic skins, paid factions
- Native mobile app (PWA install banner is enough)
- True 100 m × 100 m vector tiles served from the server (current coarse grid is good for ~10k DAU; beyond that we move to a `mvt` endpoint with PostGIS)

---

**Author:** Frontend mock by Lovable AI. Backend design ready to be implemented when Lovable Cloud is enabled.
