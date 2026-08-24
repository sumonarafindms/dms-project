# Release v0.6 - C2C cumulative import

- Adds `/c2c` month-to-date Stock Lifting upload.
- Supports the actual tab-separated `.xls` report and normal Excel workbooks.
- Uses `RETAILER_CODE` for retailer mapping and checks `SRNUMBER` against the master RSO relationship.
- Reads date columns from row 1 (`01-Aug-2026`, etc.).
- Replaces covered date-range data on every cumulative upload, preventing double counting.
- Stores only non-zero daily C2C rows to reduce database usage.
- Does not store a separate monthly snapshot: non-zero retailer/date rows are enough to derive both `TRANSACTION_COUNT` and `TOTAL_AMOUNT`.
- Validates that date-wise amounts add up to `TOTAL_AMOUNT`.
- Employee C2C achievement and Total Recharge (`C2C + SC`) now work automatically.
