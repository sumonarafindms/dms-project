# Release v0.5 - Activation-level GA Import

## What changed

- GA input now accepts the daily `ActivationDetailsReport.xlsx` format.
- User selects the business/data date before upload. Default UI date is yesterday.
- Required source columns: `RETAILER_CODE`, `SIM_NO`, `SELLING_PRICE`, `ACTIVATION_DATE`, `ACTIVATION_TIME`.
- Selected date is validated against `ACTIVATION_DATE`; mismatched-date files are blocked.
- `SIM_NO` is globally unique and is the GA deduplication key.
- Corrected data for an existing SIM can update the stored activation instead of creating another GA.
- Original Excel files are not stored. Only minimal activation rows are saved in PostgreSQL.
- Retailer daily GA is calculated dynamically:
  - **Total** = all unique SIM activations.
  - **150** = `SELLING_PRICE = 170`.
  - **300** = all selling prices other than 170.
- Employee monthly GA is the sum of activations from all retailers assigned to that employee.
- SSO is calculated from SIM-selling retailers (`SIM_SELLER = Y`) with at least 2 monthly GA.
- GA page now includes selected-day retailer detail, monthly employee performance, and import history.

## Database migration

Migration `20260824202000_ga_activation_detail` adds:

- `GaActivation` table.
- `ImportBatch.duplicateRows`.

The production build script runs `prisma migrate deploy` automatically before the Next.js build.
