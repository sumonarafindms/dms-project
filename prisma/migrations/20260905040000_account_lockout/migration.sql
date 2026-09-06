-- Account lockout: five consecutive failed sign-ins lock the login until an
-- administrator clears it. There is no timer by design — a locked account is
-- meant to be looked at by a person.
--
-- Written by hand with IF NOT EXISTS so it is safe to re-apply, per the
-- project's migration convention (see SECURITY.md).
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3);

-- The admin screen lists locked accounts first; without this it is a full scan
-- of every login on every page load.
CREATE INDEX IF NOT EXISTS "User_lockedAt_idx" ON "User" ("lockedAt");
