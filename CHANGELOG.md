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
- Fixed a stacking bug the new sheet exposed: a dialog rendered inside the sticky mobile top bar was scoped to that header's stacking context and painted *under* the bottom navigation, so its buttons could be seen and not tapped. The account dialog portals to `<body>`.

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
- The two high-severity `xlsx` advisories had been marked "No fix available" since v123 and carried through fifty versions. There is no fix *on npm* — SheetJS stopped publishing to the registry at 0.18.5 — but both are fixed upstream (prototype pollution in 0.19.3, the ReDoS in 0.20.2). The patched 0.20.3 tarball is now vendored at `vendor/xlsx-0.20.3.tgz` and installed by file path, so `npm ci` resolves it from disk and no deploy depends on a CDN being up.
- Four transitive advisories whose npm-suggested "fix" was a major upgrade are pinned forward within the same major instead: `postcss ^8.5.28` (npm wanted Next 16), `uuid ^11.1.1` (npm wanted exceljs 3.4.0 — a downgrade of two majors that would have removed the workbook features the v153 exports use), `deepmerge-ts ^8.0.2` (npm wanted Prisma 6.12), `js-yaml ^4.3.2`.
- Verified on the paths that matter rather than by type-checking: all four real carrier files re-parsed identically on the new library (C2C 1936 rows, C2S 1927, OB 2190, GA 2527) with the GA figures unchanged (1,948 normal SIM, 579 swaps, 1,433 / 515 tiers); ExcelJS round-tripped a workbook with conditional formatting and Bengali text on uuid 11; `prisma generate` and `db push` on deepmerge-ts 8; a full build on postcss 8.5.28.
- Two dev-only moderate advisories remain in vitest. The fix is vitest 5, which reads `"jsx": "preserve"` from `tsconfig.json` and hands untransformed JSX to Vite; two suites stopped loading. Reverted deliberately and recorded, rather than fighting a build-tool config to silence a test-runner advisory while production is at zero.
- Guarded: `tests/dependency-security.smoke.test.ts` fails if SheetJS drops below 0.20.2, if the spec stops pointing at `vendor/`, if the tarball goes missing, if any pin is removed, or if exceljs is downgraded to "fix" uuid — and it parses both a workbook and a tab-separated `.xls` through the library, so a tarball that installs but cannot read fails too.
- No schema, route, auth, permission or business-logic change.

## v175 - A number with no date, and a screen that says nothing
- Six defects, all on the roles about 90% of this app's users hold, and all the same shape: the screen was confident and wrong, and nothing errored.
- **"Latest GA" was not the latest, and had no date.** The snapshot asked for the newest activation date *belonging to the person looking*, so an RSO who had sold nothing for three weeks was shown the count from the last day they did sell, labelled "Latest GA". It could not show a zero — a zero has no row to read a date from — so the number was always somebody's good day. GA and C2C also resolve independently and were **44 days apart** on real data with nothing on screen admitting it. A daily figure is now anchored on the newest day *the feed* has, and that day is printed beside it (`GA · 25 Aug`), with an amber line naming any feed that is behind. Zero now means zero.
- **The RSO home rendered a blank page** — `return null` for any deactivated employee record: no heading, no message, and on a phone no way back. It now says whether the record is switched off or missing, because those send the person to different people.
- **"All SSO complete" appeared when nothing was complete.** Tapping the Complete filter with nothing completed congratulated the RSO on finishing work none of which was done; an RSO with no SIM-seller retailers got the same green tick. Three branches now, and only the genuine all-clear carries the tick. The grouped layout had the same bug twice over — it reported the filtered-out half as empty — and now hides it instead. The month the page reports on is on screen, rather than a silent `?month=`.
- **An empty scope read as an all-clear.** The attention list's fixed "No attention items — execution rules are complete for this scope" fired for an unmapped RSO login, a supervisor with no team, a manager with no supervisors, and a search that matched nothing. Each route now says what empty means for its own role, and an unmapped login gets a notice rather than a list.
- **"0 of 0" with a 0% ring for a month whose target was never uploaded** — five tiles telling an RSO they were at zero percent, in the colour the app uses for failing. `PaceFoot` already declined to guess for this case; the card now agrees, and says "No target set".
- **The BP's "Today's Activation" was zero for most of every working day**, because the feeds are uploaded for the previous day. It is anchored on the feed's day now, clipped to the assignment window as the monthly figure already was.
- Also: `businessDayBounds` moved into `lib/business-time.ts` (three modules wanted it, and "a business day is a date, not an instant" should exist once); `lib/live-ga.ts` had its own second copy of `dhakaTodayYmd` with its own offset constant, now gone.
- Guarded by `tests/feed-day.smoke.test.ts` and `tests/empty-states.smoke.test.ts` (42 tests), with eight mutations run and every one caught. The attention-page line cap was raised for the new wording and backed with a direct assertion that none of the three routes renders the shared view itself.
- No schema, route, auth, permission or business-rule change — the same figures, over the days they are actually from.
