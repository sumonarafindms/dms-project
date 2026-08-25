# DMS Changelog

## v27
- Modernized GA, C2C, C2S and OB upload/report UI.
- Added date-range filters to GA, C2C, C2S and core Admin performance views.
- Added date-range filtering to Admin Supervisor, RSO, BP and Retailer performance pages.
- OB remains latest-snapshot-only by design, so historical OB date filtering is intentionally unavailable.
- Added monthly Target Upload using RSO_NUMBER or BP_CODE + TARGET_TYPE + TARGET.
- Added Target sample Excel download.
- Added editable RSO and BP monthly targets after import.
- Added BpMonthlyTarget model so BP target history remains month-specific.
- Project root now keeps one CHANGELOG.md instead of separate version-note markdown files.

## v27.1
- Fixed undefined `rangeEnd` reference in BP activation detail build.
- BP detail now correctly uses the selected month `end` boundary.

## v27.2
- Repacked BP detail boundary fix with an explicit source marker to ensure Git detects the corrected file.

## v28
- Increased typography scale across the full DMS.
- Removed tiny 7–9px UI text from key admin, upload, target, permission and performance screens.
- Increased button, input, card and spacing sizes for better mobile readability.
- Improved desktop visual hierarchy and card depth.

## v29
- Added a more colorful modern visual system with blue, violet, cyan, green, amber and rose accents.
- Added gradient dashboard command card, colored KPI cards, richer upload cards and target cards.
- Improved hover, focus, shadows, progress bars, navigation and mobile visual depth.
- Kept readability and typography improvements from v28.

## v30
- Reworked Admin layouts for a more premium management-dashboard feel.
- Upload Center now has a command hero, module cards and a structured safe-import flow.
- Employee Center now has workforce summary, premium hierarchy and access-management panels.
- Permissions uses a desktop split workspace with bulk controls and a sticky user list.
- Target Center uses a split upload/KPI workspace on larger screens.
- Improved spacing and visual rhythm across Admin dashboard sections.

## v31
- Rebuilt the GA page to closely follow the approved premium reference layout.
- Added compact page header and date card, premium upload workspace, colored metric cards and improved empty state.
- Replaced plain spreadsheet tables with gradient sticky headers, identity cells, numeric accents, progress bars and status pills.
- Improved mobile spacing while preserving horizontal table access for detailed operational data.

## v32
- Extended the premium reference design across C2C, C2S and Opening Balance.
- Added the same premium header, upload workspace, colored metrics, identity cells, progress bars and table system used by GA.
- Upgraded Targets, Performance, Employees, Permissions, Audit and Retailer lists with consistent premium cards and table styling.
- Applied gradient headers and improved row spacing to remaining detailed Admin tables.
- Kept all calculation, import, database and permission logic unchanged.

## v33
- Fixed C2S import data-loss risk: only successfully mapped retailers are replaced.
- Made C2C and C2S covered-range delete+insert writes atomic.
- Enforced per-user View permissions on direct role-page access and operational read APIs.
- Added silent role-home redirect for denied server-rendered pages; client operation pages render nothing when View is disabled.
- Enforced Manager -> Supervisor -> RSO scope across Manager dashboard, attention, supervisors, RSOs, retailers and BP activations.
- Manager daily snapshot is now scoped to assigned teams.
- Added exact From/To date filtering across Manager, Supervisor, RSO, BP activation, retailer and employee drill-down flows.
- Added multi-month target aggregation for GA/C2C/C2S/performance date ranges.
- SSO/LSO calculations now preserve monthly threshold boundaries across multi-month ranges.
- SC manual achievement is included only for fully covered calendar months because SC has no daily breakdown.
- Fixed Audit Log “Today” and “Logins Today” boundaries to Asia/Dhaka.
- Added reversed-date-range validation to GA/C2C/C2S summary APIs.

## v34
- Corrected C2C/C2S transaction semantics: daily date columns store amounts only; exact source TRANSACTION_COUNT is stored month-wise.
- Added C2cMonthlySummary and C2sMonthlySummary models and migrations for exact monthly transaction/LSO calculations.
- Reworked SSO/LSO logic to preserve month boundaries across cross-month date ranges.
- Aggregated BP targets across every effective month in the selected range.
- Separated Supervisor RSO GA and BP GA KPIs to avoid target double-counting.
- Normalized RSO/MSISDN mapping across employee, retailer, C2C, C2S and OB imports.
- Added stricter target validation and batched target writes.
- OB import now aborts before replacing the current snapshot if any retailer row is invalid or unmapped.
- Added hierarchy safeguards before Supervisor/RSO deactivation and Manager scope ignores inactive Supervisors.
- Added login throttling, session-token hashing at rest, session revocation on PIN reset/deactivation and safer one-time Admin setup.
- Added 20 MB upload limit and server-side file-extension checks.
- Added Asia/Dhaka business-date helpers for current day/month defaults.
- Batched employee/retailer master imports and added duplicate/conflict validation.
- Moved several heavy GA/C2C/C2S performance calculations to database aggregation.
- Removed old docs/RELEASE_*.md version-note clutter.

## v35 - UI Phase 1
- Rebuilt the Admin Dashboard into a premium command-center layout.
- Added stronger KPI hierarchy, execution score hero, attention cards, premium RSO leaderboard and supervisor overview.
- Reworked Admin desktop navigation into collapsible Overview, Performance, Data Operations and Management groups.
- Added contextual mobile topbar labels while preserving role-aware bottom navigation.
- Upgraded the shared FilterForm into a consistent premium search/date/month toolbar.
- Applied a unified sticky-gradient table system and improved row/avatar styling across Admin and drill-down pages.
- No database or business-logic changes in this UI phase.

## v36 - UI Phase 2
- Refined Upload Center into a premium data-operations workspace.
- Upgraded shared Admin performance headers, reporting-period filters and KPI summaries.
- Converted retailer performance results into responsive mobile-first cards.
- Rebuilt retailer detail into a full profile with ownership, KPI, SSO/LSO status, GA and recharge activity panels.
- Added responsive desktop/tablet/mobile layouts without changing business logic or database schema.

## v37 - UI Phase 3
- Upgraded GA/C2C/C2S/OB import workspaces with guided import flow, file constraints and clearer status feedback.
- Rebuilt Target Management with a premium monthly control hero, guided bulk import and mobile target cards.
- Improved Employee Center, workforce directory lists and employee edit/create forms.
- Rebuilt Users & Access into a dedicated login creation and account directory workspace.
- Refined Permissions Center and permission-user browsing.
- Added mobile-first target editing and access-management polish without changing business logic or database schema.

## v38 - UI Phase 4
- Rebuilt Admin Attention Center with premium prioritization, clearer execution summaries and priority indicators.
- Rebuilt Activity Log into a security-focused audit workspace with timeline presentation and stronger filters.
- Added Admin route loading skeletons for smoother page transitions.
- Added reusable confirmation and status feedback components for risky account actions and form results.
- Added final mobile consistency fixes across attention, audit and general Admin surfaces.
- No database schema or business-rule changes.

## v39 - UI Phase 5
- Rebuilt the Manager experience as a dedicated monitoring interface rather than an Admin-style dashboard.
- Added Manager command dashboard with assigned network summary, monthly execution, live GA/C2C snapshot and team ranking.
- Rebuilt Manager Supervisor and RSO directories with monitoring cards and target-progress status.
- Rebuilt Supervisor team detail and Manager Attention Center for focused field follow-up.
- Added Manager-specific styling to RSO and BP activation drill-down pages.
- Added Manager route loading skeletons and a five-item mobile navigation tailored to monitoring tasks.
- Preserved Manager assignment scope, permissions, date filters and existing business logic.

## v40 - UI Phase 6
- Rebuilt the Supervisor experience as a dedicated mobile-first field team management interface.
- Added Supervisor command dashboard with own RSO/retailer network, attention status, live GA/C2C snapshot and monthly team KPIs.
- Rebuilt My RSOs into performance cards sorted by recharge progress.
- Rebuilt Team Attention with date-aware priority summaries and field follow-up guidance.
- Rebuilt My Retailers using performance-aware retailer cards with GA, C2S, SSO and LSO status.
- Added Supervisor-specific RSO and BP drill-down styling, loading skeletons and five-tab mobile navigation.
- Preserved Supervisor scope, permissions, transaction rules, date filters and database schema.

## v41 - UI Phase 7
- Rebuilt the RSO experience as a strongly mobile-first field-sales application.
- Added RSO home dashboard with monthly GA hero, live GA/C2C snapshot, target KPIs and one-hand quick actions.
- Added retailer visit-priority cards and a dedicated Retailer Focus attention experience.
- Rebuilt My Retailers with performance-aware GA, C2S, SSO and LSO cards.
- Rebuilt My BP into an assignment, target-progress, login-status and activation workspace.
- Added RSO-specific BP activation styling, loading skeletons and five-tab mobile navigation.
- Preserved RSO ownership scope, permissions, exact transaction rules, date filters and database schema.

## v42 - UI Phase 8
- Rebuilt the BP experience as a focused mobile SIM-sales application.
- Added a premium GA Completed hero with monthly target, remaining amount and today's GA.
- Added RSO and Supervisor reporting context without exposing data outside the BP mapping.
- Added recent SIM activations directly to BP Home.
- Rebuilt Activation Details with date range, SIM search, target progress and 150/300 GA summaries.
- Added BP-specific mobile navigation and loading skeletons.
- Preserved BP assignment boundaries, permissions, target logic and database schema.

## v43 - UI Phase 9
- Added a final cross-role UI consistency layer for Admin, Manager, Supervisor, RSO and BP.
- Standardized touch targets, keyboard focus states, mobile safe-area spacing, cards, empty states and responsive page rhythm.
- Refined shared retailer, detail, filter and list surfaces across roles.
- Polished Login and first-time Admin Setup into the same premium DMS visual system.
- Improved mobile sticky navigation, tablet spacing and desktop density without changing role-specific experiences.
- No database schema, permissions or business-rule changes.

## v44 - Phase 10 Regression & Deploy Readiness
- Ran full route, import, Prisma reference, syntax and permission regression scans.
- Added explicit module permission enforcement to the Admin performance redirect.
- Added retailer view/add permission enforcement to the Admin retailer upload workspace.
- Verified dynamic sample download endpoints used by GA, retailer and target upload pages.
- Preserved all 11 existing migrations and the APP_DATABASE_URL database configuration.

## v45 - Phase 11 Workflow QA
- Cross-checked the full Admin upload → targets → user mapping → role login → scoped dashboard workflow.
- Fixed Accounts default permission so the existing Opportunity/Attention page is actually reachable without a custom override.
- Normalized BP assignment/deactivation date boundaries to the Asia/Dhaka business date to prevent partial next-day activation leakage.
- Made field mobile login accept common 01 / 8801 / +8801 number formats while sharing the same login-throttle bucket.
- Verified frontend API calls resolve to existing API routes and preserved all existing role scopes and database migrations.

## v46 - UI Phase 12
- Rebuilt Accounts as a dedicated data-operations experience rather than a generic role dashboard.
- Added Accounts data-health dashboard, freshness indicators, source-specific import shortcuts and lookup tools.
- Rebuilt Operations Center with permission-aware module availability and corrected shared operation back-navigation for Accounts routes.
- Rebuilt Retailer Search, Opportunity and RSO/BP reference pages with Accounts-specific context.
- Added Accounts loading skeletons and six-destination mobile navigation.
- Preserved upload validation, permissions, database schema and existing transaction logic.

## v47 - Phase 13 Production Hardening
- Added production-safe API error handling that returns 503 for database outages without exposing raw ORM/parser details.
- Added `/api/health` database connectivity diagnostics with no-store responses for deployment checks.
- Added explicit Node runtimes and longer execution windows for file-import endpoints.
- Added application error, global error and 404 experiences consistent with the DMS UI.
- Added safe production response headers and disabled the framework signature header.
- Hardened login throttling against user-targeted lockout by including the client network hint.
- Added opportunistic expired-session cleanup during login.
- Preserved all role scopes, import rules, database schema and existing migrations.

## v48 - Premium Interface Pass
- Upgraded the full DMS shell with a floating glass sidebar, richer navigation states and a cleaner application canvas.
- Increased visual hierarchy, spacing rhythm, card depth and responsive density across Admin, Manager, Supervisor, Accounts, RSO and BP.
- Enhanced role heroes, KPI cards, action panels, retailer cards, ranking lists, tables, filters and upload workspaces.
- Added stronger desktop module composition and a floating premium mobile bottom navigation.
- Preserved all business logic, permissions, API contracts, database schema and role-specific workflows.

## v49 - Admin Executive Command Center
- Reworked the Admin home composition into a denser executive performance dashboard.
- Added executive intelligence cards for top performer, priority risk, target coverage and network density.
- Added an Operations Control panel linking uploads, activity history and access control.
- Refined Admin hero, KPI cards, leaderboard, shortcuts and Supervisor performance cards for a stronger desktop command-center layout.
- Added responsive executive layouts without changing API calls, business calculations, permissions or database schema.

## v50 - GA Product Code and SIM SWAP
- GA import now requires and stores PRODUCT_CODE.
- MMST/MMSTs are treated as 300 SIM GA and MMSTC as 170 SIM GA.
- SIMWAP and EV-SWAP are tracked separately as SIM SWAP.
- SIM SWAP is excluded from GA achievement, target progress, SSO qualification, retailer opportunity GA logic, BP GA achievement and performance intelligence.
- Added retailer-wise, employee-wise and selected-day SIM SWAP counts on the GA workspace.
- Updated the downloadable GA sample with PRODUCT_CODE and swap examples.

## v51 - SIM SWAP Price Verification
- SIMWAP and EV-SWAP now require SELLING_PRICE 350 during GA import validation.
- Product code and selling price are checked together before a row is accepted as SIM SWAP.
- Invalid swap-price rows are rejected into import errors instead of affecting GA or SIM SWAP counts.
- Updated GA guidance and sample workbook to use selling price 350 for replacement SIM rows.

## v54 - Login & Landing Repair
- Root route now sends logged-out visitors directly to Login and logged-in users to their role home.
- Rebuilt Login as a clean responsive premium authentication experience with authoritative styles.
- Removed the First-time Admin setup link from the Login interface.
- Guarded `/setup` on the server so it automatically redirects to Login once any DMS user exists.
- Preserved the one-time setup API for truly empty databases.
