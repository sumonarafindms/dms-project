# DMS v26.1 Build Fix

Fixed:
- GA page JSX syntax error introduced by the permission-based upload visibility wrapper.
- The Add-permission condition now hides only the GA upload panel.
- Selected-day GA data and monthly GA performance remain visible when View permission exists.
- C2C, C2S and OB upload wrappers were checked and retained.

No database/schema changes from v26.
The v26 AuditLog migration remains included.
