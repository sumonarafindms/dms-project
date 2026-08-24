# Release v0.7 - C2S + LSO

- Added cumulative C2S import for `ITop_Up_Sales` reports.
- C2S data is stored separately from C2C.
- Date columns are normalized into retailer/date rows.
- Repeated cumulative uploads replace the covered month-to-date window, preventing double counting.
- Source files are processed only and are not stored in PostgreSQL.
- Added `/c2s` page with employee-level C2S amount, transaction count, LSO target, achievement, and date-wise sales.
- LSO rule: retailer monthly C2S amount >= 500 and transactions >= 7.
