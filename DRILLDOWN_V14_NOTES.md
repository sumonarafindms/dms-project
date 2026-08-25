# DMS v14 — Drill-down, Search & Mobile Detail UI

## Added
- Admin Performance page with RSO search, month filter, ranking and drill-down.
- Manager Supervisor drill-down with team KPIs and RSO navigation.
- Manager RSO drill-down with monthly target/achievement and retailer execution.
- Supervisor RSO drill-down restricted to the logged-in supervisor's own team.
- RSO retailer search and retailer detail pages restricted to the logged-in RSO.
- Supervisor retailer search/detail restricted to the supervisor's team.
- Retailer detail shows monthly GA Total/150/300, C2C, C2S, SSO, LSO, latest OB, route/category, BP status, recent GA and recharge activity.
- BP Sales page now supports month selection and SIM serial search with GA history.
- Mobile-friendly filter bar, linked list rows, detail cards and activity timeline styling.

## Security scope
- Admin can drill into all RSOs/retailers.
- Manager can drill into all supervisors, RSOs and retailer execution.
- Supervisor can only open employees and retailers under their own supervisor ID.
- RSO can only open retailers assigned to their own employee ID.
- BP can only view GA history for the BP retailer attached to that login.

## Database
No schema or migration changes in v14.
