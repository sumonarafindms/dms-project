# Update workflow — unzip → validate → push

Standing process for applying a delivered project zip and pushing it to GitHub.
All commands are **PowerShell** (the VS Code integrated terminal on Windows).

Repo: `sumonarafindms/dms-project` · branch `main` · remote `origin`

> ⚠️ **Do not paste all the steps into the terminal at once.** PowerShell runs
> each line independently and **keeps going after a failure**. If the unzip step
> fails and the rest still runs, you end up with a half-updated project and
> confusing build errors. Use the guarded script in Step 2, which stops on the
> first real problem.

---

## Step 1 — save your current work first (safety net)

```powershell
cd "C:\Users\Sumon\Pictures\DMS Project"
git status
```

If it shows local changes you want to keep:

```powershell
git stash push -u -m "my local work before update"
```

If it only shows changes the new zip replaces anyway, skip this.

---

## Step 2 — apply the update (guarded — run as one block)

Set `$zip` to wherever you actually saved the delivered file, then run the whole
block. It **verifies the zip exists before deleting anything**, so a wrong path
can no longer leave the project broken.

```powershell
$zip     = "$HOME\Downloads\DMS-Project.zip"
$project = "C:\Users\Sumon\Pictures\DMS Project"

if (-not (Test-Path $zip)) { Write-Error "Zip not found at: $zip  — fix the path and re-run."; return }

Set-Location $project
Remove-Item -Recurse -Force .\styles -ErrorAction SilentlyContinue
Expand-Archive -Path $zip -DestinationPath $project -Force
if (-not (Test-Path .\styles\tokens.css)) { Write-Error "Extract failed — styles\tokens.css missing. Stop and report this."; return }
Write-Host "Update applied." -ForegroundColor Green
```

**Can't find the zip?** Search for it:

```powershell
Get-ChildItem -Path $HOME -Filter "DMS-Project*.zip" -Recurse -ErrorAction SilentlyContinue |
  Select-Object FullName, LastWriteTime, Length | Sort-Object LastWriteTime -Descending
```

**Why `styles` is deleted first:** unzipping only _adds and overwrites_ — it
never deletes. The redesign removed 27 old CSS files; without this they stay on
disk and get committed. The zip contains the complete new `styles\`, so it is
restored immediately. The guard above makes the delete safe.

**What is never touched:** your `.git` folder (history and remote stay intact),
and your `.env`, `.env.local`, and `notepad.env`. The zip contains no `.git` and
no real env files — only `.env.example`. Your database credentials survive every
update.

---

## Step 3 — install dependencies

```powershell
npm install
```

**Never skip this.** It is one line and it is not optional, because skipping it
does not produce an error — it produces a _wrong pass_.

A version that changes `package.json` leaves your `node_modules` holding the old
packages. Everything still runs; `npm run build` still says "Compiled
successfully"; and what you push is built against dependencies the project no
longer asks for. v174 moved `xlsx` to a patched copy vendored in the repo, so a
run without this step compiles happily against the **vulnerable** one.

This has already cost a pre-deploy check once, so `npm test` now says so in
plain words when it happens:

```
node_modules is STALE — package.json asks for file:vendor/xlsx-0.20.3.tgz
and that file is there, but the loaded copy is 0.18.5. Run `npm install`.
```

If you see that, the fix is this step. Nothing is wrong with the code.

---

## Step 4 — validate

Run these **one at a time**. All four must pass before you push.

```powershell
npm run lint
npm run format:check
npm test
npm run build
```

| Command        | Expected                                                |
| -------------- | ------------------------------------------------------- |
| `lint`         | `0 errors` (warnings are pre-existing debt, not a stop) |
| `format:check` | `All matched files use Prettier code style!`            |
| `test`         | `0 failed` — every test file passes                     |
| `build`        | `✓ Compiled successfully`                               |

**Read `0 failed`, not a total.** This table used to name an exact count and it
was wrong for fifty versions — it still said `47 passed` when the suite had
grown past eight hundred. A number that has to be edited by hand every release
is a number that will be stale, and a stale expectation trains you to ignore the
one line that matters. The delivery note for each version says how many tests it
added; the only thing to check here is that none failed.

The suite is slower on Windows than the figures in any release note: NTFS and a
virus scanner make every module read cost something, so `collect` can take a
minute where it takes seconds elsewhere. That is normal and not a failure.

**Reading failures:** an error naming a _missing file_ (`Can't resolve
'../styles/tokens.css'`, `No files matching the pattern`) almost always means
Step 2 didn't complete — re-run it before debugging anything else. Errors about
_code_ are real; send me the output.

---

## Step 5 — look at the actual UI

Automated checks cannot tell you whether a page _looks_ right.

```powershell
npm run dev
```

Open http://localhost:3000, log in, click through the roles you use — Dashboard,
GA / C2C / C2S / OB, Employees, and one RSO / Supervisor / Manager page. After
the C2C/C2S aggregation rewrite, confirm those **totals match what they showed
before**. `Ctrl+C` to stop.

---

## Step 6 — check what you're about to commit

```powershell
git status --short
```

You should see the 27 old CSS files as deleted (`D styles/...`). That's correct.

Then confirm no secret is tracked — this must return **nothing**:

```powershell
git ls-files | Select-String -Pattern "notepad.env|^\.env$|\.env\.local"
```

If it returns a filename, that credential is in your Git history. Rotate the
database password before pushing.

---

## Step 7 — commit and push

```powershell
git add -A
git commit -m "describe what this update actually was"
git push origin main
```

---

## Notes

- **`npm run build` uses `next build --turbopack`.** Don't change it back to
  plain `next build` — Next's default CSS minifier crashes on Tailwind v4's
  output. See `styles/README.md`.
- **Never run `npm audit fix --force`.** 7 known high-severity advisories need
  reviewing one at a time, not a forced upgrade that can break the build.
- **Migrations don't run during build.** Schema changes stay a separate,
  deliberate step (`npm run db:deploy`).
- If Vercel is connected to this repo, pushing to `main` deploys — validate
  locally first.
