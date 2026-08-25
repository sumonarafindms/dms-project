# DMS v26 Admin Activity / Audit History

Implemented:
- New AuditLog database model and migration.
- Admin Activity Log page under Management.
- Search by actor, target, detail or action.
- Filter by module and action.
- Dashboard counters for total events, today's events and successful logins.
- Successful login events are recorded.
- Admin login-account creation, activation/deactivation and PIN reset are recorded.
- Individual permission changes and resets are recorded.
- Bulk permission presets and permission-copy actions are recorded.
- GA, C2C, C2S and OB imports are recorded.
- Target updates are recorded.
- Audit failures never break the main business operation.
- Existing v24 hidden-permission behavior and v25 presets remain unchanged.
- APP_DATABASE_URL remains unchanged.

Database:
- Migration: 20260825224000_audit_logs.
