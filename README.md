# DMS — Distribution Management System

Mobile-first distribution management for a field sales organisation, built with
Next.js 15 (App Router), TypeScript, Prisma 6 and PostgreSQL.

## Modules

- Supervisor → RSO → Retailer master hierarchy
- Dynamic BP assignment from existing retailer codes, with effective-date history
- Role-based login for Admin, IT, Manager, Supervisor, Accounts, RSO and BP
- Admin Users & Access, Permissions, and BP Management
- GA activation import with SIM-level duplicate protection
- C2C and C2S cumulative imports, and LSO calculation
- Opening Balance snapshot import
- Monthly targets and manual SC achievement
- Attention centres (SSO/LSO execution gaps) per role
- IT Reporting Centre with date-range reports and Excel export
- Role-specific dashboards on one shared UI kit

## Business rules

The rules that decide GA, SSO and LSO live in **`lib/business-rules.ts`** and
nowhere else. Read that file before changing anything that produces a number.

- Standard GA = MMSTC (৳170) + MMST/MMSTS (৳300). SIMWAP and EV-SWAP are
  replacements and never count as GA.
- SSO: a SIM seller (`simSeller = Y`) with at least 2 standard GA in a calendar
  month.
- LSO: monthly C2S of at least ৳500 **and** at least 7 transactions.
- All business dates are Dhaka time, a fixed UTC+6 (`lib/business-time.ts`).
  Ranges are half-open in UTC: `{ gte: start, lt: endExclusive }`.

## BP workflow

1. Admin opens **BP Management**.
2. Select an RSO.
3. Select one retailer already under that RSO.
4. Choose the effective date and an optional GA target.
5. Assign BP.
6. The previous active BP for that RSO is closed and kept in history.
7. If the previous BP had a login, that login follows the new BP retailer code.
8. New BP logins are created from **Users & Access**, only for an active
   assignment.

Historical reports resolve the assignment that was in force on the date being
reported, not whichever is active today (`lib/bp-period.ts`).

## Local development

```bash
npm ci
npm run db:generate     # prisma generate
npm run dev
```

The first user is created at `/setup`, which refuses to run once any user
exists. Team members sign in at `/login`; administrators at `/sacool`.

## Deployment

The database connection variable is **`APP_DATABASE_URL`**.

**Migrations do not run during the build.** The build command is:

```bash
next build --turbopack
```

Run migrations as their own deployment step, before the new build serves
traffic:

```bash
npm run db:deploy       # prisma migrate deploy
```

Running `prisma migrate deploy` inside the build was removed deliberately: a
build that migrates can leave the database ahead of the running code if the
deploy then fails.

`--turbopack` is required. The webpack CSS minifier crashes on the `@property`
and `color-mix()` declarations in `styles/tokens.css`.

Do not commit or ship `.env*`, `notepad.env`, `.git`, `.vercel` or
`node_modules`.

### After a deployment that adds C2C/C2S summary migrations

Upload the current cumulative C2C and C2S files once. This populates the exact
monthly `TRANSACTION_COUNT` summaries that LSO depends on. Old daily amount
records are preserved.

## Checks

```bash
npm run format:check
npx tsc --noEmit
npm run lint
npm test
npm run build
npm audit
```

`npm audit fix --force` must never be run here — see **SECURITY.md**, which
records what each remaining advisory actually means for this codebase.

### Browser tests

`npm test` is unit and integration only and needs nothing running. The browser
suite is separate because it needs a served app:

```bash
npm run build && npm start          # in one terminal
npm run e2e:public                  # in another
```

`e2e/public.spec.ts` covers the routes reachable without a session — both login
pages and the root redirect — at **320, 360, 390, 430, 768, 1024 and 1440px**,
asserting no horizontal overflow, WCAG 2.1 AA tap targets (24px, with the
inline-link exception applied) and a clean console. It needs no database, so it
runs on a fresh checkout and in CI.

`e2e/roles.spec.ts` walks each role's own pages at the same widths and **skips
unless you give it credentials**. A spec that fails on a fresh checkout for
want of a database teaches people to ignore red, so it opts in:

```bash
E2E_BASE_URL=https://your-deployment \
E2E_RSO_USER=01700000000 E2E_RSO_PASS=... \
E2E_SUPERVISOR_USER=... E2E_SUPERVISOR_PASS=... \
npm run e2e -- e2e/roles.spec.ts
```

Only the roles you supply run. Start with RSO and SUPERVISOR — they are the
field roles, and the phone widths are what the suite is really for.

### Why there is no Zod

`zod` was a dependency until v125 and was imported by **zero files**. Rather
than adopt it across ~23 API routes as a second validation layer, it was
removed: the routes already validate through typed parsers
(`lib/date-range.ts`, `lib/sheet-headers.ts`, the importers) and permission
checks, and an unused dependency is only supply-chain surface. If schema
validation is wanted later, adopt it deliberately at the API boundary and in
one pass — not by leaving the package installed.

## Where things live

| Path                                               | What                                                        |
| -------------------------------------------------- | ----------------------------------------------------------- |
| `lib/business-rules.ts`                            | GA / SSO / LSO definitions — the single source              |
| `lib/performance.ts`                               | Per-employee target vs achievement                          |
| `lib/report-data.ts`                               | Reporting Centre queries                                    |
| `lib/sort.ts`, `lib/rso-sort.ts`, `lib/bp-sort.ts` | List ordering offered in the filter bar                     |
| `app/components/Kit.tsx` + `styles/kit.css`        | The role UI kit — every page is built from it               |
| `styles/README.md`                                 | How the stylesheets fit together, and the specificity traps |
| `SECURITY.md`                                      | Dependency advisories, exposure assessment, open hardening  |
