# DMS v25 Permission Presets + Bulk Access

Implemented:
- Bulk Permission Manager for all non-Admin users.
- Filter users by role before bulk changes.
- Multi-select individual users or select all visible users.
- Role Default preset.
- View Only preset.
- Data Operator preset.
- Full Non-Admin Access preset.
- Copy one user's effective permissions to multiple target users.
- Permission overview counters: total users, role-default users, customized users, roles.
- Individual Permission Editor now has quick View Only / Data Operator / Full Access buttons.
- Existing hidden-navigation behavior from v24 remains unchanged.
- Existing server-side write safety checks remain unchanged.
- Admin remains unrestricted.
- APP_DATABASE_URL remains unchanged.

Database:
- No new migration in v25.
- Uses UserPermission from v23.
