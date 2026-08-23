# DMS v0.3 - Monthly Targets

## Added
- `/targets` monthly target entry page.
- Employee-by-employee GA, C2C, SC, Total Recharge, SSO and LSO targets.
- Manual SC achievement entry per employee and month.
- Supervisor, employee, RSO MSISDN and retailer-count context on target rows.
- Search by employee, RSO code/MSISDN or supervisor.
- Company total target summary cards.
- `GET /api/targets?month=YYYY-MM` and `POST /api/targets` bulk save API.
- Target saves use the existing employee + month unique key and are duplicate-safe.

## Deployment
No new database migration is required for this release because MonthlyTarget and ManualMetric tables already exist in the schema/migrations.
