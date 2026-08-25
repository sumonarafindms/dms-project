# DMS v24 Permission Visibility

Behavior requested:
- Permission-disabled features are hidden from the UI instead of showing blocked/denied cards.

Implemented:
- Root layout resolves the current user's effective permissions.
- Desktop sidebar automatically hides modules without View permission.
- Mobile bottom navigation automatically hides modules without View permission.
- Empty navigation groups disappear automatically.
- Role dashboard Quick Actions can now hide by permission.
- Manager, Supervisor, RSO and Accounts quick actions are permission-aware.
- Accounts Operations hides individual GA/C2C/C2S/OB/Target actions by View permission.
- GA/C2C/C2S/OB upload controls and sample-download controls disappear when Add permission is disabled.
- The underlying report/performance data can remain visible when View is allowed.
- Targets become read-only when Update permission is disabled; Save and edit inputs disappear.
- Existing server-side write permission checks remain in place as a safety layer, but normal users do not see unavailable actions.
- Admin remains unrestricted.
- APP_DATABASE_URL remains unchanged.

Database:
- No new migration in v24. Uses the UserPermission model/migration introduced in v23.
