# DMS Project v13

Mobile-first Distribution Management System built with Next.js, TypeScript, Prisma and PostgreSQL.

## Current modules
- Supervisor → RSO → Retailer master hierarchy
- Dynamic BP assignment from existing retailer codes with effective-date history
- Role-based login for Admin, Manager, Supervisor, Accounts, RSO and BP
- Admin Users & Access and BP Management
- GA activation import with SIM-level duplicate protection
- C2C cumulative import
- C2S cumulative import and LSO calculation
- Latest Opening Balance snapshot
- Monthly targets and manual SC achievement
- Role-specific mobile-first dashboards

## BP workflow
1. Admin opens **BP Management**.
2. Select an RSO.
3. Select one retailer already under that RSO.
4. Choose effective date and optional GA target.
5. Assign BP.
6. The previous active BP for that RSO is closed and retained in history.
7. If the previous BP already had a BP login, the same login automatically follows the new BP retailer code.
8. New BP logins can be created from **Users & Access** only for an active BP assignment.

## Deploy
The Vercel build command runs `prisma migrate deploy` before `next build`, so committed migrations are applied during deployment.

Do not commit local `.env*`, `.git`, `.vercel`, or `node_modules`.
