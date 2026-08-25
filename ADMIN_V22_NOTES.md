# DMS v22 Admin Employees Management

Implemented:
- Dedicated Admin Employees hub.
- Manager list, create, edit, active/inactive and PIN reset.
- Explicit Manager -> Supervisor assignment with new ManagerSupervisor relation.
- Supervisor list, create, edit, login/PIN management and multi-RSO assignment.
- RSO list, create, edit, Supervisor selection, login/PIN management and active/inactive.
- BP list, create/edit, RSO + retailer-code assignment, GA target, login/PIN management.
- Existing BP code-change behavior remains compatible with dynamic retailer assignments.
- Existing user-role interfaces are unchanged.
- APP_DATABASE_URL remains the Prisma datasource.

Database:
- Includes migration 20260825222000_manager_supervisor_assignments.
- Vercel/prisma migrate deploy should apply it automatically.

Not yet included:
- Granular per-module View/Add/Edit/Update permission matrix. That is the next Admin phase.
