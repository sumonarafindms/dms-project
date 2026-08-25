# DMS v20 Admin Architecture + Performance

Implemented from the Admin requirements:
- Grouped Admin navigation: Overview, Performance, Upload, Management.
- Dedicated Performance routes for Supervisor, RSO, BP and Retailer.
- Supervisor performance aggregation with assigned RSO/BP counts and team drill-down.
- RSO performance cards and existing deep retailer drill-down.
- BP performance with GA target, achieved, remaining, percentage and activation detail.
- Retailer performance with search and execution status summary.
- Mobile-friendly Performance filters/cards and desktop multi-column layout.
- Existing upload pages remain functional and are now organized under the Admin Upload navigation.
- Existing Admin dashboard retained.
- Other user-role interfaces are unchanged.
- APP_DATABASE_URL remains the Prisma datasource.
- No database migration required for this release.

Next Admin phase:
- Dedicated Upload hub + sample-file downloads/validation UX.
- Employees: Manager, Supervisor, RSO, BP management.
- PIN reset and granular permissions.
