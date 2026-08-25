# DMS UI v11

This release completes the role-based UI layer before authentication is wired to real users.

## Included interfaces
- Admin: live management dashboard + existing operations
- Manager: overview, supervisors, RSO monitoring
- Supervisor: own team, RSOs, retailers
- Accounts: data-management dashboard, operations workspace, RSO/BP views
- RSO: mobile-first performance, retailers, BP
- BP: simplified GA progress and sales view
- Login: team mobile+PIN and Admin tabs
- Role Preview: `/ui-preview` for reviewing all six experiences

## Important
The Admin dashboard and existing import/report modules remain connected to current APIs/database logic. The new non-Admin role screens are UI-ready previews with representative content until role authentication and user-to-employee/BP assignment are implemented.

No database migration is included in this UI-only release.
