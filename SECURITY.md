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
- `/setup` transactionally refuses to create a second first-admin.
- Every non-public API route checks role and, for mutations, module permission.
- Upload size capped at 20 MB.
- No `eval`, `new Function`, `dangerouslySetInnerHTML`, raw SQL helpers or
  child-process execution in application source.

### Rate limiting

Beyond the existing login throttle, three buckets are counted per authenticated
user (`lib/rate-limit.ts`): **upload** (30 / 10 min), **credential** changes
(20 / 10 min) and generated **downloads** (60 / 5 min). Limits are set well
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
   xls. `file.type` is *not* trusted: it is absent on many platforms, wrong on
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
- **Content-Security-Policy, currently `Report-Only`** — see below.

## Content-Security-Policy: shipped as Report-Only, and how to enforce it

The policy is built in `lib/csp.ts` and attached per-request by `middleware.ts`.

**How the nonce works.** Next.js emits inline bootstrap scripts carrying the
RSC stream. Allowing those with `'unsafe-inline'` would allow every injected
script too, which is most of what a CSP is for. So middleware mints a fresh
128-bit nonce per request, sets it on the *request* headers, and Next.js reads
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
the only way to express them as classes is 101 quantised rules.

That has deliberately not been done, and the reasoning is worth recording
rather than rediscovering. Dropping `'unsafe-inline'` here would stop an
attacker who can already inject HTML from also injecting a `style` attribute.
Such an attacker cannot run script (`script-src` is nonced with no
`'unsafe-inline'`), and the channels CSS injection normally uses to exfiltrate
data — background images, fonts, `@import` — are all closed by `img-src`,
`font-src` and `connect-src` being `'self'`. So the residual is UI redressing
within the page, weighed against ~300 lines of generated CSS. If that trade
ever stops looking right, the change is: quantise the two widths to whole
percent, generate `.kit-bar-0` … `.kit-bar-100`, and delete
`style-src-attr` from `lib/csp.ts`.

The third page-level exception is `app/global-error.tsx`, which renders its
own `<html>` when the root layout has failed and therefore cannot assume any
stylesheet loaded. Its inline styles are correct and are commented as such.

**What has been verified here.** Against a production build served by
`next start`, loaded in headless Chromium: the header is present, all 17 script
tags carry the nonce, the nonce matches the header and differs per request, the
page hydrates (typing into a React-controlled input returns its value), and
**zero `securitypolicyviolation` events fire**.

The policy was then re-run **as enforcing**, by rewriting the header name in
front of the browser so the same policy and the same nonce arrived under
`Content-Security-Policy`. Still zero violations, and still hydrated. So on the
one page reachable here the enforcing policy is not a guess — it has been run.

**What has not.** Only `/login` could be exercised, because this build sandbox
has no database and every other page's layout calls `getCurrentUser()`. One
page is not the app: the reporting centre's exports, the upload centre's file
handling and the chart components are exactly the places a policy is most
likely to catch on something, and none of them were reached. That is why the
policy still ships under `Content-Security-Policy-Report-Only`: a CSP that
blocks something the app needs fails in the browser, where no server-side test
would catch it.

### Checklist before flipping to enforcement

`cspHeaderName()` in `lib/csp.ts` is the only switch. Before changing it:

1. Deploy with Report-Only against a real database.
2. Sign in as each role and walk every area — dashboards, drill-downs, the
   import/upload centre, the reporting centre, targets, admin people/access.
3. Perform a spreadsheet export and a file upload (the `blob:` paths).
4. With DevTools open, confirm the console logs no CSP report on any of it.
5. Then flip `cspHeaderName()` to `"Content-Security-Policy"` and repeat step 2
   once.

`tests/security-headers.smoke.test.ts` asserts the header is still Report-Only,
so the flip is a deliberate act that updates a test, not something a refactor
can do by accident.

One console message is expected and harmless under Report-Only:
`'upgrade-insecure-requests' is ignored when delivered in a report-only
policy`. The directive is kept because it takes effect on enforcement — do not
"fix" the warning by deleting it.

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

- **Enforce the CSP** once the checklist above passes on a real deployment.
- **Remove `'unsafe-inline'` from `style-src-attr`** — now blocked only by the
  two progress-bar widths; see the reasoning above before spending the 101
  rules it costs.
- **Upgrade `xlsx`** — blocked by this sandbox's egress; command above.
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
