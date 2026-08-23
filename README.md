# Sales Reporting Web App Starter

This starter turns the existing Excel workflow into a PostgreSQL-backed Next.js application.

## Current foundation
- PostgreSQL + Prisma schema
- Employee -> many Retailers relationship
- Monthly employee targets
- Manual SC achievement
- GA/C2C/C2S/OB daily record models
- Import batch/error tracking
- Monthly KPI calculation service
- Dashboard API stub
- Daily upload API stubs
- Dashboard prototype page

## Run locally
1. Copy `.env.example` to `.env` and set `DATABASE_URL`.
2. `npm install`
3. `npx prisma generate`
4. `npx prisma migrate dev --name init`
5. `npm run dev`

## Next implementation milestone
Map the real Excel columns for GA, C2C, C2S, OB and the monthly target sheet, then connect parsers to the import endpoints.
