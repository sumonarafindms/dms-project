# Styling structure

`app/globals.css` loads Tailwind v4 and then these files, in this exact order:

1. `tokens.css` — the Deep Navy + Slate design system as a Tailwind v4
   `@theme` block (colors, radius, shadow, font, easing). Change the look of
   the whole app here.
2. `base.css` — resets, `body` / `h1`–`h4` defaults, scrollbar, `.page`.
3. `patterns.css`, `shell.css`, `tables.css`, `forms.css`, `components.css`,
   `premium.css` — the app shell (sidebar, mobile topbar, bottom nav), the
   generic `<table>` treatment, the auth pages, and what remains of the
   pre-kit families.
4. `kit.css` — **the role-UI kit**: the single design system for the role
   pages, paired with `app/components/Kit.tsx`. Loaded last among the
   component layers so a kit page always outranks the older sheets.
5. `mobile.css` — phone overrides.

## Where the migration stands

Every role page is on the kit, as are the error boundary, the 404 and all six
route skeletons. What still uses the older sheets:

- `app/login`, `app/setup`, `app/sacool` — the auth pages (`auth-v54-*`,
  `sacool-v58-*`), which have their own full-page design.
- `app/components/AppShell.tsx` — the shell chrome (`shell.css`).
- `app/master-data` — a standalone tool with inline styles and a raw table.

## The attribute-suffix safety net is gone (v115)

`coverage.css` used to hold ~40 rules of the form

```css
[class$="-card"]:not([class*="kit-"]) { ... }
```

as a fallback for legacy class names nothing else styled. It was deleted once
the audit showed only eight auth-page classes still depended on it; those eight
declarations now live in `forms.css` beside the rules they belong to.

Deleting it is worth understanding, because the file was never the harmless
fallback its own header claimed:

- `[class$=]` matches the **whole class attribute**, so a collision came and
  went with how many classes an element had (`class="kit-card"` matched,
  `class="kit-card kit-card-p"` did not).
- Worse, `:not(...)` **adds the specificity of its argument**. So
  `[class$="-card"]:not([class*="kit-"])` is (0,2,0), not (0,1,0) — it
  outranked every single-class rule in the app, including the bespoke rule
  written for that exact element. It was not a floor; it was a ceiling. The
  login page had been rendering with the fallback's card padding, shadow, grid
  and kicker colour instead of the ones `forms.css` defines for it.

If you ever reach for an attribute selector again, check both of those before
you do.

## Adding new styles

New role-UI work goes in `kit.css` and `Kit.tsx` — extend an existing atom
rather than adding a near-duplicate class. Use the `--color-*` / `--radius-*`
/ `--shadow-*` tokens, never raw hex. Keep selectors to one class where you
can; the app's whole history of "why did my rule lose" traces back to
selectors that were more specific than they looked.
