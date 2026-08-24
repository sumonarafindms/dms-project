# DMS Sales Reporting Web App

Current release: v0.5

## Implemented
- PostgreSQL + Prisma foundation
- Supervisor → Employee → Retailer master hierarchy
- Employee and Retailer Excel imports
- Monthly Target entry
- Manual SC Achievement entry
- Daily `ActivationDetailsReport.xlsx` GA upload with selected business date
- SIM-level GA deduplication using unique `SIM_NO`
- Minimal GA storage: retailer, SIM serial, activation date/time, selling price
- Retailer daily GA: Total / 150 / 300
- Employee monthly GA Achievement
- SSO Achievement using `SIM_SELLER = Y` and monthly GA >= 2
- GA import history, duplicate-file protection, and corrected-SIM updates

## GA business rules
- `Total` = all unique SIM activations for the retailer
- `150` = activations where `SELLING_PRICE = 170`
- `300` = activations where `SELLING_PRICE != 170`
- The selected upload date must match `ACTIVATION_DATE`
- Uploaded Excel files are processed and discarded; the database does not store the source file

## Main pages
- `/master-data`
- `/targets`
- `/ga`
- `/dashboard`

## Deployment
The application expects `DMS_DATABASE_URL` in the deployment environment.

```bash
npm install
git add .
git commit -m "Add daily activation GA import"
git push
```

The Vercel production build runs `prisma migrate deploy` before `next build`, so the new GA activation migration is applied automatically.
