# Sales Reporting Web App — Foundation Specification

## Confirmed source model

### Master data (updated only when needed)
1. Employees: each employee has a unique phone number.
2. Retailers: each retailer has a unique retailer code and belongs to one employee.
3. One employee can have many retailers (50, 100, or more).

### Daily uploads
1. Input GA
2. Input C2C
3. Input C2S
4. Input OB

## Confirmed monthly KPIs

- GA achievement: monthly GA total for all retailers linked to the employee.
- C2C achievement: monthly C2C amount distributed to all retailers linked to the employee.
- SC achievement: manual monthly entry.
- Total Recharge achievement: C2C + SC.
- SSO achievement: count of linked retailers whose monthly GA is at least 2.
- LSO achievement: count of linked retailers whose monthly C2S is at least 500 and monthly transaction count is at least 7.

## Target model
Targets are supplied by the company each month and stored employee-by-employee.

## Data integrity rules
- Employee phone number is unique.
- Retailer code is unique.
- Retailer-to-employee link uses an internal employee ID so a phone-number change does not break historical relationships.
- Daily records are unique by retailer + date for each source type.
- Import batches are logged.
- Unknown retailer codes must not silently disappear. They should be reported as import errors.
- Re-upload policy should be update/replace for the same retailer/date after user confirmation in the UI.

## Items intentionally pending workbook/source-file verification
- Exact GA source columns and whether GA 150/300 must be retained separately.
- Exact C2C source columns.
- Exact C2S source columns and any extra LSO eligibility filters beyond amount >= 500 and transactions >= 7.
- OB source columns and its single downstream use.
- Monthly target file column mapping from RSO Mother Sheet.
