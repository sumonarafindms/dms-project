# DMS v23 Admin Granular Permissions

Implemented:
- Admin Permissions page for every non-Admin login.
- Per-user permissions for Dashboard, Performance, Attention, Employees, Retailers, Targets/SC, GA, C2C, C2S, Opening Balance and BP/SIM Sales.
- Four actions per module: View, Add, Edit, Update.
- Role defaults are preserved until Admin saves a custom permission set.
- Reset to Role Default option.
- Admin always retains full access.
- Upload write APIs now enforce Add permission for GA/C2C/C2S/OB.
- Master imports enforce Add permission.
- Permissions shortcut added to Employees and Admin sidebar.
- Existing employee hierarchy remains intact.
- APP_DATABASE_URL remains unchanged.

Database:
- New UserPermission model.
- Migration: 20260825223000_user_permissions.

Important:
- This phase establishes the permission database, Admin UI, defaults, and server enforcement for upload/master-write operations.
- Existing role-specific page routing remains intact. More page-by-page visibility enforcement can be layered on later without changing the permission model.
