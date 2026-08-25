# DMS v12 Authentication & Role Data

## What changed
- Real database-backed sessions. No extra AUTH_SECRET is required.
- PIN/password credentials are stored as salted scrypt hashes.
- First-time `/setup` creates the Admin account only when no user exists.
- `/login` supports Admin username/password and Team mobile/PIN login.
- Admin `/admin/users` creates Manager, Supervisor, Accounts, RSO and BP accounts.
- RSO login must be linked to an Employee; Supervisor login must be linked to a Supervisor.
- Manager, Supervisor and RSO dashboards now read live database data and are role filtered.
- Protected layouts prevent cross-role page access.

## Deployment
This release adds `User`, `Session`, and `UserRole`, so the included Prisma migration must deploy before the app build.
After deploy, open `/setup` once to create the first Admin account.
