# Security notes

Last reviewed: 2026-08-30. Dependency section against the full project audit of
2026-08-29; headers section against the hardening work that followed it.

## Dependencies

### Next.js — patched

`next` is pinned at **15.5.24** (Maintenance LTS). The August 2026 security
release fixes two critical issues, and the audit only named one of them:

| Advisory                                                                                                          | Impact                                                                                                                     | Affects                                                  |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| [GHSA-2xp9-vwfh-vxw4](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4)                  | Unauthenticated RCE via the Image Optimization API when optimizing an attacker-controlled AVIF image (`sharp` → `libheif`) | **all platforms** — the patch disables AVIF optimization |
| [CVE-2026-75604 / GHSA-p293-qw3h-jr36](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) | Unauthenticated RCE when the server runs on a Windows filesystem                                                           | Windows hosts only                                       |

`eslint-config-next` is on the same 15.5.24 line.

Do not "upgrade" to what `npm audit` suggests here: it proposes `next@16.3.3`,
a major version. 15.5.24 is the patched Maintenance LTS and is the right fix
for this project.

### xlsx (SheetJS) — pinned at 0.18.5, and why

`xlsx@0.18.5` is the newest build on the **npm registry**, and it is affected
by:

- [CVE-2023-30533](https://cdn.sheetjs.com/advisories/CVE-2023-30533) —
  prototype pollution when reading a crafted workbook. Fixed in 0.19.3.
- [CVE-2024-22363](https://cdn.sheetjs.com/advisories/CVE-2024-22363) — ReDoS.
  Fixed in 0.20.2.

SheetJS stopped publishing to npm; fixed releases live on their own CDN, so
`npm audit` reports "no fix available" and will keep doing so.

**The upgrade command, to run on a machine with access to cdn.sheetjs.com:**

```bash
npm install "xlsx@https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
npm test && npm run build
```

Then re-import one real file of each type (GA, C2C, C2S, OB, targets,
retailer master) and confirm the parsed row counts match.

**Current exposure, assessed rather than assumed.** Six call sites read
uploaded workbooks:

| File                                                | Call                                   | Exposed to CVE-2023-30533?       |
| --------------------------------------------------- | -------------------------------------- | -------------------------------- |
| `lib/ga-import.ts`                                  | `sheet_to_json(..., { header: 1 })`    | No — returns arrays, not objects |
| `lib/c2-import-core.ts`                             | `sheet_to_json(..., { header: 1 })`    | No                               |
| `lib/ob-import.ts`                                  | `sheet_to_json(..., { header: 1 })`    | No                               |
| `app/api/targets/import/route.ts`                   | `sheet_to_json(..., { header: 1 })`    | No                               |
| `lib/master-import.ts`                              | `sheet_to_json(...)` — **object rows** | Mitigated, see below             |
| `app/components/ReportShell.tsx`, `app/api/samples` | write only                             | No                               |

Prototype pollution needs a sheet column literally named `__proto__` to become
an object key. The retailer import passes every header through
`lib/sheet-headers.ts`, which uppercases and strips punctuation — `__proto__`
becomes `__PROTO__`, which is inert. That is now covered by a test
(`tests/report-correctness.smoke.test.ts`) so it cannot be "simplified" away.

So the residual risk on this codebase is the **ReDoS** (availability), and only
from an authenticated ADMIN / IT / ACCOUNTS uploader. That is a reason to
schedule the upgrade, not an emergency — but do it before the system carries
real data.

### The other four `npm audit` findings

After the Next.js patch, `npm audit` reports 7 findings (6 high, 1 moderate).
None has a safe non-major fix, and each was assessed rather than bulk-"fixed":

| Package                                           | Route in                 | Assessment                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sharp` (high)                                    | `next` → image optimizer | The advisory is the same libheif/AVIF issue as GHSA-2xp9-vwfh-vxw4. **Next 15.5.24 disables AVIF optimization**, which is the vendor's own mitigation, so the vulnerable path is already closed. `npm audit fix` cannot raise it independently of Next.                                                                                                                |
| `postcss` (moderate, via `next`)                  | build-time only          | Only fix offered is `next@16` (major). PostCSS runs at build time on this project's own stylesheets, not on user input.                                                                                                                                                                                                                                                |
| `prisma`, `@prisma/config`, `deepmerge-ts` (high) | Prisma **CLI**           | Stack exhaustion when merging recursive object graphs while loading Prisma config. It is a CLI/config-load path, not a request path — no user input reaches it. npm suggests `prisma@6.12.0`, which is a **downgrade** from the pinned 6.19.3 and would not help; the real fix line is Prisma 7.x/8.x, a major upgrade to schedule deliberately with a migration test. |
| `xlsx` (high)                                     | upload parsing           | See the section above.                                                                                                                                                                                                                                                                                                                                                 |

`npm audit fix --force` must not be run on this project: every "fix" it would
apply is a major version jump, including a Prisma downgrade.

## Secrets

`notepad.env` is excluded from every distributed archive, along with
`node_modules`, `.next` and build state. If any archive containing real
credentials has been shared outside the team, rotate the database and auth
credentials before going live — the owner has said this deliberately waits
until the new database and deployment account are created.

## Already in place

### Authentication and authorisation

- Password/PIN hashing with `scrypt` and a per-user random salt.
- Credential comparison via `timingSafeEqual`.
- Session tokens random, stored server-side as a hash, HttpOnly + SameSite=Lax
  - Secure in production, with enforced expiry and login throttling.
- `getCurrentUser` **omits `credentialHash`**. That object is passed into
  layouts, pages and permission checks; a password hash riding along is one
  careless serialisation away from being served. Login reads the user row
  itself, so nothing outside `lib/auth` needs it.
- `/setup` transactionally refuses to create a second first-admin.
- Every non-public API route checks role and, for mutations, module permission —
  and `tests/api-authorization.smoke.test.ts` now **enumerates every handler**
  and fails if one has no gate. Being public requires adding the route to an
  explicit list with a written reason.
- Upload size capped at 20 MB.
- No `eval`, `new Function`, `dangerouslySetInnerHTML`, raw SQL helpers or
  child-process execution in application source.

### Credentials: six-digit PINs, five strikes, admin unlock

- **Six digits, digits only** (`lib/credential-policy.ts`). Four digits is ten
  thousand possibilities; six is a million. Numeric because these are typed
  one-handed in the field — a six-digit PIN behind a five-attempt lock beats a
  "complex" password written inside a SIM folder.
- Obvious PINs are refused: `111111`, `123456`, `654321` and the rest. A lock
  stops brute force; it does nothing about someone trying the same guess on
  every account they can name.
- **Enforced when a credential is SET, never when it is used.** Existing
  four-digit PINs keep working until an admin resets them. The alternative locks
  out the whole distribution team on the morning of the deploy — the owner's
  call, recorded so nobody "fixes" it later by accident.
- **Five consecutive failures lock the login, with no timer.** `User.lockedAt`
  is a timestamp of the event, not a deadline. Only an administrator clears it,
  from Authorized Users → Unlock. A timed lock lets an attacker keep guessing
  forever at a slower rate; this one ends the attempt and puts a person in the
  loop who can ask why that account was being guessed at.
- Unlocking clears the counter as well as the flag. Clearing only the flag would
  re-lock on the next failure — an unlock that lasts one attempt, which is worse
  than none because the admin believes they fixed it.
- Both the lock (`ACCOUNT_LOCKED`) and the unlock (`UNLOCK_USER`) are audited.

**The trade-off, stated plainly:** anyone who knows a mobile number can lock
that user out with five wrong guesses. That is inherent to admin-unlock lockout,
and the mitigation is the source throttle below — an attacker is blocked after
five attempts _of their own_ before they can walk down a list doing it to
everyone. If nuisance lockouts become a real problem, the next lever is a short
self-service delay on the first offence rather than weakening the lock.

### Login throttling: the source bucket

The throttle was keyed on `identifier + client IP`, and the client IP came from
`X-Forwarded-For` — a header the caller sends. Measured against the running app:

    same address, 8 wrong PINs      401 401 401 401 429 429 429 429
    rotating address, 8 wrong PINs  401 401 401 401 401 401 401 401

The second line was the bug: **unlimited guesses**. Field logins are four-digit
PINs, so any RSO or BP account was at most ten thousand requests from being
opened. Rotating real addresses through proxies reaches the same place without
touching a header, so this was never only a spoofing problem.

v149 answered this with a second throttle bucket keyed on the identifier alone.
v150 replaced that bucket with the account lockout above, which is stricter: a
throttle only ever slowed an attacker down, the lock stops them.

What remains (`lib/login-policy.ts`) is the **source** bucket — identifier +
client hint, five failures, a flat fifteen minutes — and it still matters for a
specific reason: it is what stops one attacker from walking down a list of
mobile numbers locking every account in turn. They are blocked after five
attempts of their own, before they reach the sixth person. It is checked
_before_ the account is even looked up, so a blocked caller cannot keep adding
failures to other people's accounts.

The lock is deliberately flat, not escalating: locking one address for a day is
cheap for an attacker to route around and expensive for an office behind one
NAT.

### Rate limiting

Beyond the login throttle, four buckets are counted per authenticated user
(`lib/rate-limit.ts`): **upload** (30 / 10 min), **credential** changes
(20 / 10 min), generated **downloads** (60 / 5 min) and administrative
**mutation**s (120 / 10 min).

Every write handler must consume one, enforced by
`tests/api-authorization.smoke.test.ts`. That guard immediately found two gaps:
`POST /api/admin/users` and `POST /api/admin/employees/[role]` — both of which
**mint credentials** — had no limit, while their PATCH counterparts did. Limits are set well
above real use — one an operator can hit during normal work is a bug report,
not security.

Three decisions worth knowing:

- **State lives in Postgres, not memory.** On Vercel each request may hit a
  different serverless instance, so an in-memory counter would limit almost
  nothing while appearing to work.
- **It reuses the `LoginThrottle` table** with namespaced hashed keys. A
  dedicated `Throttle` model would be a better name, but adding one needs
  `prisma generate`, which cannot run in this build sandbox. Renaming it is a
  mechanical follow-up; only the key builder changes.
- **It fails open.** If the database is unreachable the request is allowed: a
  limiter that takes the app down when Postgres hiccups is worse than the abuse
  it prevents, and every guarded route is already behind authentication and a
  permission check.

The limit is consumed **after** the auth check, deliberately — an anonymous
limiter on these routes would be a way for one caller to lock everyone else
out. `*/summary` GET routes are **not** limited: they are the app's normal read
path and capping them would break paging and refresh for real users.

### Upload validation

`lib/upload-safety.ts` now checks three things, cheapest first:

1. **Size and extension** — non-empty, ≤ 20 MB, extension on the endpoint's
   list.
2. **Content signature** — the file's actual first bytes must match the
   container the name claims: `PK\x03\x04` for xlsx/xlsm, the OLE2 magic for
   xls. `file.type` is _not_ trusted: it is absent on many platforms, wrong on
   others and trivially forged. This is what stops a renamed binary or an HTML
   page reaching the spreadsheet parser at all.
3. **Row limit** — 250,000 rows per sheet, enforced at all six `sheet_to_json`
   call sites including the tab-separated `.txt` path. A 20 MB xlsx is a zip
   and can hold well over a million rows; against a 60-second serverless
   function that is an availability incident, and the failure mode is a
   silent timeout that tells the operator nothing.

**A trap worth recording**: `.txt` files must NOT be validated by looking for
NUL bytes. The C2C/C2S exports are frequently UTF-16LE, in which roughly every
second byte is `0x00` — `decodeReportText` exists to handle exactly that. An
early draft of the content check did this and would have rejected every real
text export. It now tests for known binary containers instead, and
`tests/upload-safety.smoke.test.ts` pins the behaviour.

### Request-level defences (`middleware.ts`)

- **Cross-site write rejection.** Every state-changing request to `/api/*` is
  checked against `Sec-Fetch-Site` and, for browsers that do not send it,
  `Origin`. Cross-site writes get a 403 before reaching a handler. This is
  defence in depth behind the `SameSite=Lax` cookie, not a replacement for it.
  There are no server actions in this project, so `/api/*` is complete
  coverage of the mutation surface — **if server actions are ever added, this
  check must be extended to them.** Logic lives in `lib/csrf.ts` as a pure
  function; `tests/security-headers.smoke.test.ts` covers it.

### Response headers (`next.config.mjs` and `middleware.ts`)

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: SAMEORIGIN` (fallback for browsers without
  `frame-ancestors`)
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`, **production
  only** — sent from a dev server it can pin `localhost` to https in the
  developer's browser and break unrelated local projects. `preload` is
  deliberately omitted: submission to the preload list is effectively
  irreversible and should wait until the production domain and its subdomains
  are settled.
- **Content-Security-Policy, enforcing** — see below.

## Content-Security-Policy: enforcing, and how that was established

The policy is built in `lib/csp.ts` and attached per-request by `middleware.ts`.
`cspHeaderName()` is the only switch, and it now returns
`"Content-Security-Policy"`. Nothing else changed to enforce it.

**How the nonce works.** Next.js emits inline bootstrap scripts carrying the
RSC stream. Allowing those with `'unsafe-inline'` would allow every injected
script too, which is most of what a CSP is for. So middleware mints a fresh
128-bit nonce per request, sets it on the _request_ headers, and Next.js reads
it back out and stamps it onto its own script tags. `'strict-dynamic'` then
lets those trusted scripts load their chunks without the policy enumerating
them. All 70 routes in this app are dynamically rendered, so no cached HTML can
serve a stale nonce.

**Why `style-src-attr` is still `'unsafe-inline'`.** React serialises a
`style={{...}}` prop into a `style` attribute during SSR, CSP treats that as
inline style, and nonces do not apply to attributes at all. v124 converted 123
such props to classes; **two remain**, both the width of a progress bar
(`Bar` in `app/components/Kit.tsx`, and the equivalent in
`app/components/OperationsPremiumUI.tsx`). Those are a continuous 0–100%, so
the only way to express them as classes is 101 quantised rules. Two props, not
two attributes: `/rso` renders eleven style attributes because it renders
eleven bars, so a violation count from a browser is not a count of source
sites.

That has deliberately not been done, and the reasoning is worth recording
rather than rediscovering. Dropping `'unsafe-inline'` here would stop an
attacker who can already inject HTML from also injecting a `style` attribute.
Such an attacker cannot run script (`script-src` is nonced with no
`'unsafe-inline'`), and the channels CSS injection normally uses to exfiltrate
data — background images, fonts, `@import` — are all closed by `img-src`,
`font-src` and `connect-src` being `'self'`. So the residual is UI redressing
within the page, weighed against ~300 lines of generated CSS. If that trade
ever stops looking right, the change is: quantise the two widths to whole
percent, generate `.kit-bar-0` … `.kit-bar-100`, and delete **both**
`style-src-attr` and the `'unsafe-inline'` in `style-src` from `lib/csp.ts`.
Removing only `style-src-attr` changes nothing: browsers fall back to
`style-src` for attributes, so the allowance survives. That is not a guess —
it was measured while mutation-testing this policy.

The third page-level exception is `app/global-error.tsx`, which renders its
own `<html>` when the root layout has failed and therefore cannot assume any
stylesheet loaded. Its inline styles are correct and are commented as such.

### The checklist is now executed, not described

This section previously carried a five-step manual checklist that had never
been run, because the build sandbox had no database and only `/login` was
reachable. One page is not the app. That checklist is now code, and it runs on
every suite run rather than once:

| Checklist step                                                     | Where it runs now                                                                                                                                |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1–2. Sign in as each role and walk every area                      | `e2e/coverage.spec.ts` — seven roles, ninety-six routes, against a seeded database                                                               |
| 3. Perform a spreadsheet export and a download (the `blob:` paths) | `e2e/csp-downloads.spec.ts`                                                                                                                      |
| 4. Confirm no CSP report fires on any of it                        | both specs collect `securitypolicyviolation` events per route and fail on any                                                                    |
| 5. Repeat once enforcing                                           | `tests/security-headers.smoke.test.ts` asserts the policy ships enforcing, and `csp-downloads.spec.ts` re-asserts it from a live response header |

**The collector has been proven to fire.** A listener that is installed and
never read back reports zero violations forever, which is silence dressed up as
evidence — the first version of this collector did exactly that and had to be
fixed. The wired version was then mutation-tested: with **both** style
allowances removed from `lib/csp.ts` and the app rebuilt, the RSO sweep failed
with four `style-src-attr blocked inline` violations on `/rso`, `/rso/bp`,
`/rso/lso` and `/rso/sso`, reported separately from the console-error check so
the two cannot be confused for each other. Restoring the allowances returned
the suite to green. Each spec also asserts that `window.__csp` exists before
reading it, so a page where the init script failed to install fails loudly
instead of reporting nothing.

`upgrade-insecure-requests` is back. It is ignored in a report-only policy —
that is the spec, not a browser quirk — and Chrome logged a console error about
it on every page load for every user while the policy was Report-Only. It is
gated on `cspHeaderName()` rather than on `isProduction`, so it returned by
itself the moment enforcement was switched on, which is exactly when it starts
doing anything.

## `/api/health`

Unauthenticated callers get `{ ok: true }` with 200, or `{ ok: false }` with
503 — enough for an uptime monitor and nothing more. Signed-in ADMIN/IT users
additionally get `database`, `latencyMs`, `timestamp` and, on failure, the
driver's error text. It previously gave everyone the full detail, which told an
anonymous prober whether the database was reachable and how loaded it was.

A failure is now always 503. The old code routed through `apiError`, which
returned 500 for anything it did not recognise as a connectivity failure;
monitors read 500 as "the app is broken" rather than "its database is".

## Still open

- **Watch the first enforcing deployment.** The checklist now runs in CI against
  a seeded local database, which is the app but not production data. A route
  whose content differs there — an unusual retailer name, a chart with no rows —
  could still trip something. The first deploy after this flip is worth a walk
  with DevTools open.
- **Remove the style `'unsafe-inline'`** — blocked only by the two progress-bar
  widths; see the reasoning above, including that `style-src-attr` and the
  `'unsafe-inline'` in `style-src` must go together, before spending the 101
  rules it costs.
- **`xlsx` stays, and this is a decision rather than a task.** `npm audit`
  reports it high severity with _no fix available_, and there is no version to
  upgrade to. Replacing it with `exceljs` was investigated in v155 and is not
  possible: **`exceljs` has no legacy BIFF reader**, and the owner confirmed
  that `.xls` files are uploaded. Removing `xlsx` would break every one of
  them.

  What limits the exposure instead: the prototype-pollution path is neutralised
  by `normalizeHeader` (tested), the ReDoS path is bounded by the size and row
  caps, and since v153 the package only ever _reads_ — every file the app hands
  out is produced by `exceljs`. Revisit only if `xlsx` ships a fix or a
  maintained BIFF reader appears.

- **`postcss` and `deepmerge-ts`** report high-severity advisories that npm can
  only resolve with `npm audit fix --force`, which changes major versions.
  Not run: forcing a breaking upgrade of the CSS pipeline unattended is a worse
  risk than the advisory. Owner's call, on a machine where the result can be
  seen.
- **Rotate credentials** before going live, per the Secrets section.

## Blocked in the build sandbox — needs one command on a real machine

`prisma generate` cannot run here: both the query engine and the schema engine
are fetched from `binaries.prisma.sh`, which this environment's egress policy
refuses (403). Consequences:

- `prisma validate` and `prisma migrate` cannot run, so migrations added here
  are written by hand with `CREATE INDEX IF NOT EXISTS` / `ADD COLUMN IF NOT
EXISTS` and **must be applied and checked** with `npm run db:deploy`.
- Any change that adds a **field** to `prisma/schema.prisma` cannot be
  type-checked or built here, because the generated client types would be
  stale. One such change is therefore deferred rather than shipped half-done —
  see `claude/v122` for the Data Readiness coverage model, which needs
  `reportStartDate` / `reportEndDate` on `ImportBatch`.

The `xlsx` upgrade is blocked by the same egress policy (`cdn.sheetjs.com`).
