# DMS v83 Cleanup & Stability Pass

## Task 1 — CSS structure

Created:

- `styles/tokens.css` — shared `:root` design tokens only.
- `styles/base.css` — reset, shell, base cards, navigation primitives and shared responsive foundation.
- `styles/foundation-auth-legacy.css` — early role/login/legacy feature layers.
- `styles/operations-tables.css` — operations, upload, target and table layers.
- `styles/role-dashboards.css` — manager/supervisor/RSO/BP dashboard layers.
- `styles/premium-shell-auth.css` — premium shell and auth-era layers.
- `styles/responsive-upload-data.css` — mobile, upload and data presentation layers.
- `styles/components-forms-contrast.css` — shared cards/forms/contrast/detail foundations.
- `styles/details-navigation-analytics.css` — detail pages, navigation and analytics.
- `styles/tables-accessibility-interactions.css` — dense tables, accessibility and interaction states.
- `styles/forms-auth-dialogs.css` — form hierarchy, authentication and dialogs.
- `styles/layout-composition.css` — latest layout/composition system plus pagination controls.
- `styles/employee-control-center.css` — v82 Employee Control Center hard-scoped repair.
- `styles/README.md` — rule for future scoped styling.

`app/globals.css` is now an import manifest. Existing cascade order was preserved deliberately to avoid visual changes.

No ambiguous duplicate selectors were deleted automatically. The file contains many intentional later-version overrides; deleting them without rendered visual regression testing would violate the "no visual output changes" requirement.

## Task 2 — ESLint + Prettier

Added:

- `eslint.config.mjs`
- `.prettierrc.json`
- `.prettierignore`
- npm scripts: `lint`, `lint:fix`, `format`, `format:check`
- ESLint/Prettier dev dependencies.

The sandbox could not complete dependency installation, so ESLint/Prettier execution could not be truthfully confirmed here. No logic was changed merely to satisfy lint rules.

## Task 3 — Pagination

Paginated the remaining unbounded GET list payloads found in the 22 API route files:

- `/api/ob/summary` — `page`, `pageSize`, max 100, metadata added. Total opening balance and retailer count remain global totals.
- `/api/master/summary` — `employeeRows` paginated with metadata while existing summary counts remain unchanged.

Frontend page controls were added to:

- `app/ob/page.tsx`
- `app/master-data/page.tsx`

Other `findMany` calls without pagination were write/import support queries, not list-returning GET endpoints, so they were intentionally not changed.

## Task 4 — Smoke tests

Added Vitest and:

- `tests/auth.smoke.test.ts` — credential verification and repeated-failure lock threshold.
- `tests/permissions.smoke.test.ts` — default denial and explicit permission override.
- `tests/ga-import.smoke.test.ts` — GA required-heading normalization and business-date parsing.
- `lib/login-policy.ts` — pure lockout threshold helper used by the existing login route.
- `vitest.config.ts`.

Logic-sensitive note: login lockout arithmetic was extracted to a pure helper so it can be tested. Constants and behavior remain the same (5 failures, 15 minutes).

## Task 5 — Accessibility

- Added an accessible sign-out label.
- Added an accessible home label to the mobile avatar link.
- Added an associated hidden label to the legacy Master Data file input.
- Added reusable `.sr-only`.

## Validation

- TypeScript/TSX syntax parser: 209 files checked, 0 syntax errors.
- CSS: 13 split stylesheets checked, 0 brace-balance errors.
- `npm run build` was attempted, but this execution sandbox does not have a usable installed dependency tree (`next` could not execute). Therefore a successful production build is NOT claimed.

Run locally:

1. `npm install`
2. `npm run lint`
3. `npm run format:check`
4. `npm test`
5. `npm run build`

No Prisma schema, migrations, auth permissions, role mapping, import database behavior, or API response fields were removed.

## v83.1 verification patch

- Fixed ESLint flat-config ESM resolution by using the `.js` Next config entry points.
- Replaced the failing GA smoke-test imports with dependency-light pure helpers in `lib/ga-parse.ts`.
- Restored `lib/ga-import.ts` to its production-facing export surface.
- Scoped Prettier verification to the newly maintained stability/test/config files, avoiding a 226-file formatting-only rewrite.

## v83.2 lint/format/build-warning patch

- Replaced the incompatible direct spread of Next 15 ESLint configs with `FlatCompat`.
- Added `@eslint/eslintrc` as an explicit dev dependency.
- Kept legacy lint findings that would require behavior-oriented refactors as warnings instead of silently changing application logic.
- Formatted the maintained stability/test/config files.
- Replaced CSS alignment `start`/`end` values with compatibility-safe `flex-start`/`flex-end` equivalents to remove Autoprefixer mixed-support warnings without changing layout intent.
