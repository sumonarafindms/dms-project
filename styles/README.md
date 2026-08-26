# Styling structure

`app/globals.css` is now an import manifest only. Shared design tokens live in `tokens.css`, base shell primitives in `base.css`, and the remaining legacy/premium layers are split by responsibility and historical cascade order.

Important: keep new page-specific work scoped in a dedicated stylesheet or CSS Module. Do not append new version blocks to `app/globals.css`.

The import order is intentional because the v82 UI depends on the existing cascade. Moving rules between imported files can change computed styles even when selectors are unchanged.
