# Styling structure (Tailwind v4, Pass 4 redesign — 2026-08-27)

The old 27-file, 30-version-layer CSS system (`-v84` through `-v99`, "polish",
"repairs", etc.) has been replaced. `app/globals.css` now loads Tailwind and
eight files, in this exact order:

1. `tokens.css` — the premium Deep Navy + Slate design system as a Tailwind
   v4 `@theme` block (colors, radius, shadow, font, easing). Change the look
   of the whole app here.
2. `base.css` — resets, `body`/`h1`-`h4` defaults, scrollbar, `.page`.
3. `coverage.css` — attribute-selector safety net (`[class$="-page"]`,
   `[class$="-icon"]`, `[class$="-grid"]`, ...) so any page-specific class
   name not explicitly styled elsewhere still renders on-theme instead of
   unstyled. Loaded before the files below so their more specific rules win.
4. `shell.css` — `AppShell.tsx`: sidebar nav, mobile topbar, bottom nav.
5. `dashboard.css` — role dashboards + the admin performance dashboard
   (`dash97-*` classes in `app/dashboard/page.tsx`).
6. `tables.css` — data tables, `OperationsPremiumUI.tsx` (GA/C2C/C2S/OB),
   import health cards, filter bars.
7. `forms.css` — form controls, login/setup/sacool auth pages, employee and
   permission editing forms.
8. `components.css` — the shared `Premium*` component library (badges,
   cards, dialogs, toasts, progress, empty/loading states) plus generic
   `.card` / `.btn` / `.section` primitives used everywhere.

## Why class names were kept

~80 page files reference hundreds of class names, many of them the same
visual pattern under a different role-prefixed alias (`.rso-v7-hero`,
`.manager-v5-hero`, `.supervisor-v6-hero` were one design, three names).
Rather than rewrite every page's JSX in one pass — high regression risk on
a project whose business-rule correctness is the priority — every rule
above groups all known synonym class names against one new, real design.
Business logic, data-fetching, and API contracts were not touched.

## Adding new styles

Prefer Tailwind utility classes directly in new JSX. If a new shared
pattern needs a named class, add it to the relevant file above inside its
`@layer components { }` block and `@apply` Tailwind utilities/tokens rather
than hand-rolled hex values — keeps the app on one palette.
