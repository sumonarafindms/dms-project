# DMS Sales Reporting System

Next.js + TypeScript + PostgreSQL + Prisma application for DMS sales reporting.

## Current features

- Supervisor -> Employee -> Retailer master hierarchy
- Employee Excel import
- Retailer Excel import
- Automatic mapping: `RS0 MSISDN` -> `I_TOP_UP_SR_NUMBER`
- Unassigned retailer tracking
- Monthly KPI data model for GA, C2C, SC, Total Recharge, SSO and LSO
- Daily GA/C2C/C2S/OB data models and import endpoints ready for exact source mapping

## Deployment

Vercel must provide `DMS_DATABASE_URL`.

The production build runs `prisma migrate deploy` before `next build`, so committed migrations are applied automatically during deployment.

## Local development

```bash
npm install
npm run dev
```

For local database commands, ensure `DMS_DATABASE_URL` is available in the environment.

## v0.3 Monthly Targets

- `/targets` lets admins set monthly GA, C2C, SC, Total Recharge, SSO and LSO targets per employee.
- SC achievement can be entered manually per employee/month.
- Targets are stored with an employee + month unique key, so re-saving updates instead of duplicating.
