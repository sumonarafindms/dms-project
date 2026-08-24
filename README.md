# DMS Sales Reporting Web App

Current release: v0.7

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

## v0.6 C2C

The `/c2c` page imports the cumulative ITop Up Stock Lifting report, stores only non-zero retailer/date amounts, validates TOTAL_AMOUNT and TRANSACTION_COUNT, and calculates employee C2C + Total Recharge.

## v0.7 C2S + LSO

The `/c2s` page imports the cumulative `ITop_Up_Sales` report into the separate `C2sRecord` table. It stores only non-zero retailer/date sales, validates `TOTAL_AMOUNT` and `TRANSACTION_COUNT`, and calculates LSO by retailer for the selected month. Current LSO rule: monthly C2S amount >= 500 and transaction count >= 7.
