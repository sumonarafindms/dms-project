# Release 0.8 - Opening Balance snapshot

- Added `/ob` page and OB import API.
- Reads the single report date from row 1 automatically.
- Maps `RETAILER_CODE` to Retailer Master and checks `SRNUMBER` against the assigned employee.
- Stores only the latest opening balance snapshot.
- A successful new upload deletes previous OB records and previous OB import metadata.
- Original uploaded files are never stored.
- `TOTAL_AMOUNT` must match the single dated amount column.
