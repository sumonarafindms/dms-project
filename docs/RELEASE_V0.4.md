# Release v0.4 - GA & SSO

- Added working Input GA import endpoint.
- Supports the existing workbook's `Input GA` sheet layout.
- Retailer code maps against Retailer Master.
- Daily GA Total / 150 / 300 values are upserted by retailer + date.
- Re-uploading the exact same file is detected by SHA-256 hash.
- Corrected files can update existing retailer/day records without duplicates.
- Added `/ga` page with month selection, upload status, import history and employee performance.
- GA Achievement = monthly GA total for all retailers under the employee.
- SSO Achievement = unique retailers under the employee where `SIM_SELLER = Y` and monthly GA >= 2.
