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
