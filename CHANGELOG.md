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

## v55 - Vercel Build Lock Fix

- Removed `prisma migrate deploy` from the npm build script so Vercel deployments no longer compete for PostgreSQL advisory migration locks.
- `npm run build` now runs only `next build`.
- Added an explicit `npm run migrate` command for controlled database migrations.
- Added `npm run prisma:generate` for local/client generation when needed.
- Database schema and existing migrations are unchanged.

## v56 - Main URL Role Routing

- The root URL now performs a server-side session check on every request.
- Logged-in Admin users are sent directly to `/dashboard`.
- Manager, Supervisor, Accounts, RSO and BP users are sent directly to their own role home.
- Logged-out visitors are sent directly to `/login`.
- The legacy root landing screen is no longer part of the main URL flow.

## v57 - Force Login on Main Domain

- The root URL `/` now always redirects to `/login`, regardless of any session state.
- Added a root-only middleware redirect as an additional edge-level safeguard.
- Users reach role dashboards only after a successful login redirect.
- This removes the legacy landing/dashboard experience from first domain visits and Google/search entry.

## v58 - IT Role & Private Admin Login

- Added a new `IT` user role with the same application permissions and Admin workspace access as Admin for now.
- IT accounts use the normal Team Login with mobile number and PIN.
- Removed the Admin option entirely from the public Team Login page.
- Added a separate administrator-only login page at `/sacool`.
- Normal Team Login explicitly rejects ADMIN accounts even if an Admin has a mobile number.
- Admin access continues to require Admin credentials and the dedicated `/sacool` flow.
- Added the PostgreSQL enum migration for the new IT role.

## v59 - Employee Control Center IT Card Repair

- Added IT user count to the Employee Control Center hero.
- Added IT as a fifth premium EmployeeHubCard using the existing card component and design system.
- Kept IT outside the field reporting hierarchy while linking it to Login Accounts management.
- Added responsive five-card desktop layout and tablet fallback without introducing raw/un-styled role markup.

## v60 - Mobile Responsive Premium Pass

- Rebuilt Performance pages around a mobile-first layout instead of shrinking the desktop interface.
- Compact mobile search/date filters into a predictable search + two-date + apply layout.
- Prevented page-width overflow and clipped text on narrow phones.
- Reworked KPI summary cards and RSO performance cards for readable mobile density.
- Fixed the fixed bottom navigation so all items remain inside the viewport.
- Made wide tables independently horizontally scrollable without widening the entire page.
- Added dedicated small-phone and tablet responsive behavior.

## v61 - Premium Upload Center & Validate-Before-Write Imports

- Reworked Upload Center into premium Operational Feeds and Control Data sections.
- Added visible header/data/mapping validation stages to every upload module.
- Import APIs now return the exact validation problem instead of the generic "Import failed" fallback.
- GA reports all missing required headings together and stops before database writes when row data or retailer mappings are invalid.
- C2C and C2S locate the best header candidate and list exact missing headings; invalid/unmapped rows now stop the import before operational data is written.
- OB retains strict full-file validation and now surfaces its exact validation error to the UI.
- Retailer/Employee master imports report exact missing headings and stop before writes when row validation fails.
- Target import reports exact missing headings and validates the full file before applying any target updates.
- IT retains Admin-style upload access.

## v62 - Global Premium UI / UX Pass

- Added a global premium visual layer across all role pages without changing business logic.
- Standardized card radii, shadows, spacing, form focus states, buttons and typography hierarchy.
- Upgraded all shared HTML tables with sticky gradient headers, zebra rows, hover feedback, numeric alignment-friendly typography and responsive horizontal scrolling.
- Improved mobile/tablet table density so wide operational data remains usable without widening the whole page.
- Expanded the reusable SVG icon library with calendar, file, check, alert, filter, arrow, edit, download and shield icons for richer page-level UI.
- Preserved all v61 upload validation behavior, IT access, Sacool and existing operational rules.

## v63 - Live Dynamic Search

- Server-rendered performance and drill-down search fields now auto-filter after a short typing debounce.
- Search by name, code, mobile, supervisor, retailer or SIM without pressing Search/Apply.
- Date and month filters auto-apply immediately after selection.
- Activity Log text/module/action filters are live.
- Existing client-side Employees, Users and Targets searches remain instant.

## v64 - Premium Table & Mobile Data Experience

- Upgraded table styling across the application with sticky gradient headers, hover focus, first-column emphasis and cleaner numeric presentation.
- Added a reusable mobile table scroll hint.
- Heavy operational tables now show a swipe hint on mobile and preserve the first column while horizontally scrolling.
- Improved mobile table density, empty states, search-field sizing and data-card spacing.
- Preserved v63 live dynamic search and v61 validation logic.

## v65 - Unified Premium Visual System

- Added a consistent premium visual language across dashboards, detail pages, upload modules, cards, forms and navigation.
- Improved card depth, metric hierarchy, page spacing, hover states and action-card interaction.
- Standardized success/warning/error status pill styling.
- Enhanced upload/drop areas and form focus treatment.
- Added a reusable PremiumBadge component and applied icon-led badges to operational headers.
- Added subtle loading shimmer styling and improved mobile/desktop spacing consistency.
- Preserved v64 responsive tables, v63 live search and v61 validate-before-write imports.

## v66 - Premium Forms & Feedback

- Added reusable PremiumFeedback and PremiumFormSection components.
- Operational upload messages now use clear success/error/info feedback cards instead of plain text.
- Target and Retailer import feedback now uses the same status system.
- Improved form hover/focus/disabled states, textarea behavior and mobile single-column form layout.
- Enhanced sticky action bars, back links, keyboard focus visibility and touch interaction.
- Added subtle page entrance motion with reduced-motion support.
- Preserved v65 visual system, v64 table UX, v63 live search and v61 validate-before-write imports.

## v67 - Contrast & Readability

- Corrected low-contrast text across dark profile/hero areas and light/pastel cards.
- Retailer profile hero now uses white primary text, brighter metadata and readable secondary labels.
- KPI values, warning/status panels, recent activity cards and table content now have explicit foreground colors.
- Improved sidebar, button, input, placeholder, badge and empty-state readability.
- Added defensive contrast rules so inherited colors do not disappear into matching backgrounds.
- Preserved all v66/v65/v64/v63 functionality and import validation.

## v68 - Premium Detail & Profile Pages

- Refined Retailer/profile hero composition, metadata cards, KPI cards, status panels and recent activity sections.
- Improved detail page spacing, depth, color hierarchy and responsive behavior.
- Added a reusable PremiumDetailStat component for future Manager/Supervisor/RSO detail-page metrics.
- Retailer profile now scales to 2-column KPI/meta layouts on tablet/mobile and single-column recent activity panels on phones.
- Preserved v67 contrast corrections, v66 feedback, v64 tables and v63 live search.

## v69 - Premium Navigation & Page Orientation

- Refined desktop sidebar spacing, section labels, active states, icons, hover behavior and role/user blocks.
- Added clearer active-item indicators and improved section hierarchy.
- Upgraded mobile bottom navigation with glass treatment, active underline and improved small-phone fit.
- Standardized breadcrumb/back-link treatment for stronger page orientation.
- Added reusable NavContext component for contextual navigation labels.
- Preserved v68 detail profiles, v67 contrast, v66 forms, v64 tables and v63 live search.

## v70 - Premium Dashboard & Analytics Presentation

- Refined KPI cards across Admin, Manager, Supervisor, RSO and Accounts dashboards.
- Improved ranking/team cards, action cards and section containers for faster data scanning.
- Added reusable PremiumProgress component for target-vs-achievement visualization.
- Standardized dashboard section headings and responsive metric density.
- Improved mobile KPI grids and quick-action layouts.
- Preserved v69 navigation, v68 detail profiles, v67 contrast, v64 tables and v63 live search.

## v71 - Premium Data Tables & Filters

- Upgraded operational tables with stronger headers, row hierarchy, hover states, sticky headings and cleaner density.
- Improved horizontal scrolling and table shells for mobile/tablet.
- Refined search/filter panels, inputs, selects and live-search presentation.
- Added standardized result-count styling and compact table action controls.
- Added reusable PremiumDataHeader component for table/list pages.
- Preserved v70 dashboards, v69 navigation, v68 profiles, live search and import validation.

## v72 - Premium Interaction States

- Added reusable PremiumEmpty, PremiumLoading and PremiumDangerNote components.
- Standardized loading spinners, disabled/busy buttons and destructive action styling.
- Reworked operational empty states to use the shared premium empty-state system.
- Improved interaction feedback for clicks, uploads, save states and data-empty views.
- Added mobile-aware toast-zone helper for future notifications.
- Preserved v71 data tables, v70 dashboards, v69 navigation, live search and import validation.

## v73 - Accessibility & Responsive Density

- Improved typography scaling, line-height and text wrapping across pages.
- Increased critical form readability and mobile input sizes to prevent iOS zoom.
- Added coarse-pointer touch-target improvements, reduced-motion support and high-contrast mode.
- Added overflow/clipping safeguards for dense responsive layouts.
- Added print-friendly dashboard/table behavior.
- Added reusable SkipLink component for keyboard navigation.
- Preserved v72 interaction states, v71 tables, v70 dashboards and all existing business logic.

## v74 - Premium Micro-interactions & Help UX

- Standardized hover, active and press behavior across cards, quick actions, upload modules and list rows.
- Improved equal-height action/card grids and shared icon sizing.
- Added reusable PremiumHint component with keyboard-accessible tooltip/help popovers.
- Refined badges, dividers, helper copy and subtle section accents.
- Added mobile-safe tooltip behavior and reduced-motion support.
- Preserved v73 accessibility, v72 interaction states, v71 tables, live search and import validation.

## v75 - Premium Forms & Action Hierarchy

- Standardized inputs, selects, textareas, checkboxes and form-label presentation.
- Strengthened primary, secondary and destructive button hierarchy.
- Improved save/action bars and mobile full-width action behavior.
- Added reusable PremiumFieldGroup and ActionToolbar components.
- Added inline validation-ready success/error styles and required-field markers.
- Preserved v74 micro-interactions, v73 accessibility, v71 tables and all existing business logic.

## v76 - Premium Authentication Experience

- Refined the public team login with stronger brand hierarchy, readable dark-panel contrast and premium role cards.
- Upgraded login form spacing, focus states, error/help feedback and mobile behavior.
- Added dedicated responsive treatment for small phones and iOS input zoom prevention.
- Polished the hidden /sacool administrator login surface without exposing admin login on the public team page.
- Preserved IT role, authentication logic, redirects and all existing business functionality.

## v77 - Premium Page Headers & Toolbars

- Added reusable PremiumPageHeader component for consistent title, subtitle, icon, metadata and action layouts.
- Normalized existing page headers, top actions and toolbar spacing across operational/admin pages.
- Improved mobile action stacking so buttons, filters and page actions no longer wrap awkwardly.
- Refined tablet and extra-wide desktop header behavior.
- Preserved v76 authentication styling, v75 form hierarchy, v74 micro-interactions and all business logic.

## v78 - Premium Dialogs & Notifications

- Added reusable PremiumDialog for confirmation, warning and destructive actions.
- Added reusable PremiumToast for success, error, warning and informational notifications.
- Added premium danger-zone styling for critical settings/actions.
- Improved busy/confirmation action hierarchy and mobile bottom-sheet dialog behavior.
- Added reduced-motion support for dialogs and notifications.
- Preserved v77 page headers, v76 login, v75 forms, live search, import validation and all business logic.

## v79 - Major Interface & Layout Refinement

- Reworked the global visual shell with cleaner page rhythm, premium card surfaces and stronger content hierarchy.
- Improved dashboard grids, KPI alignment, list/directory surfaces and section grouping.
- Refined page hero surfaces, form grouping, upload layouts and table placement.
- Added dedicated tablet and mobile layout rules instead of relying only on desktop shrinking.
- Added reusable PremiumLayoutGrid for main-content + contextual-aside layouts.
- Preserved all existing authentication, import, SIM SWAP, role, search and business logic.

## v80 - Premium Visual Polish

- Unified the global color system for text, cards, chips, badges, avatars and status states.
- Added subtle accent lines and improved section separation for stronger visual hierarchy.
- Refined neutral card hover states, avatar/icon tiles and toolbar surfaces.
- Added dedicated laptop, large-screen, mobile and extra-small-phone density tuning.
- Added reusable PremiumDivider and StatusBadge components.
- Preserved all prior UI, live search, import validation, authentication, role and business logic.

## v81 - Premium Page Composition

- Standardized page, section, card, KPI and action-grid composition across the application.
- Added responsive auto-fit KPI grids and consistent action-card layouts.
- Improved upload, target, permission, employee and profile section grouping.
- Added reusable PageStack and PageGrid components.
- Added tablet/mobile-specific grid behavior so dense pages collapse predictably.
- Preserved v80 visual polish, live search, import validation, IT access and all business logic.

## v82 - Employee Control Center Render Repair

- Rebuilt the Employee Control Center with page-scoped CSS to eliminate global-style collisions.
- Restored high-contrast hero typography and authorized-user summary.
- Replaced broken/raw role links with five responsive role cards for Manager, Supervisor, RSO, BP and IT.
- Rebuilt hierarchy and access-management panels with explicit responsive layouts.
- Kept database counts, routes, ADMIN/IT access and existing business logic unchanged.

## v84 - Dashboard Readability Redesign

- Rebalanced the admin dashboard for desktop and large-screen readability.
- Reduced admin sidebar width and constrained the dashboard canvas.
- Reduced the oversized execution hero and improved top action balance.
- Changed Business KPI presentation from a squeezed six-column row to a spacious 3 x 2 grid.
- Changed Executive Intelligence to a readable 2 x 2 grid.
- Increased important text, table, card, and helper-text sizing.
- Kept calculations, routes, permissions, APIs and database behavior unchanged.

## v85 - Interface Repair

- Fixed oversized desktop sidebar/blank-column behavior at 100% browser zoom.
- Re-centered the admin dashboard canvas and prevented ultra-wide stretching.
- Improved laptop and large-monitor breakpoints.
- Reduced visual density while preserving readable KPI and intelligence layouts.
- Added subtle surface, hover and spacing improvements.
- Business logic, APIs, auth, permissions and database behavior unchanged.

## v86 - Admin Shell Visual QA

- Harmonized all admin pages to the same centered desktop canvas used by the repaired dashboard.
- Refined sidebar states, spacing, profile card and sign-out treatment.
- Standardized admin cards, tables, action sizes and section rhythm.
- Improved tablet KPI layouts and mobile top/bottom navigation.
- Added consistent focus-visible and reduced-motion handling.
- Business logic, APIs, auth, permissions and database behavior unchanged.

## v87 - Aurora Slate Full Interface Theme

- Reworked the complete application visual identity with a teal/slate palette.
- Converted desktop sidebar to a dark premium navigation surface.
- Updated dashboard, cards, tables, forms, buttons, badges and links.
- Restyled login, hidden admin login, upload center, employee control center and detail/profile surfaces.
- Updated mobile navigation and responsive surfaces to match the new identity.
- Kept all business logic, calculations, APIs, permissions, authentication and database behavior unchanged.

## v88 - Layout System Repair

- Replaced competing v85/v86 shell layers with one authoritative desktop layout layer.
- Desktop admin navigation is now fixed to the viewport with its own vertical scrolling.
- Removed the large blank gap between the sidebar and page content at 100% browser zoom.
- Standardized sidebar width, menu row sizing, wrapping and nested-group spacing.
- Rebuilt desktop Performance headers, reporting-period panel, filters, KPI summary and card grids with explicit dimensions.
- Preserved responsive tablet/mobile behavior and all application business logic.

## v89 - Fast Navigation

- Added proactive prefetching for common admin routes and hover/focus prefetch for every sidebar link.
- Added immediate sidebar navigation feedback while the destination server page loads.
- Preserved sidebar scroll position across route changes.
- Locked pointer-events so decorative CSS cannot intercept menu clicks.
- Added route loading skeleton/progress feedback for admin navigation.
- No database query, API, permission, auth or business calculation behavior changed.

## v90 - Modern Analytics UI

- Added reusable dependency-free analytics charts using live dashboard/performance data.
- Added top-RSO execution and supervisor comparison charts to the executive dashboard.
- Added team execution chart to Supervisor Performance.
- Redesigned tables as modern enterprise data grids with stronger headers, row rhythm and hover states.
- Improved performance cards, detail/profile metadata, KPI readability and activity panels.
- No fake chart data, API changes, database changes or business-logic changes.

## v91 - Account Editing & Stability

- Added Edit / PIN controls for created login accounts.
- Admin/IT can update display name, mobile number, role mapping and optionally set a new PIN.
- Security-sensitive account edits revoke existing sessions.
- Employee Control Center now retries transient database connection failures before rendering.
- If retries still fail, Employee Control Center shows an in-page recovery state instead of the global error screen.
- Repaired executive dashboard heading, reporting-month selector and Upload Center action alignment.

## v92 - Professional Interaction Polish

- Refined Login Accounts into a clearer enterprise account directory.
- Improved edit/status actions, form density, responsive layout and mobile account management.
- Polished Employee Control Center cards, hierarchy and recovery messaging.
- Added consistent focus states, hover states, scrollbars, empty states and loading skeletons.
- Improved table density, numeric alignment and detail/profile clarity.
- No API, auth, permissions, database or business-rule changes.

## v93 - Layout System Update

- Standardized desktop page canvas, gutters and section rhythm.
- Rebalanced sidebar/content proportions for laptop, desktop and large monitors.
- Unified page-header composition across admin screens.
- Reworked dashboard, performance, employees, login accounts, uploads, tables and detail pages into consistent modern grids.
- Added sticky account-creation panel on desktop.
- Improved tablet and mobile stacking rules.
- Business logic, APIs, permissions, auth and database behavior unchanged.

## v94 - Adaptive Workspace

- Added a reusable WorkspaceSection composition component and adopted it in Employee Control Center.
- Added sticky desktop filter/search toolbars for performance and other long data pages.
- Improved sticky table headers and horizontal data-reading behavior.
- Refined desktop information density for performance cards and dashboard sections.
- Improved section scan rhythm and scroll targeting on long admin pages.
- Preserved tablet/mobile behavior and all business logic.

## v95 - Import Pipeline Fix

- GA upload no longer requires the chosen view date to match every ACTIVATION_DATE in the workbook.
- One GA workbook can contain multiple activation dates; every SIM is stored using its own ACTIVATION_DATE.
- Existing SIM_NO deduplication remains: identical duplicates are ignored and corrected existing SIM rows are updated.
- EV-SWAP now requires SELLING_PRICE 100; SIMWAP remains SELLING_PRICE 350.
- C2C and C2S cumulative files now replace the authoritative stored month, removing stale retailer/date values from older uploads.
- C2C/C2S pages switch their visible date range to the uploaded report range and immediately reload using those exact dates.
- GA/C2C/C2S summary routes are explicitly force-dynamic and client reloads include a cache-buster.

## v96 - Data Operations Visibility

- Added live latest-import health cards to Upload Center for GA, C2C, C2S and OB.
- Added latest file/report-end/upload-time freshness strips to GA, C2C and C2S workspaces.
- Updated Upload Center rules to describe GA multi-date imports, EV-SWAP price 100, and authoritative C2C/C2S monthly replacement.
- Renamed GA workspace copy from daily-only language to multi-date activation upload language.
- No database schema, import algorithm, permissions, auth or business calculations changed.

## v97 - Clean Dashboard

- Rebuilt the admin dashboard around the supplied clean admin UI reference.
- Reduced visual noise and replaced the oversized command-center layout with compact KPI rings, quick reports, team snapshot, supervisor performance and an attention watchlist.
- Uses only live DMS values already available to the dashboard; no mock/fake metrics were introduced.
- Added a warm off-white, restrained green/teal dashboard palette with compact enterprise spacing.
- Added mobile horizontal KPI cards and responsive single-column dashboard sections.

## v98 - Dashboard Speed & GA Swap Fix

- Dashboard now loads from one lightweight summary endpoint instead of four heavy summary endpoints.
- Existing dashboard values remain visible while the selected month refreshes; a small inline refresh status replaces disruptive loading behavior.
- Sidebar bottom "Opening page" indicator was removed and replaced by a slim top navigation progress bar.
- SIMWAP and EV-SWAP are hard-excluded from dashboard GA, Total GA, GA Achieved, target progress and SSO.
- GA summary UI no longer shows SIM SWAP KPI totals or employee-level SIM SWAP totals.
- SIM SWAP is shown only beside Total GA in the retailer daily table.
- Product normalization now recognizes EV-SWAP/EV SWAP/EV_SWAP/EVSWAP and SIMWAP/SIM-WAP variants.
- Dashboard typography, card sizing and panel height behavior were refined to reduce tiny text and empty space.

## v99 - GA Total & Date Filter Accuracy

- Total GA now equals MMSTC + MMST/MMSTS only.
- Unknown/other product codes, SIMWAP and EV-SWAP cannot enter Total GA, GA achievement, dashboard GA or SSO.
- Retailer SIM SWAP remains visible as its own column, including swap-only retailers.
- Active Retailers now counts only retailers with standard GA.
- Top TO date is now the authoritative Selected Day for daily KPI cards and Retailer GA table.
- FROM/TO continues to control the range-based employee/target view; changing TO immediately moves the selected daily snapshot.

## v99.1 - Test & Warning Patch

- Fixed GA product smoke test structure so every Vitest test is declared at suite level.
- Formatted the GA product smoke test to satisfy Prettier.
- Removed dashboard variables no longer used by the clean-dashboard composition.
- Removed unused GA page/importer symbols introduced by recent GA changes.
- Fixed AppShell sidebar ref cleanup warning without changing navigation behavior.
- No schema, API contract, auth, permission, import-rule or calculation changes.

## v166 - Banglalink theme

- Retheme: the whole palette now derives from the Banglalink mark — orange `#f26722` into amber `#fba919`.
- Renamed the scales rather than re-valuing them in place: `--color-teal-*` → `--color-brand-*`, `--color-navy-*` → `--color-ink-*`, `--color-slate-*` → `--color-neutral-*`.
- Neutrals are now warm, so the app reads orange even on screens showing little orange; the dark chrome is a warm near-black instead of a navy.
- Added gradient tokens (`--grad-brand`, `--grad-brand-strong`, `--grad-brand-hover`, `--grad-brand-soft`, `--grad-ink`, `--grad-ink-lit`, `--grad-hero`) and brand glows, applied to the sidebar, brand mark, primary buttons, LIVE badge, share bars, progress fills, icon tiles, auth panels and the page canvas.
- "Target achieved", "on track", "complete" and "online" moved off the brand scale to green; the brand is chrome, never status.
- Moved the "near target" amber toward yellow (23° from the brand instead of 7°) so a warning can no longer be mistaken for a link.
- Fixed six rules that used a brand fill step as text — legal under teal, under AA under orange — and added a guard so the fill/text split cannot collapse again.
- Fixed the dark chrome's muted text, which had been under AA for the life of the app (3.34–3.84:1) because axe cannot measure contrast against a gradient: new `--text-muted-dark`, 8.41:1.
- Redrew `app/icon.svg` in the brand gradient and regenerated every home-screen PNG; PWA theme colour now matches the mobile topbar.

## v167 - Brighter Banglalink theme

- The owner's verdict on v166 was "basi dark lagce" — too dark. The chrome was the cause, so the chrome changed sides: it now carries the brand instead of framing it.
- The desktop sidebar is the mark's deepest steps lit from the corner (`--grad-sidebar`) instead of a near-black neutral.
- The phone's top bar — the first and often only chrome on the screen nine users in ten hold — is the brand gradient (`--grad-topbar`) instead of near-black.
- Both auth pages: the team door is a vivid orange panel (`--grad-auth`); the administrator door stays the deep one, which now reads as "restricted" rather than as the house style.
- Brighter brand ramp (`-600` #dd4f0a, `-700` #b23d05), warmer neutrals and warmer shadows; the ink scale is a warm sienna rather than a near-black.
- PWA theme colour follows the topbar again, now that the topbar is the brand; icon regenerated.
- Fixed white text on `--grad-brand`: the sidebar's brand letter, the auth logo tile and every avatar's initials sat on a gradient whose amber end takes white at 1.95:1. New `--text-on-brand`, which clears AA at both ends of the ramp, plus a guard — axe cannot measure contrast against a gradient, so this class of bug needs a source check rather than a browser sweep.
- `premium.css` was re-declaring the sidebar ground and silently winning over `shell.css`; both now name one token.

## v169 - GA import writes in batches, and one locale for every figure

- The GA importer issued one statement per activation row inside a single transaction: 9,000 rows measured 8,974 ms against a local Postgres, and every one of those is a network round trip on the hosted database, under a 60-second route cap. Now `1 + ceil(rows / 1000)` statements — 9,000 rows in 1,414 ms.
- A corrected row is rewritten rather than updated, carrying its original `id` and `createdAt`, so the batching changes nothing a reader can see. All deletes run before any insert, because a rewritten row re-uses its own unique `SIM_NO`.
- Split the decision out as a pure `planGaWrite()`, matching `planMonthReplacement()`, so new/correction/duplicate/unchanged are tested by reading the plan.
- The v163 batching guard listed three importers by name and GA was not among them — the exact "forgot the third importer" mistake its own comment warned about. The list is now read from disk, with exemptions that must be named and justified in code.
- No schema, route, auth, permission or business-rule change: the rows written are the same rows.
- Pinned the display locale on all 242 number call sites and routed the 13 date/time ones through a new `lib/format.ts`. A bare `toLocaleString()` uses the runtime's locale, so a Bengali browser rendered ২,১৯০ where the server sent 2,190 — a React hydration mismatch on every load for roughly nine in ten of this app's users, confirmed on `/it/reports/sso` at 3 failures out of 3 under `bn-BD` and 0 out of 30 under `en-US`.
- Dates also pin the time zone: `toLocaleString("en-US")` on a Date still reads the runtime's zone, which is UTC on the server and Dhaka in the browser.

## v170 - A select you can type into

- Add BP's RSO and Retailer Code dropdowns had no search: hundreds of RSOs and ~2,190 retailers had to be scrolled on a phone. Both are now searchable pickers.
- The search lives in the control, not the screen: a new `app/components/Picker.tsx` replaces every long `<select>` in the app — Add BP, the RSO supervisor field, BP Management (whose separate "Find retailer" box is gone, one control now instead of two), the Authorized Users link fields and the permissions "copy from user" menu.
- Matches on name, code, wallet and supervisor, takes the words in any order, and folds Bengali digits so `০১৯৩৫৫৯৯৬২০` finds the wallet stored as `01935599620`.
- RSO options now show the wallet number as well as the supervisor.
- A `<select>` may no longer render a list built from data — guarded, with a per-file allow-list for the short fixed enumerations.
- Keyboard and screen-reader support: arrow keys, Enter, Escape, `role="combobox"`/`listbox`, and a hidden input so every form still submits exactly the field it did before.

## v171 - Change your own PIN, from the profile icon

- There was no way to change your own PIN, on any role. Someone who thought their PIN had been read over their shoulder had to find an administrator. On a phone there was no way to sign out either: the sidebar carrying that button is `display: none` below 900px, and the top-bar avatar linked to the page the person was already on.
- The avatar now opens an account sheet — who you are, **Change PIN**, **Sign out** — and the same sheet opens from the desktop sidebar's profile block. One component, so every role gets it and the two cannot drift.
- `POST /api/auth/change-credential`: any signed-in role, current credential required, the same PIN rules the rest of the app applies, rate limited before any work, audited without ever recording a credential. Every other session is revoked and this device is re-issued one, so changing a PIN because somebody else may know it actually ends their session.
- A wrong current PIN does **not** count toward the five-strike lock — that lock has no timer and needs an administrator, and the caller already holds a valid session.
- The "current PIN" box carries no format rules, deliberately: v155's rule is that existing credentials keep working, so constraining it to six digits would stop anyone with a legacy PIN from ever changing it. Found exactly that way in the browser.
- Fixed a stacking bug the new sheet exposed: a dialog rendered inside the sticky mobile top bar was scoped to that header's stacking context and painted _under_ the bottom navigation, so its buttons could be seen and not tapped. The account dialog portals to `<body>`.

## v172 - GA product codes are worked out, not looked up

- The owner's real September file (2,527 rows) had 579 rows the app classified as "unknown" and silently dropped from every total: `SIMSWAP` (568), `ESIMSWAP` (2), `MMSTSC` (8) and `MMST1911` (1). `SIMSWAP` differs from the listed `SIMWAP` by one letter, so the SIM SWAP figure on screen read 9 instead of 579.
- A product code is now classified by what it says, not by a list: a code containing SWAP (or ending in the carrier's older WAP) is a replacement, and in an Activation Details Report everything else is a normal SIM. `UNKNOWN` is unreachable for any row that has a code.
- The 170/300 tariff is learned from the data — whatever `MMSTC` rows cost is the 170 tier — so moving a price needs no code change. A code the app already knows is still never re-decided by its price (v157).
- Total GA needs no price at all, so `withStandardGa` stays synchronous in all thirty of its call sites; only the tier breakdown takes a tariff, on four screens.
- Every import now reports the shape of the file it read — tier counts, the tariff it learned, and every unfamiliar code with its row count — so a new code announces itself instead of vanishing.
- For the owner's file: **1,948 normal SIM** (1,433 at the 170 tier, 515 at the 300 tier) and **579 swaps**, with nothing left over. Previously 1,939 and 9.

## v173 - One name per GA category

- The same 170-tier count was labelled three different ways: "150" on `/ga` (under a note reading "selling price 170"), "170 GA" on `/bp/sales`, and "150 pack" in the BP activation list. The field holding it was `ga150` in eleven files, named after a tariff that had already moved twice.
- All four category names now come from `lib/ga-category.ts` — "GA 170", "GA 300", "SIM swap", "Unclassified". They are category names, not prices: what a 170 SIM costs today is read from the data, and the notes asserting a price are gone.
- Removed the last hardcoded tariff in the app: the BP activation list decided each row's label with `Number(x.sellingPrice) === 170`, so it would have disagreed with its own totals the day the price moved. It uses the shared rules and the same learned tariff now.
- Renamed `ga150` / `total150` / `a150` to `ga170` / `total170` / `a170`, and replaced two hand-written category ladders with the shared mapping.
- Guarded: no frozen tier label (including table headers), no field named after an old tariff, and no comparison of a selling price to a literal anywhere in `app/` or `lib/`.

## v174 - Zero production advisories, without a framework upgrade

- `npm audit` reported 8 findings (3 moderate, 5 high). The production tree is now at **0**, with no major upgrade of Next, Prisma or ExcelJS and without `npm audit fix --force`.
- The two high-severity `xlsx` advisories had been marked "No fix available" since v123 and carried through fifty versions. There is no fix _on npm_ — SheetJS stopped publishing to the registry at 0.18.5 — but both are fixed upstream (prototype pollution in 0.19.3, the ReDoS in 0.20.2). The patched 0.20.3 tarball is now vendored at `vendor/xlsx-0.20.3.tgz` and installed by file path, so `npm ci` resolves it from disk and no deploy depends on a CDN being up.
- Four transitive advisories whose npm-suggested "fix" was a major upgrade are pinned forward within the same major instead: `postcss ^8.5.28` (npm wanted Next 16), `uuid ^11.1.1` (npm wanted exceljs 3.4.0 — a downgrade of two majors that would have removed the workbook features the v153 exports use), `deepmerge-ts ^8.0.2` (npm wanted Prisma 6.12), `js-yaml ^4.3.2`.
- Verified on the paths that matter rather than by type-checking: all four real carrier files re-parsed identically on the new library (C2C 1936 rows, C2S 1927, OB 2190, GA 2527) with the GA figures unchanged (1,948 normal SIM, 579 swaps, 1,433 / 515 tiers); ExcelJS round-tripped a workbook with conditional formatting and Bengali text on uuid 11; `prisma generate` and `db push` on deepmerge-ts 8; a full build on postcss 8.5.28.
- Two dev-only moderate advisories remain in vitest. The fix is vitest 5, which reads `"jsx": "preserve"` from `tsconfig.json` and hands untransformed JSX to Vite; two suites stopped loading. Reverted deliberately and recorded, rather than fighting a build-tool config to silence a test-runner advisory while production is at zero.
- Guarded: `tests/dependency-security.smoke.test.ts` fails if SheetJS drops below 0.20.2, if the spec stops pointing at `vendor/`, if the tarball goes missing, if any pin is removed, or if exceljs is downgraded to "fix" uuid — and it parses both a workbook and a tab-separated `.xls` through the library, so a tarball that installs but cannot read fails too.
- No schema, route, auth, permission or business-logic change.

## v175 - A number with no date, and a screen that says nothing

- Six defects, all on the roles about 90% of this app's users hold, and all the same shape: the screen was confident and wrong, and nothing errored.
- **"Latest GA" was not the latest, and had no date.** The snapshot asked for the newest activation date _belonging to the person looking_, so an RSO who had sold nothing for three weeks was shown the count from the last day they did sell, labelled "Latest GA". It could not show a zero — a zero has no row to read a date from — so the number was always somebody's good day. GA and C2C also resolve independently and were **44 days apart** on real data with nothing on screen admitting it. A daily figure is now anchored on the newest day _the feed_ has, and that day is printed beside it (`GA · 25 Aug`), with an amber line naming any feed that is behind. Zero now means zero.
- **The RSO home rendered a blank page** — `return null` for any deactivated employee record: no heading, no message, and on a phone no way back. It now says whether the record is switched off or missing, because those send the person to different people.
- **"All SSO complete" appeared when nothing was complete.** Tapping the Complete filter with nothing completed congratulated the RSO on finishing work none of which was done; an RSO with no SIM-seller retailers got the same green tick. Three branches now, and only the genuine all-clear carries the tick. The grouped layout had the same bug twice over — it reported the filtered-out half as empty — and now hides it instead. The month the page reports on is on screen, rather than a silent `?month=`.
- **An empty scope read as an all-clear.** The attention list's fixed "No attention items — execution rules are complete for this scope" fired for an unmapped RSO login, a supervisor with no team, a manager with no supervisors, and a search that matched nothing. Each route now says what empty means for its own role, and an unmapped login gets a notice rather than a list.
- **"0 of 0" with a 0% ring for a month whose target was never uploaded** — five tiles telling an RSO they were at zero percent, in the colour the app uses for failing. `PaceFoot` already declined to guess for this case; the card now agrees, and says "No target set".
- **The BP's "Today's Activation" was zero for most of every working day**, because the feeds are uploaded for the previous day. It is anchored on the feed's day now, clipped to the assignment window as the monthly figure already was.
- Also: `businessDayBounds` moved into `lib/business-time.ts` (three modules wanted it, and "a business day is a date, not an instant" should exist once); `lib/live-ga.ts` had its own second copy of `dhakaTodayYmd` with its own offset constant, now gone.
- Guarded by `tests/feed-day.smoke.test.ts` and `tests/empty-states.smoke.test.ts` (42 tests), with eight mutations run and every one caught. The attention-page line cap was raised for the new wording and backed with a direct assertion that none of the three routes renders the shared view itself.
- No schema, route, auth, permission or business-rule change — the same figures, over the days they are actually from.

## v176 - The suite has to pass on the machine it is run on

- Two failures on the owner's Windows machine during a pre-deploy check. Neither was a fault in the application, and both cost time at the worst possible moment — the minute someone is deciding whether it is safe to ship.
- **`npm install` had been skipped**, so `node_modules` still held the registry `xlsx@0.18.5` that v174 replaced with a patched vendored copy. The guard caught it, which is its job, but its message — "SheetJS 0.18.5 still carries the ReDoS" — said nothing about what to do. It now works out which of the two possible causes it is and says so: a stale `node_modules` and a downgraded dependency call for opposite actions. Reproduced by actually installing 0.18.5 over the vendored copy and reading the new message.
- **A nine-assertion test against a pure function timed out at 5s.** It imported `app/components/Kit.tsx` with `await import()` _inside the test body_, so Vite's first-time transform of that module graph was billed to the test's own stopwatch — 5.14s on Windows, 0.16s here. The import moved to the top of the file, where the cost belongs to `collect`, which has no per-test budget.
- `testTimeout` is now 30s rather than Vitest's 5s default. The owner's run shows `transform 19.7s` against 1.5s here and `collect 74.6s` against 3.8s: NTFS plus a virus scanner on a few thousand module reads. A real hang still fails; a slow disk no longer reads as a broken build.
- `tests/test-portability.smoke.test.ts` — which exists for exactly this class of defect, one invisible on the machine the tests run on — gained a guard: no test may pay a Vite transform inside a test body. Mutation-tested both ways.
- `WORKFLOW.md`: step 3 now says why `npm install` cannot be skipped (it produces a wrong _pass_, not an error) and quotes the new message. Step 4's expected-results table said `test` → `47 passed`; the suite has had more than eight hundred for many versions. A number edited by hand every release is a number that will be stale, and a stale expectation teaches you to ignore the one line that matters — so it now says `0 failed`, and notes that Windows is simply slower.

## v177 - How many 170s, how many 300s, under every GA figure

- The owner's request: wherever a GA number appears, say how much of it is the 170 pack and how much the 300, so an RSO or BP can see which SIM is moving and a supervisor can read the market. Swaps stay excluded, as since v172. Six screens already did this — `/ga`, BP Sales and the detail pages — because their figures happened to come from a source that carried the breakdown. Everywhere the field actually works did not.
- **The invariant came first.** A total and its parts on one card is a promise that they add up, and there was a live way to break it: an RSO who holds a Business Partner has that outlet's GA folded in by `lib/bp-ledger.ts`, which carried the count and threw the category away. The total would have been the territory's and the two tiers only the RSO's own outlets — three correct numbers that do not add up. The tier now travels the full length of the rollup (`BpRetailerFigures` → `BpPortion` → `RollupRow` → `RollupTotals` → `withBp` / `teamTotals` / `groupTotals`), and a BP shared by two RSOs is unioned by retailer id exactly as its total already was, so the split cannot be doubled where the total is not.
- `ga170 + ga300 === total` is **structural**, not remembered: `GaTiers` can only be filled through `addTier`, which moves the total and one tier together or does nothing. A swap or an unclassified row has no branch that reaches the total, and deriving `ga300 = total - ga170` is barred by a guard — it looks equivalent and silently absorbs every swap into the 300 tier.
- **Almost no new queries.** `employeePerformance` had been computing `ga170`/`ga300` on every row and no screen read them; `employeeDetail` built a full breakdown per retailer and returned two fields of it; `retailerOpportunities` already grouped by `productCode` and `sellingPrice` — it needs them to decide what a standard GA is — and consulted only the boolean. The rest is the same query with two more grouping keys. The 170 tariff is learned and cached, never a hardcoded price.
- Now shown on: RSO home (headline GA and the daily tile), BP home (ring, day card, month card), Supervisor and Manager team GA and their RSO/supervisor cards, every attention row and retailer card, both BP lists, Live GA rows and hero, the per-RSO drill-down, and Admin BP Performance. One component, one CSS class, one place the sentence is written. It renders nothing when there is nothing to split, so an empty month stays quiet.
- **Fixed a contrast bug that had been there for the life of the app.** `.kit-pace-status` — the "Achieved" / "At risk" word under a KPI — asked for `var(--band-achieved)`, an alias for `--color-success-600`: 3.77:1 on white at 11px bold. `--band-near` was 3.69:1. The v166 sweep matches token _names_ and an alias spells nothing it looks for; axe measures what renders, and the seeded data never reached a target, so the failing state was never on a page while anything was measuring it. Now uses the `--text-*` steps, and the guard enumerates all four pacing tones rather than waiting for one to appear.
- Also fixed: `/dashboard` had its own `Intl.NumberFormat("en-BD")`, so the same figure was grouped `1,23,456` there and `123,456` everywhere else — v169 pinned every figure to one locale, and its guard only looks for a bare `toLocaleString()`.
- Two guards were quietly measuring the wrong thing once a cached lookup joined the paths they watch: `query-count` compared 1 assignment against 500 without clearing the tariff cache and read the cache hit as a difference; `live-ga` banned `Promise.all(` outright as a proxy for "no query per row", which is too blunt — it bans awaiting a _mapped_ array now.
- Guarded by `tests/ga-tier-rollup.smoke.test.ts` (20 tests) which checks the invariant by **running** `withBp`, `teamTotals` and `groupTotals` over real fixtures including a shared BP, plus the sources and every named screen. Eight mutations run, all caught; two more against the contrast guard.
- No schema change, no auth or permission change, and no change to what counts as a standard GA — only to how much of it is said out loud.

## v178 - A permission with no door, and one word meaning two numbers

- **The manager could not work their own queue.** `roleDefaults.MANAGER` has granted `retailers: view` since the permissions were written, and there was no `/manager/retailers` page and no "Retailers" entry in the manager's navigation. The permission was real; the screen was not. `/manager/attention` links every row to `/manager/retailers/{id}` — the detail page, which does exist — so the rows worked while the list behind them did not, and with no list to return to the detail page pointed its back button at `/manager/rsos/{employeeId}`: a different screen about a different thing. Working down a two-hundred row attention queue on a phone meant being thrown onto some RSO's performance page after every single tap. The RSO and the supervisor both have the page, the nav entry and a back link that returns to their list — which is what makes this an omission rather than a decision. Built as the supervisor's screen over the manager's scope, sharing the same list components; verified scoped to 173 of 260 retailers.
- `/supervisor/retailers` got the empty-scope notice v175 gave every other list and missed on this one.
- **The RSO home showed two different numbers for SSO.** Measured on real data: the KPI card read `SSO 48` — this RSO's own credit, with BP-held days routed to the BP side — while the pill below it read `SSO Complete 49`, every outlet they own, from a source that does not know a BP from any other shop. The same RSO's GA card reads 470 while the territory credits them 485. Both figures are correct, the split is deliberate (v139: RSO and BP targets are set independently, which is why `/rso/bp` has its own target), and nothing on the page let a reader get from one number to the other.
- The arithmetic is untouched; the page now says which is which. A note under Target vs Achievement when the RSO holds BPs — "These are your own outlets. Your 3 BPs added 15 GA this month and are counted separately, against their own target, on My BPs" — one clause under Quick status saying those counts are outlets including BP-held ones, and the pills renamed from "SSO/LSO Complete" to "Outlets at SSO/LSO" so they stop wearing the target card's word. "Team snapshot" became "Your outlet base": an RSO has no team.
- Deliberately left alone: a BP an RSO holds but does not _own_ appears in none of their retailer lists (verified — RSO 2 is credited 11 GA from an outlet owned by RSO 1 that is in none of RSO 2's lists). Those outlets are reached through My BPs, which exists for exactly them; making `retailerOpportunities` BP-aware would change attention priorities, every team list and the IT reports at once to fix a gap the app already has a screen for.
- Guarded by `tests/reachable-modules.smoke.test.ts`, which states the rule the missing page broke as a property of every role: every module a role may view has a navigation entry, or a written reason why not — and the exemption list is checked back against the permissions so a reason for a module a role cannot view fails too.
- Seven mutations run. The third found a real hole: the scope guard asserted the file _contained_ `"scope.employeeIds"`, which it does twice, so replacing the query's argument with `undefined` — returning every retailer in the company — left the other mention in place and the guard passed. It now reads the argument out of the call itself, re-mutated on both lists.
- No schema change, no permission change, and no change to any figure — only to what the screen says each figure counts.
- Recorded, not fixed: one run of the browser suite threw a React hydration error (#418) on `/it/reports/ob` for ADMIN while IT loaded the same route cleanly in the same run. Twelve targeted loads (six `en-US`, six `bn-BD`/Asia-Dhaka) and a full re-run of the suite were all clean, and nothing in this version touches that page. Noted here rather than dismissed as a flake, because a hydration mismatch makes React discard the server's HTML — the failure v169 chased on `/it/reports/sso`. If it reappears, this is the second sighting.

## v179 - The database is far away, and the pages were queuing

- No feature. One question asked properly for the first time: will this be fast enough for two thousand retailers? The local database held 260 retailers and 3,744 GA rows; the real one holds about 2,190 retailers and 2,527 GA rows a day. So the local database was loaded to production scale — 2,190 retailers, 77,084 GA rows, 28,956 C2C, 29,750 C2S, 40 RSOs — and every screen timed.
- **The answer for the roles that matter is yes, comfortably.** RSO and BP pages render in 40–170ms server-side at full volume. Nothing on those screens needed changing.
- **What local timings cannot see.** Warmed and measured under the same protocol, server time before and after this change is the same to within noise — 0.21s vs 0.23s for `/manager`. That is the point: a local round trip costs about a millisecond, so twelve queries in a row look identical to twelve issued together. Production runs on Vercel against `db.prisma.io`, where the database is remote and every wait is a network round trip whatever the query returns. (An earlier measurement that looked like a 4x win was a cold server on one side; re-running both fairly showed no local difference at all.)
- Measured with 30ms added to every query, the depth was: `employeePerformance` **9 waits** for a team and 6 for one RSO, `/rso` **8 waits**, `/manager` **11**. `employeePerformance` is the most-called data function in the app — every role home, every performance list, every drill-down — while `retailerOpportunities` issues eight queries in _one_ wait and was already the right shape.
- Three waits removed from `employeePerformance`, all of them queries that were merely queued rather than dependent: the retailer query filtered on ids the employee query had just returned (a relation filter needs no ids and runs alongside); a whole query existed only to collect BP retailer ids for that filter (one `some` clause instead); and the BP assignments were awaited alone while four aggregate queries that did not depend on them waited behind. Plus the same mistake on the three role homes, where `performanceComparison` was awaited after the page's `Promise.all` and needs nothing from it.
- Now **`employeePerformance` 9 → 6 waits for a team and 6 → 3 for one RSO; `/rso` 8 → 4; `/manager` 11 → 7.** At 30ms latency that is 254ms → 109ms of pure waiting on the RSO home before a single row is read.
- **The figures did not move.** The full output of `employeePerformance` was captured before the change for six call shapes — whole company, manager scope, one RSO, empty scope, a partial date range, another month — and compared after: byte-for-byte identical, all 43 employees.
- Guarded by `tests/query-depth.smoke.test.ts`, which pins what a query _count_ cannot see. The stub resolves each call a few microtasks later and records when it started and finished, so overlapping queries measure as one wait and queued ones do not; the meter is itself checked against both answers it could wrongly give. Four mutations, and two found holes in the guard first: the stub returned no retailers, so the function took its early return and half of it was never measured; and the budget was one wait too loose. Both fixed, then re-mutated.
- No schema change, no permission change, no figure changed — only how many times a page stops to wait.
- Also fixed, both exposed only by the scaled database: `e2e/coverage.spec.ts` reached each `[id]` page by loading its parent list, sleeping a fixed **400ms** and looking for a link — at production volume `/admin/retailers` takes 2.2s, so the sweep looked at an empty page and reported "page NOT covered (empty list?)" for three roles, guessing at the application. It now waits for the link it is about to read. And `ReportDateBar`, a client component on every `/it/reports/*` screen, called `rangePresets()` which reads the clock: it renders once on the server and again on hydration, so across a Dhaka midnight the two renders disagree about every preset. It takes the server's instant now — required, not optional, so the compiler named all seventeen call sites — matching the note `EmployeeDetailView` has carried since it was written. Guarded by a sweep over every client component for a clock read in the render path, with an exemption list checked back against the files; `/targets` is recorded as owed work rather than waved through.
- **Still open, and not fixed here.** The IT report pages are slow at production volume — `/it/reports/daily` 3.4–6.7s, `/it/reports/lso` 3.6–4.8s, `/it/reports/low-c2s` 3.8–4.7s in the browser (no RSO or BP page is anywhere near this). And the React #418 hydration error v178 recorded as a single sighting is now reproducible: about **one load in twelve on those slow report routes**, tracking with multi-second renders. The clock read above was the obvious suspect and is fixed; the error survives it, and shifting the browser's clock four hours past Dhaka midnight did not provoke it, so that hypothesis is dead rather than confirmed. It predates this version's changes. The two findings belong together in their own pass.

## v180 - The PIN was going into the address bar, and a correction

- **Both login forms were a GET.** `<form className="auth-v54-card" onSubmit={submit}>` — no `method`, so the HTML default applied for as long as the page was HTML React had not yet taken over, and the browser did the ordinary thing: `/login?identifier=01700000001&credential=<the PIN>`, `/sacool?identifier=admin&credential=<the password>`. A URL is the one place a secret must never be: the address bar, browser history, the server's access log, the `Referer` of the next request.
- **Measured, not assumed.** Against a real production build, filling the form and clicking Sign in after a fixed delay under Chrome's own network profiles: safe at every delay unthrottled; leaked at 0/250/500ms on fast 3G; leaked through **3500ms** on slow 3G, safe from 4000ms. Seconds, on the networks this app is used on, with the button visible and enabled throughout — on the first screen every user meets every morning.
- **Fixed with `method="post"`**, on all eleven forms under `app/` that handle their own submit, not only the two that carry a credential. The fields go into a request body that nothing records, and Next renders the page again with a clean URL (checked: a POST to `/login` returns 200 and the login page). Disabling the button until hydration was considered and rejected — it makes the form silently dead for the same 3.5 seconds, which is worse for the person holding the phone, and `e2e/public.spec.ts` rightly requires that button enabled. The two deliberate GET forms — the date-range filter and the live filter bar, whose submission _is_ a URL — are left alone and named with their reasons.
- Guarded by `tests/form-method.smoke.test.ts` (every `<form>` with an `onSubmit` declares `method="post"`; separately, every form in any file with a password box does too; the exemption list is checked back against the files) and `e2e/pre-hydration.spec.ts`, which blocks the app's JavaScript the way a slow connection does, submits for real, and requires the URL to gain no query string at all. Five source mutations and one browser mutation, all caught — including one that first reported `/login` as still broken because the scanner had found the `<form>` inside the comment documenting the fix.
- **Correction to v179: the IT report pages are not slow.** v179 reported 3.4–6.7s at production volume. Those numbers were taken with **thirteen Playwright workers alive on a two-core machine**. Re-measured on a quiet machine against the same 2,190-retailer / 77,084-row database, twelve full browser loads per route: `/it/reports/daily` median **840ms**, `lso` **928ms**, `low-c2s` **882ms**, `sso` **882ms**, `ob` **878ms**. Four to seven times off. There is no report-page performance problem, and v179's promise of a dedicated pass is withdrawn.
- The measurement script now refuses to report at all if any script chunk failed to load. `next dev` and `next start` share `.next`, so one dev run left the production server answering `/_next/static/chunks/*` with a 400 HTML page; nothing hydrated, and two runs produced confident meaningless numbers before the cause was spotted. A run whose scripts did not load is not a slow run; it is no run.
- **The React #418 hydration error is characterised, not fixed.** Open since v178. It reproduces on demand: **0 in 60** loads on a quiet machine at full speed, **5 in 80** under twelve busy processes, **3–4 in 20** on a quiet machine with only the document throttled to 500kbps — that last line removes CPU from the picture. Established: the server HTML is deterministic (two renders differ only in the CSP nonce); React recovers to a DOM identical to the HTML the server sent for that same navigation; there are no Suspense boundaries or `$RC` placeholders in these documents; no script chunk failed. So it is a race between hydration and delivery, resolved by React discarding the server's HTML and re-rendering — correct content, at the cost of a full client re-render paid by whoever has the slowest connection. Lead for the next pass, written as a lead and not a conclusion: these routes ship 186–224KB of server-rendered HTML.
- No schema change, no permission change, no route added, no figure changed. The hydrated login path is byte-for-byte the request it always was.
- The route-coverage sweep's timeout now scales with the work — `60s + 6s per route` instead of a flat 180s, which fitted BP's three routes and not ADMIN's or IT's fifty-three (both failed on the timeout alone, with no route having failed). Same mistake v179 found one level down in the same file. ADMIN then passes in 3.9 minutes.
- Also from that sweep: `/rso/bp/[id]` reported "page NOT covered" because the RSO the suite signs in as held **zero** BP assignments in the scaled local database — a test-data gap, not an app defect, and v179's fix to that check did its job by saying the list was empty instead of guessing. And recorded rather than acted on: under thirteen concurrent browser workers the server logged Prisma `P2024` ("connection limit: 5"), which does not reproduce on a quiet machine but is worth the arithmetic — v179's batching traded round trips for simultaneous connections, and the widest batch in `employeePerformance` is five, the whole local pool, for one page render. Pool sizing in production is deployment configuration, named here rather than changed.

## v181 - The report credited the wrong person, and a supervisor now has a target

- **The Reporting Center credited a Business Partner's sales to the wrong RSO.** Every report showing a figure per RSO built it by walking the retailers that RSO _owns_; every dashboard in the app credits a BP-held outlet to the BP holder instead and removes it from the owner (v139, v142, v178). So the same RSO in the same month read one way on their own screen and another in the Reporting Center. Measured on the production-volume database (2,190 retailers, 77,084 GA rows) for September: **RSO 10 GA 1,575 vs 1,680, RSO 1 470 vs 481, RSO 3 447 vs 451**, with SSO (48 vs 49), LSO (45 vs 48) and C2C (৳1,691,300 vs ৳1,818,560) wrong the same way — which is the "GA calculation is wrong, and the others too" that was reported.
- Worse than the counts: the report took its TARGET from the RSO's own `MonthlyTarget`, which excludes the BP target by design, so the achievement percentage divided a figure covering somebody else's BP outlets by a target that never covered them. The percentage was wrong even where the count looked close.
- Fixed by asking the one function every role screen already asks. `rsoSummary` and `rsoActivation` now go through `employeePerformance`; `supervisorSummary` and `rollUpToSupervisor` go through `groupTotals`, the one place allowed to add a BP's figures to a team's — and `supervisorSummary` is now a mapping over `rollUpToSupervisor` rather than a second implementation of it. Re-measured: **0 of 43 RSOs differ** on GA, SSO, LSO or C2C. Also corrected on the way: `rollUpToSupervisor` and the manager's supervisor cards grouped by supervisor NAME, so two supervisors sharing one silently shared a row.
- **A supervisor now has a target of their own.** Until now every supervisor figure was the sum of their RSOs' targets plus their BPs' GA target — a number too high to manage against, and not what a supervisor's job is. `SupervisorMonthlyTarget` mirrors `MonthlyTarget` column for column (GA, C2C, SC, Total Recharge, SSO, LSO), is set in a new section on the Target page with the same dialog and the same single save, and stands on its own exactly as v139 established for RSO and BP targets.
- A manager's and the company's target is now the sum of their supervisors' own targets, so a manager's headline row and the supervisor cards beneath it are built from the same thing rather than being two numbers wearing one word. Verified in the browser: manager GA target 1,200, the one supervisor card beneath it 1,200.
- **Not set is not zero.** A supervisor with no target shows "No target set" rather than falling back to the old sum. Beside each unset row the Target page prints what the old roll-up came to — "Their RSOs and BPs add up to 130 GA · 80,000 recharge — what this used to show" — as a reference that decides nothing, so a first target is a decision rather than a guess.
- Found in the browser, not in review: the first version of the save wrote every supervisor row the page was showing, touched or not, so one press of "Save all changes" created a row of zeros for all seven supervisors — turning "no target set" into "a target of zero" for the whole company, silently. Now only rows somebody actually edited are written, and that line has a test.
- **A BP's display name was saved and never read.** The "BP Display Name" field saved to the BP login's `User.displayName`, and exactly one line in the app read it back — the edit form's own prefill — which is why it looked right when you reopened the form and wrong everywhere else. It also had nowhere to live without a login, so a BP with no mobile number had the typed name dropped in silence, and the BP Management screen had no name field at all. Now `Retailer.bpName` holds it, one function `bpDisplayName()` reads it on every list, card, report, export and Live GA row, and all three creation screens write it. A blank field now clears the name and restores the master file's, which was impossible before.
- **Every RSO card shows the same four metrics.** The admin performance list showed GA, SSO and Recharge; the supervisor's and manager's showed GA, LSO and Recharge — so an RSO had an LSO target that the screen called "Performance" never mentioned. All five lists now show GA, SSO, LSO and Recharge.
- **The retailer drill-down can be ordered by SSO.** The sort menu offered "LSO pending first" and nothing for SSO, although every row already carried its SSO verdict. "SSO pending first" is now there and the row shows the verdict it can be ordered by; a shop that does not sell SIMs reads "Not a SIM seller" rather than a red "SSO pending".
- Guarded by three new files — `tests/report-accounting.smoke.test.ts`, `tests/supervisor-target.smoke.test.ts` and `tests/bp-name.smoke.test.ts` (50 tests). Twelve mutations run, all caught. One of the BP-name checks is deliberately separate: that every Prisma `select` feeding a BP label asks for the column, because swapping the expression without widening the select silently restores the original bug while the first check still passes.
- **After deploying:** run migration `20260919090000_supervisor_targets_and_bp_name` (both changes are `IF NOT EXISTS` and safe to re-apply), then set the supervisor targets — until you do, every supervisor screen says "No target set", deliberately.

## v182 - The audit, the two things it found, and a BP's SSO

- **Everything was re-checked against SQL, not against itself.** Re-running v181's guards would only have shown that they still agree with themselves, so every headline figure was recomputed independently in SQL from the rules as written in `lib/business-rules.ts` and compared with what the app returns. Eighteen checks against the production-volume database (2,190 retailers, 77,084 GA rows, September): company standard GA 67,398 both ways, SIM swap 7,466, standard + swap + unknown = every row, per-RSO own GA and BP-held GA matching the ledger rule on all 43 RSOs, the 170/300 tier split adding to the total on every row, per-RSO SSO and LSO matching, company C2C ৳72,105,925 both ways, the Reporting Center agreeing with the role screens on 0 of 43 rows differing, and each target coming from its own table. Plus thirteen awkward rows injected, measured and removed again for the cases the seeded data does not contain — unfamiliar product codes, an assignment ending mid-month, inclusive `endDate`, the SSO and LSO thresholds at their exact boundaries, a range spanning two months. Teardown verified: 0 injected rows left behind.
- **Finding 1 — a report's total strip was adding up the wrong thing.** Every grouped report built the summary figure above its table with `rows.reduce(...)` over the rows on screen, which breaks the rule `lib/bp-rollup.ts` had already written down: _"Only a total ACROSS groups needs `teamTotals()` over the underlying rows, never a sum of these."_ Grouped by RSO the strip read **GA 67,278 against a real 67,398**, GA target **300 against 475**, SSO 1,332 against 1,336, LSO 1,927 against 1,930, C2C ৳71,978,665 against ৳72,105,925 — each row holds the BP share aside by design, so adding them drops it from a figure labelled as the report's total, targets included. Grouped by supervisor it read **67,409 against 67,398**, because an outlet worked as a BP by two RSOs on two teams counts once in each team correctly, and adding the teams counts it twice. Fixed by `companyTotals()`: the achievement always comes from `teamTotals` over the underlying rows, and the target follows the grouping. Three reports used the bad strip — Target vs Achievement, Entity Performance and the C2C/C2S value reports — plus the Supervisor Performance list. A BP or retailer grouping still sums its rows, and must.
- **Finding 2 — that fix, as first written, made every report five times slower.** `companyTotals` was called from the page while the builder had already fetched the same rows, so every report ran `employeePerformance` company-wide twice: `/it/reports/c2c` 13.5s, `/it/reports/performance/rso` 11.8s, `/it/reports/target` 8.8s. The builder now fetches once and passes the rows to both the table and the strip — every report ~1.75s — and `tests/report-accounting.smoke.test.ts` counts the fetches so it cannot come back.
- Recorded from that measurement, because it is worth the owner's attention: the timings bounced between 1.7s and 7.3s run to run until the local Prisma **connection pool** was raised from its default of 5 to 20. A report page issues far more than five queries in parallel since v179 batched them, so the page was waiting on the pool, not the database. If the reports feel slow in production, `connection_limit` in the database URL is the first thing to look at. The honest trade: these reports were ~0.85s before v181 when they rolled retailers up by ownership, and are ~1.75s now because they ask the same ledger every screen asks.
- **Finding 3 — a BP's SSO, LSO and C2C now count for the RSO holding it**, as asked. A BP assignment carries a GA target and nothing else; an RSO's SSO, LSO and C2C targets are set against their whole base, the outlets they hold as a Business Partner included — so holding that achievement aside measured them against a goal that still covered those shops. The target was right and the achievement was wrong. SSO, LSO, C2C and C2S are now credited to the holder at source, in the one place that builds the row, in both aggregation paths (`lib/performance.ts` and `/api/dashboard/summary`). **GA is not** — a BP has its own GA target, and folding it would target the same SIMs twice, which is v139's ruling and still holds.
- The delicate part was keeping the de-duplication: two RSOs on one team can hold the same outlet and each sees the whole of it while the team counts it once. `teamTotals` now takes each row's BP share back out before adding the deduped one, and `withBp` no longer adds those four a second time. Verified against raw SQL: per-RSO SSO recomputed from first principles agrees on all 43 RSOs, it moved for the 4 who hold a BP, and company GA (67,398), C2C (৳72,105,925) and LSO (1,930) are unchanged.
- **What you will see:** an RSO who holds a Business Partner will see their SSO, LSO and C2C go up from this version, because those outlets now count toward the target that always covered them. Their GA does not move — that still belongs to the BP, against the BP's own GA target, on My BPs and the BP reports. No company figure changed.
- Eight more mutations run, all caught (twenty across v181 and this pass): the target report summing its rows again, `companyTotals` abandoning the rollup, the supervisor list adding up its rows, the value report summing its rows, the dashboard path forgetting the fold, GA getting folded too, `teamTotals` keeping the share in, and `withBp` adding the BP's C2C twice.
- **A third thing the browser run found, in the suite rather than the app.** The full Playwright pass across seven widths came back 53 failed, and not one of them was the application. Two causes: the box has two CPUs, and at four Playwright workers the suite lost 53 tests to contention alone (at two workers, 20; at one, none); and eighteen of the remaining twenty were one line in `e2e/roles.spec.ts`, which signs in once and walks its role's routes running three layout audits on each, under Playwright's flat 30s default — a number that fitted BP's two routes and not ACCOUNTS' five or ADMIN's seven, so the walk ran past the budget with no page having failed a single assertion. Run one at a time the same six roles pass together in 44.6s, and the server answers those pages in 51–300ms measured directly. Same mistake v179 found in `coverage.spec.ts`; same fix — `roles.spec.ts` now budgets `30s + 15s per route`.
- The same pass showed `coverage.spec.ts`'s own allowance had gone stale: its `6s` a route was set when a route load was about three seconds, and that sweep follows a detail link off each route as well, which now measures 8–12s — ACCOUNTS' twelve used 102s of a 132s budget and MANAGER's eleven ran past 126s with nothing having failed. The allowance is now `12s` a route. A budget a healthy run only just fits reports the machine, not the app.
- Re-run with both budgets stated honestly, `roles.spec.ts` passes at all seven widths and every coverage sweep passes except two — the known, pre-existing React **#418** hydration race, open since v178 and characterised in v180, hitting a **different route every run** (`/live-ga` and `/it/reports/sso` on one pass, `/it/readiness` and `/admin/attention` on the next). That is what a race looks like. Net result is v181's: 117 of 119 pass, the same 2 fail.
- No schema change, no permission change, no route added in this version. 953 unit tests across 68 files pass; eslint 0 errors and the same 27 pre-existing warnings; prettier clean; `npm run build` clean.

## v183 - Premium polish, and three screens that were lying about targets

- **Two of every five taps on a list row did nothing.** Measured on the production-volume database, eight fresh sessions per screen, one click each after the page had finished streaming: `/admin/performance/supervisors` 3/8 dead, `/rso/retailers` 3/8, `/supervisor/bp-activations` 3/8. The failure is silent and complete — the Link handler runs (the click's `defaultPrevented` is true), the router fetches the right RSC payload and the server answers 200, and then `history.pushState` is never called. Confirmed by patching `history.pushState`/`replaceState` before any app code ran: on a dead click there is no history call at all, and nothing navigates back. A second tap always works.
- Ruled out by measuring rather than by reasoning: the service worker (blocking it changes nothing), `useDeferredValue` in the list controls (removing it changes nothing), response compression (`compress: false` changes nothing), and the nav bar's eager prefetching (changing it moves the rate around inside the noise). Buffering the RSC response through a proxy makes it navigate every time, which places the fault in the router's handling of the streamed payload rather than in anything this app does.
- **Fixed by watching the router instead of trusting it.** Every internal link now goes through `app/components/AppLink.tsx`: on click it notes where it was, asks the router once more after 900ms if the address bar has not moved, and navigates the browser after 2500ms if it still has not. Both timers are cancelled the moment the URL changes, so a healthy navigation (45–300ms on these screens) never sees either. Re-measured over thirty fresh sessions: **0 dead clicks**. A modified click — new tab, save link — is left to the browser. It is a workaround and is labelled as one; `tests/navigation.smoke.test.ts` keeps every link on it.
- **"Behind Target" for a target nobody had set.** A supervisor's RSO list showed seven red "Behind Target" badges and seven 0% rings for a month with no recharge target uploaded, while the same cards printed real GA figures in the thousands. `targetPercent(a, 0)` is 0 by design — there is no percentage of nothing — and three components painted that 0 as failure. `KpiCard` has declined to guess since v175; `EntityCard`, `StatusBadge` and `MetricBar` now do too: no ring, no band, no bar, and the words "No target" where a percentage would be. The achievement is still shown, because it is real.
- The tallies above those cards were wrong the same way. "Below Target 7" counted everything that was not on track, including the six rows the cards below it called "No target" — one screen disagreeing with itself. `splitByTarget()` in `lib/achievement.ts` now counts three buckets in one place, and the supervisor and manager RSO lists show "On Track / Below Target / No Target".
- The admin dashboard's **Attention watchlist** had the same fault at its root: the composite score averaged four percentages regardless of whether each had a target, so six RSOs with no targets at all scored 0 and sat at the top of a list headed "Lowest composite execution scores first", above everyone genuinely behind. The score is now the average of the parts that HAVE a target, and an RSO with none is unscored rather than zero — they are already counted on the dashboard's own "No target set" tile.
- **`[object Object]/25`** on every assigned-BP row of `/admin/performance/supervisors/[id]`. v177 turned `achieved` into a GaTiers object and one line kept interpolating it into a string; it read that way for two versions with every test green, because no test had ever read the words on a page. Fixed, and a sweep now reads the rendered text of all 120 static routes and 30 detail pages looking for "[object Object]", "NaN", "undefined" and "Invalid Date".
- **Premium pass on the shared layer, so every screen inherits it.** Elevation is now two shadows per level — a tight contact shadow for the edge and a wide ambient one for the room — instead of two nearly identical tight ones, which is why every surface used to read flat. Cards carry that shadow, a translucent warm rim (`--border-hairline`) rather than a flat grey line, and the radius token rather than a hardcoded value. The page moved off `--color-neutral-50` onto `--surface-page` (#f4eee8) so a white card has a ground to be raised above; muted text measures 4.81:1 on it and the contrast test reads the token, so darkening it further fails the suite rather than the user.
- Buttons are slabs, not labels with a background: a 36px floor so "Save" and "Download the whole report" are the same height and a one-word button is not a 26px target, weight 600 with slightly negative tracking, one focus ring for all of them, and a secondary that is a real surface rather than an outline.
- **A KPI card fits two to a phone row.** The figure moved onto its own line below the label with the ring beside the label, so it no longer competes with the ring for width — which is what forced one card per row below 480px and made an RSO's home 2,636px of scrolling. The empty state is one line instead of two. Long currency figures wrap rather than being ellipsed, because a truncated number is a wrong number printed confidently. The RSO home is now 2,345px with the same content.
- The GA 170/300 split renders as two labelled figures rather than one sentence, so a narrow card wraps between them instead of through the middle of one ("GA 300" on one line and "540" on the next). The ring's label shrinks to fit four and five digit percentages instead of painting over its own stroke — the company GA card reads 5,617%.
- The controls above a list — search, date range, sort — now sit on one panel instead of floating loose on the page, and the count is printed once rather than twice (the live region stays for screen readers, clipped rather than hidden).
- **The whole navigation graph was walked by clicking, not by reading hrefs**: every route, every drill-down, every back link, for all seven roles. Supervisor → RSO → retailer, manager → supervisor → RSO → retailer, admin → supervisor → RSO → retailer, all the attention and worklist chains, and the BP chains all land on the right record with real data. No dead links; the two the checker still reports are correct empty states (that RSO has no pending SSO and nothing in their attention queue).

## v184 - Retailer / RSO / Supervisor on the four import screens, and one snapshot instead of twenty-one

- **The Opening Balance page can now be read per RSO and per supervisor.** It offered only the retailer level, so an operator who wanted an RSO's total balance had to page through 2,190 outlets fifty at a time and add them up by hand. One switch above the table now shows the same snapshot three ways: every retailer, every retailer's balance added up under the RSO who owns the outlet, and every RSO's total added up under their supervisor.
- **The same switch is on GA, C2C and C2S**, so the four import screens answer the same question the same way. Those three already showed a retailer table and an RSO table — but as two separate cards stacked down the page, with no way to see a team.
- **Two switches per page, not one, on GA/C2C/C2S.** Their two tables are two different periods: one is a single DAY's feed, the other is the MONTH against target. A single control across both would let a reader carry a day's figure under a monthly heading, which is the "two numbers wearing one word" defect v178 and v182 were about. The monthly table also has no retailer level, because a target is set per RSO and per BP and never per outlet.
- **The roll-up groups on an id, never on a name.** Two supervisors can share a name, and a name-keyed roll-up merges their teams into one row without saying so — the defect v181 found in the Reporting Center. `/api/ga/summary`, `/api/c2c/summary` and `/api/c2s/summary` now send `employeeId` and `supervisorId` alongside the names so the page has something safe to group on.
- A team percentage is recomputed from the summed pair, never averaged from the RSOs' own percentages: the mean of eight percentages is the team's percentage only if all eight targets are equal, and an RSO with no target contributes a 0% that drags the team down for a number nobody set.
- `/ob` rolls up on the SERVER and the other three on the client, and the difference is the point: /ob's retailer table is paged at fifty rows, so a total added up from what is on screen would be the total of one page — a figure that looks like an answer and is not one. The other three already hold the whole day.
- **Found while checking those totals: the Opening Balance page was adding up twenty-one snapshots.** `/api/ob/summary` counted and summed every row in `ObRecord`, on the assumption that the importer's delete-then-write leaves exactly one. The development database holds **2,730 rows across 21 dates for 1,970 outlets**, so a page headed "Current Balance Snapshot" reported **2,730 retailers where there are 1,930** and a total of **৳9,460,105 where the latest snapshot is ৳9,168,905** — twenty old partial days added into today's. Every query is now scoped to the latest date, and the snapshot date is read from the data rather than from the import batch when the two disagree. `lib/drilldown.ts` had always read it correctly, one retailer at a time.
- The same latent fault in `lib/retailer-opportunities.ts`: it built `new Map(ob.map(...))`, so with more than one date in the table a retailer's opening balance was whichever row the database happened to return last — an August figure on a September screen. It now keeps the newest row per retailer, settled in memory rather than with a `max(date)` lookup, because `tests/query-depth.smoke.test.ts` holds that function to one wave of queries and a lookup-then-filter would be two.
- The level switch is a segmented control of its own rather than three `.kit-btn`s, and `.ops-level-tab` joins `.kit-btn` and `.kit-icon-btn` in the global button rule's exclusion list — without it the inactive tabs came out white-filled and bordered, so all three read as selected at once and the control said nothing.
- Guarded by `tests/ops-rollup.smoke.test.ts` (19 tests): the arithmetic, two supervisors sharing a name staying two rows, an employee with no supervisor keeping a row of their own, every page carrying the switch, the day and the month keeping separate state, the percentage being recomputed rather than averaged, every feed carrying the ids, and the OB summary reading one snapshot. Verified against the production-volume database through the APIs the pages read: 24 comparisons, every level adding to the one below it — OB ৳9,168,905 three ways, GA 4,409 for the day, C2C ৳4,813,805, C2S ৳2,771,035.
- 984 unit tests across 70 files pass; eslint 0 errors and the same 27 pre-existing warnings; prettier clean; `npm run build` clean.

## v185 - An edit screen now says which record you opened

- **The BP edit screen named nothing.** Its heading was the literal words "Edit BP", and the only thing above the fields was a box printing the BP DISPLAY NAME — a field that is optional, arrived in v181, and is blank on almost every assignment. So it fell through to its own placeholder and the whole screen read "Edit BP / Current BP assignment / To change retailer code, create a new BP assignment." Nothing named the outlet, the RSO, the team or the dates, and every link into that page is a row in a list — so an operator who opened one of two hundred assignments had no way to tell whether they were about to change the right BP's GA target or revoke the right BP's login.
- The page already loaded the retailer and the employee for the form's own fields; it simply never passed them on. It now shows **Retailer** (code and name), **RSO** (name and employee code or wallet), **Supervisor**, and **Effective** (start date, and "until …" when the assignment has ended) above the form, and the title reads "BP · Outlet 520" rather than "Edit BP". The name in the heading comes from `bpDisplayName()`, so a BP is called the same thing here as on My BPs, the worklists and the reports.
- **The same panel is on the RSO, Supervisor and Manager edit screens.** Those three were luckier rather than better — their name is itself an editable field, so it happened to be on screen — and "luckier" is not a property that survives a refactor. The RSO screen shows wallet, employee code, supervisor, retailer count and BP assignments; the Supervisor screen shows RSOs, retailers across the team and whether a login exists; the Manager screen shows supervisors in scope, login and status.
- The "BP Assignment" box keeps only the sentence explaining why the retailer code is fixed. It no longer prints the display name as if it were the record's identity, which is how it came to say the same words for every BP in the system. The display-name field gained the hint "blank uses the retailer file's name", so the two can no longer be confused.
- Guarded by `tests/edit-identity.smoke.test.ts` (6 tests): every edit page passing a heading and identity facts, the panel rendering only when editing and only when given facts, a BP being identified by outlet / RSO / team / dates rather than by its display name, an ended assignment saying so, and the old placeholder never coming back.
- 990 unit tests across 71 files pass; eslint 0 errors and the same 27 pre-existing warnings; prettier clean; `npm run build` clean. All four edit screens read back in a real browser with the page console watched: no page errors.

## v186 - Four small lies fixed, one race measured, and every headline figure recounted in SQL

- **The daily report's supervisor drill-down was keyed on a name.** Clicking a supervisor row filtered the RSO list by matching `supervisor` as text, so two supervisors who share a name returned each other's teams and nothing said so — the same fault v181 found in the roll-ups, still living in the drill-down. The link now carries `supervisorId`; the name is kept as a fallback so links people have already shared keep working. The filtered page also says whose RSOs it is showing: in the heading, in a line above the table, and in the copied summary, because a filtered report that looks exactly like an unfiltered one is a figure waiting to be quoted out of context.
- **"0%" against a target nobody set**, on the three import screens this time. v175 and v183 taught `KpiCard`, `EntityCard`, `StatusBadge` and `MetricBar` not to paint `targetPercent(a, 0)` as failure; the progress cells inside the operations tables had not been told. `ProgressCell` now prints "No target" where the bar would be, and the achievement is still shown, because it is real.
- **`/admin/rsos` was a 404 on a path that names a real thing.** The RSO detail is at `/admin/rsos/[id]` and the list at `/admin/performance/rsos`, so trimming the id off the address bar — or typing the obvious path from memory — got nothing. It now forwards to the list, carrying the query string, because the period a shared link holds is the reason it was shared.
- **Every row in the Accounts directory looked clickable and was not.** A BP row now opens that outlet's page and an RSO row opens their outlets, searched by wallet rather than by name — which needed the wallet and the RSO's own number added to `lib/retailer-search.ts`'s search text, since searching for a wallet had never matched anything.
- All four were read back in a real browser against the production-volume database: the drill-down lands on the right team by id and the old name-shaped link still resolves, the three import screens print "No target" and no bare 0%, `/admin/rsos` forwards with its month intact, and both kinds of directory row open a page with the right heading. No page errors.

### React #418, measured rather than guessed at

- The hydration error v180 first recorded now **reproduces on demand**, and `scripts/slow-html-proxy.mjs` and `scripts/hydration-race.mjs` are in the tree so it can be reproduced again. A reverse proxy streams the HTML in small chunks; Playwright cannot do this, because `route.fulfill` hands over the whole body at once and a delay before it only postpones an instant transfer.
- What four runs established, each 16–20 rounds against production volume: nothing throttled **0/14**; the document slow and scripts at full speed **4/20**; document and scripts both slow **3/20**; the document at full speed and only the scripts slow **0/20**. **A slow document is necessary and sufficient, and the speed of the scripts is irrelevant.** Across pages at the same rate: `/dashboard` (36KB) 0/16, `/it/reports` (57KB) 4/20, `/it/reports/sso` (222KB) 3/16 — it tracks document size.
- **The CSP nonce is not involved.** That has been the standing suspicion since v180 noted two renders "differ only in the CSP nonce", and v183 strengthened it by finding a new nonce minted per request. Every single load in every run above carried exactly one nonce in the DOM — the ones that fired and the ones that did not. The lead is closed, which is worth more than the reproduction: it stops a future version rewriting the Content-Security-Policy for nothing.
- **Not fixed in this version, and deliberately.** The lever is `app/components/ReportTable.tsx`, which receives the whole report and slices client-side so no page can render one page of rows and count another — the comment there says exactly that. Paging it server-side would shrink the documents that fire, and a half-done paging change risks the defect that comment exists to prevent. The measurement is written into the header of `scripts/hydration-race.mjs` so the next attempt starts from evidence instead of from the same guess.

### The whole month recounted in SQL

- Sixteen headline figures recomputed from `lib/business-rules.ts` directly in SQL and compared with what the application returns, the v182 method re-run over everything v183–v185 touched: company standard GA **67,398** of 74,864 rows (7,466 swaps, none unclassified), the 170/300 split **44,943 / 22,455**, C2C **৳72,105,925**, C2S **৳41,501,975**, the Opening Balance snapshot **1,930 outlets / ৳9,168,905** with both roll-ups adding to it exactly, per-RSO GA for all 43 RSOs, and per-supervisor GA. Every one agreed.
- **The seventeenth did not, and the app was right.** "Dashboard own-GA + BP-held GA = company GA" read 67,409 against SQL's 67,398. The eleven SIMs are one outlet held by two RSOs: each holder's row reports the whole outlet, correctly, because each of them is measured on the whole outlet — so adding the rows counts it twice. `teamTotals()` exists to union them by retailer and the audit script had not used it. A number 0.016% too large, arrived at by an entirely reasonable-looking `reduce`.
- The library rule was already tested to a standstill; what nothing checked was whether a SCREEN uses it. `tests/bp-rollup.smoke.test.ts` now fails if anything outside `lib/bp-rollup.ts` accumulates `bp.gaAchieved` (or the other six BP figures) across rows, and pins the September arithmetic that exposed it. Verified by injecting the offending line and watching the suite go red.
- No screen in the tree makes that mistake today. Every direct use of a BP figure is per-row — the fold each role page does, which is correct.

### The coverage sweep, made honest about its own failures

- `/admin/rsos` failed the route sweep with "Execution context was destroyed" — not the page, the harness: a forwarding route needs `networkidle`, because `load` fires on the document that is about to redirect and the next `page.evaluate` runs into the redirect. Listed in `FORWARDS` alongside `/admin/performance`.
- Running the sweep at two workers makes the machine deliver documents slowly, which is exactly the #418 condition, so the largest report pages hit the race a few times a run and it read as a route defect. A route whose ONLY error is a hydration error now gets one reload: fire twice and it is that page's defect and fails; fire once and it is the race, annotated so the run still records that it happened.
- The console and `pageerror` listeners are now both removed after each route. They were added per route and never taken off, so a 54-route sweep ended with 54 live closures holding 54 dead arrays.
- No schema change, no permission change, no business rule changed in this version.

## v187 - The menus: five cells instead of seven, and a sheet that holds the rest

- **The phone's bottom bar was drawing seven destinations across a 320px screen.** Measured on the real screens before anything changed: RSO cells **45px** wide at 320px, Manager's "BP Activations" **clipped** at 390px (53px of text into a 51px box, cut off with no ellipsis), Accounts with **five of seven labels on two lines at every width**, and the bar's own height swinging between **54px and 65px** depending on whether anything wrapped — so the content above it moved as you navigated. 45px is under the 44px tap-target floor once the borders are counted, seven targets wide with no gap between them.
- **The bar now stops at five cells**, and the fifth opens a sheet listing **every** destination the role has — not only the ones that did not fit, because two partial lists make the reader work out which one to look in. Nothing became unreachable, which is the objection that kept the bar at seven: below 900px the sidebar is `display: none`, so anything missing from the bar cannot be opened at all.
- **The page you are on is always in the bar.** If you open something from the sheet, it is pulled into the last primary slot — otherwise you would land on a page with four cells, none of them current, and nothing on screen saying where you are. Home and Live GA never move.
- Re-measured after the change: cells **60–82px** (from 45–60px), tap targets **74×58px** at 390px, no clipping at any width, and a bar that is a constant **68px** tall on every page of every role. The label box reserves two lines whether or not a label needs them, which is what makes the height constant. The only labels that still wrap are two long single words ("Supervisors", "Operations") at the two narrowest widths.
- Three labels gained a short form for the bar — "BP Activations" → "BP Activ.", "Retailer Search" → "Search", "SC & Targets" → "Targets". The sheet, the sidebar and the page heading all keep the full name, and a test fails if a short form is not an abbreviation of its own label: a menu that renames a destination depending on where you read it is the "two words for one thing" defect this project keeps finding.
- **Found while checking the bar: the Live GA dot rendered as an 8×24px orange bar.** The new label box is a `span` rule and the dot is a `span` in the same cell, so it inherited the two-line `min-height`. Caught by measuring the dot's box rather than by looking at it, which is the only way a 16px detail gets checked.

### Every sheet in the app now behaves like a dialog

- `Modal` declared `role="dialog" aria-modal="true"` and then behaved like an ordinary div. **Escape did nothing. Focus stayed on whatever opened it**, so a keyboard or screen-reader user landed in a dialog with the cursor still outside it. **Tab walked out of the back of the sheet** into the page that `aria-modal` had just told them was hidden. One component, so it was four sheets: the account sheet, the new navigation sheet, the target editors and the user manager.
- All three promises are kept now — Escape closes, focus moves to the panel on open and returns to the opener on close, Tab cycles inside. `onClose` is held in a ref rather than in the effect's dependency list: callers pass an inline arrow, so a new function arrives on every render, and in the deps it would have re-run the focus move on every keystroke in the change-PIN form.
- The component moved to `app/components/Modal.tsx` because it needs hooks and `Kit.tsx` has no `"use client"` — marking the whole kit as client code to give one component a key handler would pull the kit into the client bundle of every page that renders a card. `Kit.tsx` re-exports it, so nothing that already imported it changed.

### The sidebar

- **The group chevron was the character "⌄"**, drawn by whatever font the device had: it sat on the text baseline rather than the row's optical centre, its stroke matched nothing else in the menu, and on the owner's screenshots it read as a bare "^" and "v". It is now an icon on the same 24px grid and the same 1.8px stroke as every other icon there, and it turns when the group opens.
- **Group headings and items drew their icons at 1rem and 1.15rem** — too small a difference to read as a hierarchy, large enough to stop the two columns lining up. One size now, and the icon carries the amber when a row is active instead of the whole row.
- **The active item was a 90deg gradient from 22% white to 7%**, which spans the row's whole width and fades out at the right — so it read as a smear bleeding off the panel rather than a selected row. It is a contained surface with a hairline of its own on all four sides, and one accent instead of three competing.
- The rail beside a group's items was a flat 16%-white `border-left` that started and stopped square, reading as a leftover table line; it is now drawn as a rounded, fading pseudo-element inset from both ends, with its left edge under the centre of the group icon above it. The brand block gained a hairline so the navigation starts somewhere. A group heading answers the pointer — it was the one row in the menu with no hover state, and clicking it is what opens the group.
- **The row icons in every sheet were green.** `.kit-row-icon` still carried `--text-success` from the teal palette this app was built on before Banglalink, so the account sheet's shield and sign-out — and now the navigation sheet's destinations — drew green on a warm peach chip in an app whose entire palette is orange. Brand now, at the ratio the contrast suite already measures.

### The coverage sweep

- A route whose only error is a hydration error now gets **three** loads rather than two before it fails. The number is the measurement: v186 measured the worst-affected page, `/it/reports/sso` at 222KB, firing 3 times in 16 loads under a slow document — 19%. Two loads leaves a 3.5% chance of a false failure per affected route, which over a 54-route sweep is a red suite most weeks; three leaves 0.7%. A page with a real hydration mismatch fires every time and still fails on the third.
- No schema change, no permission change, no business rule changed, and no destination was removed from any role.

## v188 - Every report row was in the document twice

- **The report tables rendered every row twice** — once as a `<table>` for wide screens, once as a list of cards for narrow ones — with CSS hiding whichever did not apply. Both shipped to every reader, and the RSC flight payload carried a copy of each. Measured on `/it/reports/sso` at 60 rows and 8 columns against the production-volume database: the desktop `<tbody>` was **10.1KB** and the phone card list **34.8KB** — 3.4× larger, because every cell repeated its column label as text — inside a **217.5KB** document of which **146.4KB** was inline script. So a phone downloaded the table it would never see, a desktop downloaded the cards it would never see.
- **One rendering now, presented two ways.** The cell carries `data-label` and the card layout is drawn from it by CSS. The label cannot drift from the column heading because it _is_ the column heading — which two separate renderings could never guarantee.

  |                                    | before  | after              |
  | ---------------------------------- | ------- | ------------------ |
  | `/it/reports/sso`                  | 217.5KB | **129.9KB** (−40%) |
  | `/it/reports/ob`                   | 183.2KB | **111.6KB** (−39%) |
  | `/it/reports/low-c2s`              | 219.7KB | **131.4KB** (−40%) |
  | `/it/reports/performance/retailer` | 263.7KB | **151.2KB** (−43%) |

- **React #418 stopped firing on the reports.** Under v186's own conditions — the document alone throttled to 500kbps — `/it/reports/sso` measured **3 in 16** before and **0/16, 0/20 and 0/16** after; `/it/reports/low-c2s` measured **0/16**. Three runs on the shipped build, one on the intermediate one.
- **But size is not the whole story, and the version says so.** `/it/reports` has no report table, did not change, is _smaller_ than the reports that stopped firing (57KB), and still fires **3/20 and 4/20**. `/dashboard` at 36KB fires **0/20**. Two things were ruled out by experiment on that page: removing `ReportDateBar` — the only client component there that reads the clock — left it at 4/20, and link count does not separate it from `/dashboard` (43 against 40).
- What a firing load does show: capture the server's HTML and the post-hydration DOM and compare them, and the client tree has **discarded React's streaming Suspense markers** (`<!--$--> <!--/$-->`) that a clean load keeps. What React threw away is the streaming scaffolding, not any component's own output. The nonce remains uninvolved — one nonce in the DOM on every load, firing or not, as in v186.
- **The table keeps its semantics at phone width**, which the card list never had. `display: block` strips a table's roles from the accessibility tree, so `role="table"`, `role="row"`, `role="columnheader"` and `role="cell"` are written out. Verified through Chrome's accessibility tree at 390px: **1 table, 37 rows, 296 cells**, and a cell announces "Retailer Retailer 18" — the `data-label` is part of its accessible name where the hidden column header cannot be. Those roles cost 16.5KB of the 104KB saved, and they are worth it.
- On paper the column headings come back and the per-cell label is switched off, so a printed report does not say every value twice.

### The rest

- **Three more labels on the admin phone bar.** "Reporting Center" wrapped to two lines and "RSO Performance" was truncated to "RSO Performa…" in a 74px cell. They now read "Reports", "RSOs" and "Upload" in the bar and keep their full names everywhere else. v187's rule — a short form must be an abbreviation of its own label — now matches on the word STEM, so "Reports" for "Reporting Center" passes and "Team" for "Supervisors" still fails.
- **The whole month recounted in SQL again**: 16 checks, every one agreeing — company standard GA 67,398 of 74,864 rows, the 170/300 split 44,943 / 22,455, C2C ৳72,105,925, C2S ৳41,501,975, the OB snapshot 1,930 outlets / ৳9,168,905 with both roll-ups adding to it, per-RSO and per-supervisor GA, and own-GA + BP-held GA back to the company total.
- **And a second audit for what this version changed**: for all eight reports, the row count the page prints against the row count in the server-built Excel export — SSO 37, LSO 260, Low C2S 2,190, OB 2,190, and 7 each for the four supervisor reports — plus every cell carrying a label, every label matching its column heading, and zero second renderings anywhere. 16 comparisons, no page errors.
- No schema change, no permission change, no business rule changed, and no report's rows or ordering changed.

## v189 - Campaigns, and Sim Support

Two new features, both asked for by the owner, both built on the rules this app already has: a SIM is standard GA (swaps excluded) and a day an outlet is held as a BP belongs to the holder. Nothing existing changed.

### Campaigns — a target with a start and an end

- Every other target here is monthly. A campaign is **"500 SIMs between the 1st and the 10th"** or **"25 each, this fortnight"**, so its window is its own and nothing about it can be derived from a month. Created by **IT, Admin and Manager** — the owner's ruling, and not the usual Admin/IT pair, because a campaign is a field instrument and the manager runs the field. Everybody else sees it.
- **Two scopes, and they answer different questions.** _Whole distribution_ is one total: the screens show how many SIMs are needed and how many are done, and nothing else, because nothing else was set. _Per RSO / BP_ is a number each, so a supervisor sees what their own team still needs and a manager sees the same for every team.
- **A distribution-wide campaign has no per-RSO number, and the code says so** — `targetFor()` returns null for it rather than 0. Otherwise every RSO's phone would print "0 of 0 · 0%" for a campaign running perfectly well at company level, which is the defect v175, v183 and v186 each found somewhere else.
- **One number for everyone, with exceptions.** The campaign carries a number; an exceptions table overrides it for one person — a new RSO given 10 where everyone else has 25. **A zero is a decision**, not an absence: it means "this RSO is out of this campaign", their SIMs still count toward the distribution, and their absent target does not pull their team's target down. A team of eight with six in the campaign reads "6 of 8", never "8".
- **The field's own number leads.** An RSO's campaign card shows _their_ figure with the distribution's in the footer; the first build showed the company's 67,398 above their target of 15, which reads as if they were tens of thousands ahead. On the detail screen their line sits above the distribution's for the same reason — it is the question they opened the app to answer.
- The level switch is `OpsLevelTabs`, the same control the four import screens got in v184. There is no retailer level, because a campaign target is set per person and never per outlet.

### Sim Support — what today's SIMs are worth

- IT sets an offer for a **day**: slabs of "from N SIMs, ৳R each", and optionally the SSO offer. Most days carry none, and the screens say that rather than showing zero.
- **A slab reprices the whole day.** It does not pay a margin on the SIMs above the threshold. That is the owner's own arithmetic and it is worth stating, because the other reading is the obvious one and gives different money: at _from 11 → ৳50_ and _from 15 → ৳100_, **14 SIMs pay ৳700 and 15 pay ৳1,500**. One more SIM there is worth ৳800, not ৳100 — and showing that is the whole point of the RSO's screen. The marginal answer, ৳800 for fifteen, is pinned as a wrong answer in the tests so it cannot creep back.
- **Support is paid on two retailer codes per RSO**, marked in advance, and on a BP's own held outlet. SIMs on any other code are real GA and count on every other screen; they are simply not what this money is for. An RSO with no code set **cannot earn a taka however many SIMs they sell**, so their screen says exactly that instead of "৳0", and the operator screens name who is missing and link to where it is fixed.
- **The SSO offer, which is not every day.** An outlet that had not completed SSO and completes it today earns a rate on **every SIM it did today**, paid **on top** of the slab because the two are paid for different things. Both shapes the owner described fall out of one rule: "two SIMs today" is the case where the outlet had none before, and "one before and one today, so they get today's" is the case where it had one. An outlet already past the threshold yesterday does not qualify — the offer is for completing. The stricter form ("and at least N on the day itself") is a field on the offer and defaults to no condition at all.
- The scheme form **previews the money as you type** — each threshold and the SIM just below it — so the jump a slab creates is obvious before it is saved and paid.

### Found by the audit, on its first run

- **A campaign team total counted a shared BP outlet twice.** The audit read 67,409 against SQL's 67,398: eleven SIMs from one outlet held by two RSOs. Each RSO's row carries the whole outlet — correctly, because each is measured on the whole outlet — so adding the rows invents the second one. This is exactly what `teamTotals()` in `lib/bp-rollup.ts` exists to prevent, and v186's guard did not catch it because the guard looks for `bp.gaAchieved` and a campaign row does not have one. A campaign row now carries its BP figures **keyed on retailer id**, and `groupTotal()` unions them before adding.
- The same run confirmed what must NOT be unioned: an outlet held by RSOs in two different teams is counted by both, because v143 ruled that a supervisor answers for their own territory. Only a total across teams unions, and the audit checks each team against the union over its own rows rather than comparing the cross-team sum to the company's.

### The rest

- **Two new permission modules**, `campaigns` and `support`, rather than folding either into `targets`: Accounts owns targets and has no business writing a campaign, while a Manager owns campaigns and cannot upload a target file.
- **A new sidebar group, "Incentives."** These two are neither reports nor uploads — they are things the office sets and the field chases — and putting them under Performance would stand an editable target beside a read-only figure under one heading. On a phone they sit at the end of each field role's list, so they fall into v187's More sheet, which is where a target you check once a day belongs.
- **Schema:** `Campaign`, `CampaignTarget`, `SupportScheme`, `SupportSlab`, and `Retailer.supportEligible`. Additive only — nothing existing is altered or dropped, so the migration is safe against a database already serving. Campaign dates are `@db.Date`, not timestamps: they are calendar dates somebody typed, and storing an instant is how a campaign ends a day early for a reader in another offset.
- Five of this project's own guards caught the new code before any test of mine did, and each was a real inconsistency: raw `<input type="number">` where the wheel guard requires `NumberInput`, `toLocaleDateString` where the locale belongs in `lib/format` (now `fmtWeekdayDate`), `className="kit-btn"` on a link instead of `LinkBtn`, a form with no `method="post"` fallback, and a rate limiter hidden inside a shared helper where the API guard could not see it.
- 1,095 unit tests across 76 files pass — 45 of them new, on the two rule libraries. eslint 0 errors and the same 27 pre-existing warnings; prettier clean; `npm run build` clean. 22 SQL comparisons against the production-volume database, all agreeing. Verified in a browser as Admin, IT and RSO on both a desktop and a 390px phone: no page errors.

## v190 - Sim Support: the SSO offer counts every outlet, and the codes have no cap

Three corrections to v189's Sim Support, all of them about money.

- **The SSO offer is counted on EVERY outlet under an RSO, picked or not.** v189 paid it only on the slab codes, which was wrong: the owner's ruling is _"SSO ta rso under ar jai retailer gula sim sell kore tader sobar, kono selection nai."_ Measured on the seeded month, 2 September: **693 outlets completed SSO and 664 of them are not picked codes** — ৳221,400 that v189 would not have paid. The slab is unchanged and still counts only the picked codes, so the two payments now count different outlets, which is the most important sentence in `lib/sim-support-data.ts` and is written at the top of it.
- **The SSO offer is for RSOs only.** A BP earns its slab and nothing else, so no outlet can draw the bonus twice — once for the BP and once for the RSO who owns it.
- **A picked code that is held as a BP that day is not also counted for its RSO.** One outlet's SIMs paid to two people is the one error that cannot be argued about, and it follows the rule every other figure in this app already uses: a day an outlet is held as a BP belongs to the holder.
- **No cap on how many codes may be picked.** v189 refused more than two. The owner's ruling is that the number must not live in the code — _"bar bar update korte hobe na"_ — so any number is accepted and the screens simply say how many. Two is what the office picks today and the page says so, as a hint. One RSO in the seeded data now carries three.
- **Support Codes is its own menu entry**, under Incentives, not just a button on the Sim Support page: picking codes is a setup job somebody does on its own, and an RSO with none earns no slab at all. It is shown only to the three roles that may edit — a `writersOnly` flag on the nav item, because a permission module answers "may this role see the area" and every RSO may see Sim Support. Verified: an RSO who types the URL lands back on their own home.

### The two conditions, checked at the edges

The owner restated them, so both are written out in the tests in their own words and checked at the boundaries rather than at one example each:

- **nothing before, two or more today** → completes today. One today does not.
- **one before, one or more today** → completes today. Nothing today does not.
- already at the threshold yesterday → does **not** complete again, whatever today brings.
- and the offer's own extra condition — _"tar kintu 1ta korle SSO complete hoye jaito, but company sorto dice minimum 2ta korle taka pabe"_ — excludes the one-SIM case while still paying for **both** SIMs when the second arrives.

That last case does not occur anywhere in the seeded month, so it was **built**: `.scratch/ssoprobe.ts` inserts one SIM yesterday and one today on a clean outlet, checks it is paid ৳50 with no extra condition, **not** paid when the day demands two, paid ৳100 once a second SIM arrives, and not paid at all once it was already complete before today — then removes its own rows. Nine checks, all passing. A rule that never fires against real data is a rule nobody has tested.

### Also found

- **The nudge was subtracting money.** An RSO earning ৳6,400 from the SSO offer and nothing from the slab was told that four more SIMs "takes today's support to ৳40" — the slab step's own total, which reads as a cut of ৳6,360 for selling more. The bonus is already earned and does not move, so it is counted into the total while the gain stays what the extra SIMs are actually worth: **"4 more SIMs on your picked codes — 4 in total — takes today's support to ৳6,440, which is ৳40 more."**
- The same card said "৳6,400 · 0 SIMs counted", which looks like a mistake. It now names which SIMs: "0 SIMs on your picked codes · 16 outlets completed SSO".
- `SupportViews` began importing `SSO_MIN_MONTHLY_STANDARD_GA` to explain the rule on screen, and that module reaches Prisma — so the people table moved into the client island that uses it. `tests/client-bundle.smoke.test.ts` caught it before the build did.

### Gates

- **1,105 unit tests across 76 files** pass — 11 new on the SSO edges and the two-payment split, including source guards so a later tidy cannot narrow the SSO offer back to the picked codes or re-introduce a cap.
- eslint 0 errors and the same 27 pre-existing warnings; prettier clean; `npm run build` clean.
- **29 SQL comparisons** against the production-volume database, all agreeing — including the whole SSO rule rebuilt from scratch in SQL on four days, two of them with hundreds of real completions: 693 outlets / 4,428 SIMs / ৳221,400 on 2 September, and 643 / 4,435 / ৳443,500 on 3 September under the stricter offer.
- No schema change: v189's tables carry all of this.

## v191 — reading every page, as every role, on a real phone

No new feature. The owner asked for the whole app to be checked again and for the UI/UX to be perfect, so every page was read as every role at phone and desktop width and compared against what it claims. Four findings, all of them the same defect this project keeps finding: **output that renders perfectly and means something else.**

### A percentage nobody set, one column further left

`/it/reports/target` printed **`289 / 0`** and **`0 / 0`** in its GA, SSO and LSO columns — an achievement against a target of zero — while the percentage column immediately beside it correctly printed `—`. One row, two answers, and the dishonest one is the bigger number.

The percentage columns learned this in v175 and the cards in v183; the raw pair beside them never did, because no component owned it — eight screens each interpolated `${a} / ${b}` for themselves. The rule now lives once, beside `targetPercent`, which has returned 0 for a zero target on purpose since v175:

```ts
export function againstTarget(achieved, target, fmt = String) {
  return `${fmt(achieved)} / ${target > 0 ? fmt(target) : NO_TARGET_MARK}`;
}
```

Applied to the target report, `/ga`, the employee detail strip and the supervisor detail page. Three more screens — `/ga`, `/c2c`, `/c2s` — were falling back to a literal **`"0%"`** for a month whose target was never uploaded, which is the v175 defect verbatim, four years of versions later; they print `—` now. A source guard in `tests/empty-states.smoke.test.ts` rejects any page that builds an achieved/target pair by hand or falls back to `"0%"`, and it was verified by putting the old line back and watching it fail.

### Links a thumb could miss

Eleven links measured **18–20px tall** on a phone: the `View all →` / `See all →` / `Open list →` action beside a section heading on all seven role home pages, and every name in the daily report's table. Padding the table cell had made the **row** taller without making the **link** bigger, so a tap landing beside the words did nothing at all. Both now take a real 44px height on a touch screen only — unchanged under a mouse — and the cell gives its padding back so a column of names does not double in height.

### The sweep was measuring a phone that does not exist

The reason those links had never been caught: a default headless browser reports `pointer: fine` at any width, so **every `@media (pointer: coarse)` rule in `styles/mobile.css` was switched off** in the measurement. The first run of the new sweep reported 14 short tap targets that a real phone never sees, and would have missed a genuinely broken coarse rule entirely. `390px` now means `hasTouch`, and re-running it that way immediately found something the old configuration could not:

**Four pages scrolled sideways by 56px on a phone** — `/ga`, `/c2s`, `/c2c` and `/ob`. The upload field holds a native file input, which takes the 16px font every input gets on a touch screen so iOS will not zoom the page; a flex item will not shrink below its content unless told to, so the field pushed the whole document past the viewport. `min-width: 0` on the field and `max-width: 100%` on the input. Measured after: `scrollWidth` 390 on all four.

### Gates

- **`.scratch/sweep191.ts`** reads all 148 role-and-route combinations at 390 (touch) and 1440, checking each for `[object Object]`, `NaN`, a bare `undefined`, `Invalid Date`, a printed `null`, an error boundary, a percentage against a zero target, horizontal overflow, tap targets under 28px and page errors. **0 problems.**
- **1,106 unit tests across 76 files** pass.
- All four SQL audits re-run against the production-volume database and clean: company GA 67,398 (**0 failed**), campaigns and Sim Support 29 checks (**0 failed**), the nine SSO edge cases (**0 failed**), eight reports against their Excel exports (**0 failed**).
- `npm run build` clean. No schema change, no business-logic change, no new route.

### Still open

React error **#418** and the `parentNode` error that follows it remain reproducible on `/admin/attention` — **2 loads in 30** — but only while six parallel clients are hammering the heaviest report route at once, which is what v186 characterised: a slow **document** makes React discard its own streaming Suspense markers. Not reproducible at rest (0 in 40 loads), no app code is involved, and nothing the user sees is wrong when it happens. It is recorded here rather than claimed fixed.

## v192 — Stock & Cash: what Accounts hands out, and what comes back

The Accounts role has been a feed-import operator since it existed: GA, C2C, C2S, OB and Target files arriving from the company. This is the other half of the job, and it is a different business — physical stock and money moving through the distribution house itself. The two share exactly one thing, the person, and the GA product classification in `lib/business-rules.ts` is deliberately **not** the new Product master: one is a tariff on an activation in a vendor feed, the other is a thing in a box with a price on it.

### The one formula

```
Due = opening due + Σ(given) − Σ(returned) − Σ(cash) − Σ(bank)
```

Three things follow, and each is the owner's ruling rather than a choice this code made:

- **A reported sale does not reduce the due.** Only money or goods coming back do. Someone who sells ৳25,000 and deposits ৳20,000 has reduced their due by ৳20,000; the other ৳5,000 is in their pocket, which is what a due is for. `dueOf()` has no argument for a sale at all, so no caller can make that mistake by passing the wrong field.
- **The due contains the value of stock still in hand.** Straight from the owner's arithmetic — *"100000 takar product niche, 80000 taka sale dekhaice, tahole tar due 20000 taka"* — and the ৳20,000 of goods has not gone anywhere.
- **It is a running balance, per person, forever.** His second day (took ৳10,000 more, deposited ৳25,000) lands on ৳5,000, and `tests/stock.smoke.test.ts` checks that exact pair of days in his numbers.

Nobody's stock is added to anybody else's — *"proti ta person ar stock alada"*. There is no team total anywhere in `lib/stock.ts` and a test asserts there never will be: a supervisor reading their team sees a list of people who each owe something, not a sum nobody can collect.

### iTopup is a product

The recharge float is taken in the morning, spent during the day and handed back at night — the same three movements as a box of SIMs, in Taka instead of pieces. So it is a `Product` of category `ITOPUP` priced at 1.00, and `qty` is the amount. One movement table, one due formula, and no second set of rules to drift out of step with the first. The owner's own return example proves it: *"baki 10000 taka and 5ta sim accounts ke farot"* — two units, one mechanic.

### A price is frozen once anything points at it

Every figure a product has ever appeared in is `qty × price` read off the row that was chosen, so editing a price rewrites history silently. Once one movement refers to a row the price is frozen and a change becomes a **new row** that records which one it superseded; the old row goes inactive. Before that — a typo caught the same minute — there is nothing to protect and an edit is just an edit. `priceIsEditable()` is that single distinction, and the button says which of the two it is about to do *before* it is pressed. An old-price card and a new-price card stay two lines on a holder's stock table and are never merged; in the seeded month **12 people carry both versions of the same card at once**.

### Screens

One new nav group, **Stock & Cash**, at `/stock` for every role — not under `/accounts`, because a URL that says "accounts" in front of an RSO's own ledger reads like somebody else's page.

- **Stock & Cash** — everyone who owes something, largest first, plus the iTopup still out. A person who holds stock themselves lands on their own ledger instead.
- **Daily entry** — one Date and one person, then four tabs: **Give · Sell · Return · Collect**, saved in **one** request. Four separate screens would ask for the same date and person four times, on a phone, and four more routes would push everything real into the More sheet. Return is there because the business has it and the spec did not. Under the form, the due **after saving** moves as the numbers are typed, computed from `lib/stock.ts` and never from a second copy of the formula.
- **Ledger** — one person's stock product by product, how the due is made up line by line, and their last 30 days.
- **Products** and **Opening positions** — Accounts only.

Opening positions exist because history is not being imported: each person gets one statement of where they stood and the ledger runs forward. `openingDue` is the *whole* amount outstanding including the stock typed in the same form, so the field is prefilled from those rows rather than left for somebody to remember.

### Who may do what

Entry is **Accounts alone**. Reading: an RSO and a BP their own, a supervisor their own row plus their RSOs and the BP outlets those RSOs hold, a manager their assigned supervisors' teams, IT and Admin everything. A BP holder is the **outlet**, not the RSO holding it — an outlet changes hands (v142/v143) and the boxes stay in the shop. An RSO who types somebody else's ledger URL is redirected to their own, not shown a 404, because a 404 would tell them whether an id exists in another team.

### Gates

- **`.scratch/audit192.ts`** rebuilds every due in SQL that shares no code with the app and compares: **24 checks, 0 failed**, over **6,885 movements, 650 deposits and 54 holders** — every holder's due one by one, the company total (৳12,872,675), and a proof that the ৳26,695,746 of recorded sales moves the due by nothing at all.
- **`.scratch/stockwrite.ts`** drives the real API end to end — the owner's day, his return, a correction that replaces rather than adds (6 rows, not 12), a zero that deletes its line, four kinds of bad input refused, a used price that versions itself, and all three write routes refusing an RSO. **21 checks, 0 failed**, and it leaves the ledger exactly as it found it.
- **`.scratch/stockread.ts`** reads every stock screen as all seven roles at 390 (touch) and 1440: **0 problems**.
- **1,127 unit tests across 77 files**, 24 of them new. Four existing project guards caught this code as it was written — an unwatched `next/link`, a `<select>` over a data list, and two route-guard rules — which is what they are for.
- All four earlier SQL audits re-run and clean. `npm run build` clean; eslint 0 errors and **0 new warnings**; prettier clean.
- Schema: four new models and one migration, written by hand and applied to the local database only. Production `APP_DATABASE_URL` was never touched.

## v193 — a price change can no longer reach a figure already recorded

The owner, on v192:

> *"amon vabe jinish ta ready koro jate price change korlau ager data te effect jate na pore... ager sell kora product ba rso der jai product lifting kora hoice oi product ar price change hole full hisab change hoye jabe. Tai ai jinish ta thik moto ready koro, karon accounts hisab onk gurutoo purno."*

He was right to push. v192 protected history with a **rule** — a price was frozen once a movement referred to it, and a change made a duplicate product. But the money was still computed at display time as `qty × product.price`, so the entire protection rested on every future code path remembering that rule. For the number somebody gets paid on, a rule is not enough.

### The fix is one column

Every `StockMovement` now carries **`unitPrice`** — what one unit was worth when that line was recorded. Every figure in the module, from a single cell to a total three years from now, is `qty × that`. The product master is free to change: new price, back-dated price, renamed, retired, price row deleted. **There is no longer a path from any of it to a figure already saved.** Structure, not discipline.

`ProductRow` lost its `price` field entirely, and that removal is load-bearing: a screen holding one cannot value a historical movement with today's figure even by accident. When the field went, the compiler found all sixteen places that had been reaching for it.

### v192's second hole, which the owner's question exposed

Any past date may be corrected — that was the owner's ruling in v192. But the entry screen priced every line at **today's** price, so correcting a day from before a price change would have rewritten it at the new one. The same fear, arriving through the back door. Give and Sell are now priced by **the date being entered**, on the server.

### One product, many prices

`Product` is identity — kind, name, unit, status. `ProductPrice` carries every price with the date it starts. That answers the owner's storage worry directly: a price change costs **one four-column row**, against the eleven-column duplicate `Product` row v192 created. It is *less* data, not more, and "Swap SIM" appears once in the catalogue instead of once per price it has ever had. A holder carrying two lots of the same card sees one line — `20 in hand, ৳790, carried at ৳39.50` — instead of v192's two.

`priceOn(prices, date)` is the whole lookup. A product with no price on that date returns **null, not zero**: a product added in October genuinely has no September price, and a silent zero is a free handout nobody would ever notice. The entry screen names the product and refuses to save.

### A return credits what it was lifted at

The owner's ruling: *"je dame nice sei dame"*. Lift ten cards at ৳39, price rises to ৳40, hand those ten back — the due clears by exactly ৳390. At today's price it would clear ৳400 and leave him ৳10 ahead for doing nothing.

The Return tab has its own editable price column, defaulted to what that holder is actually carrying the product at — blended across lots, so someone holding a ৳39 lot and a ৳55 lot is offered ৳43.57, not today's price. It is **shown rather than applied silently**, and says "carried at ৳39" when the lot differs from the catalogue, because a default nobody can see is how a wrong number survives. Give and Sell cannot be priced by the client at all; only a return may name its figure.

### Migration

Written by hand, and it moves nothing. `unitPrice` is backfilled from the price each movement was recorded against **before** that column is dropped; v192's version chains collapse into one product with dated prices, their movements following. Measured across the real 6,885-row dataset, every money total is byte-identical before and after: given ৳37,159,155 · sold ৳26,695,746 · returned ৳4,193,772 · opening ৳1,722,564.

### The owner's catalogue

`prisma/seed-stock-catalogue.ts` ships his real list — scratch cards at 20/39/100, SIMs at 150/300, Swap, EV and E-SIM, iTopup, 4G and 5G routers, two handsets — with prices that go **up and down** and an E-SIM that starts mid-month, so the catalogue itself contains both cases the entry screen has to get right. Safe to re-run; it cannot move a recorded figure.

### Gates

- **`.scratch/pricelock.ts`** answers the owner's question by experiment: record two real days through the API, fingerprint every figure the module can show, then change the price five ways — including one **back-dated over both recorded days** — and fingerprint again. **Eleven figures, not one moved.** A day entered afterwards correctly takes the new price, and the return case lands exactly on zero.
- **`.scratch/audit192.ts`**, rebuilt against the new shape: **24 checks, 0 failed**. It now also proves the snapshot is doing real work — **12 rows worth ৳9,906 recorded that today's prices would call ৳10,160, a ৳254 difference v192 would have silently applied**.
- **`.scratch/stockwrite.ts`** (21 checks) and **`.scratch/stockread.ts`** (7 roles × 2 widths): 0 failed, 0 problems.
- Whole-app sweep over **216** role-and-route reads at 390 (touch) and 1440: **0 problems**. All four earlier SQL audits clean.
- **1,139 unit tests across 77 files**, 12 new on price-by-date and the return rule. `tests/api-authorization` caught a `guard()` helper hiding the role check from it — v189's lesson, arriving on schedule.
- Build clean; eslint **0 errors and 0 new warnings**; prettier clean. Production `APP_DATABASE_URL` never touched.

## v194 — the house's own books, and what the SIM feed already knew

Three things the owner asked for, and one defect the audit found on its way.

### 1. SIM check — given, activated, sold

> *"100 sim tar kach theke niche 50 ta active korce but 30 ta sell dekhaice.. ar mane baki 20tar taka tar kache ace... aita just tar knowledge ar jono"*

The middle column is what makes this worth having, and **nobody types it**: the GA feed this app has imported since v1 already records every activation against a retailer, and every retailer belongs to an RSO. So the screen shows, per RSO and per period:

| Given | Activated | Sold | **Not reported** | Worth | Not activated |
|---|---|---|---|---|---|
| 100 | 50 | 30 | **20** | ৳3,000 | 50 |

**Not reported** = activated − sold, floored at zero. It is the figure to act on, because an activated SIM is proof the thing left the RSO's hands — somebody is using it — so the money exists whether or not it was reported. **Not activated** is shown quietly and never called a shortfall: stock in a bag or sitting with a retailer is ordinary.

Sorted by **money**, not count — an RSO with 10 unreported swap SIMs outranks one with 20 cheap ones.

It counts *every* activation, deliberately not `withStandardGa`: that filter answers "what counts towards a GA target" and excludes swaps, but a swap SIM is a product in the catalogue the RSO is charged for, so its activation is a SIM leaving their hands exactly as a new connection is. Different question, same table.

**It never touches a due**, and the page says so — the two sides count slightly different things and always will (an activation can be of a SIM the retailer already had; an outlet that changed hands counts under whoever holds it now). A gap is a question to ask somebody, not a charge.

### 2. Expenses

> *"proti din tuk tak khoroj thake oi gular hisab o tar rakhte hoi... karon ai taka gula cash theke khoroj hoi"*

Date, kind, amount, cash or bank, who it went to, a note. Eight fixed kinds — a free-text category becomes forty spellings of "transport" and no report at all — with **Other** requiring a note, because an entry nobody can explain next month is not a record. The date and the kind stay put between saves, since this is the thing somebody types twelve times a day between other jobs.

It is the house's money and lives nowhere near a holder's due. The form says so under the button, because otherwise the first question anybody asks is whether it charges someone.

### 3. Lifting, godown and profit

> *"amader distribution ar lav los ar hisab ta amra bujte parbo.. and stock ta o bujte parbo"*

`Lifting` records what the company charged us, with **`unitCost` snapshotted** for exactly the reason v193 snapshots the selling price: the supplier's price changes too, and a purchase recorded in September must keep September's cost or every margin this app has ever shown moves the next time somebody updates a price list. Two invoices for one product on one day are kept as two rows — collapsing them would lose the references Accounts reconciles against.

**Godown** = `lifted − given to holders + returned by holders`. The owner's choice, and it needs no daily count. Two things it deliberately does not do: it does not subtract a holder's OPENING stock (that stock never passed through our godown — 84,133 units of it in the seeded data), and it does not add back what was SOLD (that went to a customer). A negative godown is shown in red, not clamped: it means a lifting nobody entered.

A unit's cost is the **weighted average** across every lifting of it — not the latest, which would revalue last month's margin every time an invoice arrived, and not FIFO, which needs lot tracking this business does not keep.

**Both margins, side by side**, as the owner asked:

```
Lifted from the company          ৳50,070,692
Issued to the field, at our price ৳28,986,990
  what that cost us               ৳25,161,046
  margin if it all sells (13.2%)   ৳3,825,945
Reported sold                     ৳23,375,050
  what that cost us               ৳20,291,645
  margin earned (13.2%)            ৳3,083,405
Expenses                            −৳193,827
───────────────────────────────────────────────
Net for the period                ৳2,889,578
```

The net is on the **sold** basis. Stock sitting with an RSO is not profit — it is stock with an RSO, and calling it profit is how a distributor finds out at the end of a quarter that the money was never there. The godown figure on the same page is **all time** whatever period is chosen, and is labelled so: "what was in the godown between the 1st and the 14th" is not a question with an answer.

### The defect the audit found

`.scratch/audit194.ts`, on its first run, disagreed with the app by **৳3,320,696**.

A product with **no lifting recorded** had an average cost of zero, so its margin came out as `soldValue − 0` — its entire sale value, as pure profit. The per-row screen already printed "no cost yet"; the **total** did not. This is the rule the percentage columns learned in v175 and the raw pairs in v191, arriving in a third place: **no cost is not a cost of zero.**

Uncosted lines now contribute nothing to any margin, and what was left out is **reported rather than silently dropped** — naming the products and the value excluded — because omitting it understates the business exactly as counting it at zero cost overstated it.

### Who sees what

The buying price is **Accounts, IT and Admin** — the owner's ruling. A manager writes campaigns and reads every RSO's due and still has no business knowing what we paid, so the nav carries a new `booksOnly` flag, separate from v190's `writersOnly` because it answers a different question. The SIM check is wider (Accounts, IT, Admin, Manager, Supervisor, each team-scoped) since it carries no purchase price and spotting a gap is a supervisor's job before it is anybody else's.

### Gates

- **`.scratch/audit194.ts`**: 22 checks rebuilding every new figure in independent SQL — **0 failed** — including that the total due is **still ৳12,872,675** after 50 liftings and 50 expenses. Not one moved.
- **`.scratch/bookswrite.ts`**: 36 checks end to end — weighted average across two invoices, every rejection, and **changing the selling price leaving the cost untouched**. Every role below Accounts refused at the API *and* redirected from the pages. **0 failed.**
- **1,172 unit tests across 78 files**, 33 new. `tests/picker.smoke.test.ts` caught the expense-category `<select>`, as designed.
- Whole-app sweep at 390 (touch) and 1440, and the stock read pass across all seven roles: **0 problems**. v192's and v193's audits and the price-lock probe re-run clean.
- Build clean; eslint **0 errors, 0 new warnings**; prettier clean. Production `APP_DATABASE_URL` never touched.
