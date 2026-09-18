/**
 * A form the browser might submit before React arrives must not be a GET.
 *
 * ## The bug
 *
 * `<form className="auth-v54-card" onSubmit={submit}>` — both login pages, and
 * nine other forms besides. No `method`, so the HTML default applies, and the
 * HTML default is **GET to the current URL with every named field in the query
 * string**. The page relies on `onSubmit` calling `preventDefault()`, which is
 * true only once React has hydrated the page.
 *
 * Before that it is ordinary HTML, and submitting it did this:
 *
 *     /login?identifier=01700000001&credential=<the PIN>
 *
 * A URL is the one place a secret must never be. It is in the address bar, in
 * browser history, in the server's access log, in the Referer header of the
 * next request, and in whatever a shared phone's browser syncs.
 *
 * ## It is not a theoretical window
 *
 * Measured against a real production build, filling the form and clicking
 * "Sign in" after a fixed delay, under Chrome's own network profiles:
 *
 *     no throttling   safe at every delay
 *     fast 3G         leaked at 0ms, 250ms, 500ms   · safe from 1000ms
 *     slow 3G         leaked through 3500ms         · safe from 4000ms
 *
 * Seconds, on the networks this app is actually used on, with the button
 * visible and enabled the whole time — and it is the first screen every user
 * meets every morning, the one most likely to be loaded cold.
 *
 * ## The fix, and why it is only one word
 *
 * `method="post"`. A POST puts the fields in a request body that nothing
 * records, and Next.js renders the page again with a clean URL — verified: a
 * POST to `/login` returns 200 and the login page, not an error. Disabling the
 * button until hydration was considered and rejected: it makes the form
 * silently dead for those same 3.5 seconds, which is worse for the user than a
 * reload, and `e2e/public.spec.ts` rightly requires that button to be enabled.
 *
 * The rule is stated for every form rather than for the two that leak a
 * credential, because a form whose submit is handled in JavaScript has no
 * business falling back to a GET: the fallback is never what was meant.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { rel } from "./paths";

const ROOT = path.join(__dirname, "..");
const relative = rel(ROOT);

/**
 * Comments out, everything else left exactly where it was.
 *
 * This guard's own explanation contains the words `<form>`, and the first run
 * of it duly reported `app/login/page.tsx` as an unfixed GET form — it had
 * found the `<form>` inside the JSX comment that documents the fix. Block
 * comments are blanked rather than removed so every line number below still
 * points at the real line in the real file.
 */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/^(\s*)\/\/.*$/gm, (_m, indent) => indent);

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) tsxFiles(full, out);
    else if (e.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

type FormTag = { file: string; line: number; tag: string };

/**
 * Every `<form …>` opening tag under `app/`.
 *
 * The scanner tracks brace depth rather than stopping at the first `>`,
 * because `onSubmit={(e) => submit(e)}` contains one and a naive scan would
 * cut the tag in half and then find no `method` in either piece — a guard that
 * passes by misreading is the failure mode this suite keeps finding.
 */
function formTags(): FormTag[] {
  const found: FormTag[] = [];
  for (const file of tsxFiles(path.join(ROOT, "app"))) {
    const src = stripComments(fs.readFileSync(file, "utf8"));
    let at = src.indexOf("<form");
    while (at >= 0) {
      let depth = 0,
        end = at;
      for (let i = at; i < src.length; i++) {
        const c = src[i];
        if (c === "{") depth++;
        else if (c === "}") depth--;
        else if (c === ">" && depth === 0) {
          end = i;
          break;
        }
      }
      found.push({
        file: relative(file),
        line: src.slice(0, at).split("\n").length,
        tag: src.slice(at, end + 1),
      });
      at = src.indexOf("<form", end + 1);
    }
  }
  return found;
}

/**
 * The forms that are deliberately a GET, each with the reason.
 *
 * A GET form is right when the submission IS a URL — a filter whose result
 * should be linkable, bookmarkable and reloadable. Neither of these carries a
 * secret and neither handles its own submit.
 */
const DELIBERATE_GET: Record<string, string> = {
  "app/components/ListControls.tsx":
    "the date-range filter: its submission is a URL by design, so the chosen range can be linked and reloaded",
  "app/components/LiveFilterForm.tsx":
    "the live filter bar: it navigates on input change, and the query string IS the filter state",
};

describe("a form's fallback behaviour is not a leak", () => {
  const forms = formTags();

  it("is reading real form tags", () => {
    // A scanner that matched nothing would pass every assertion below it.
    expect(forms.length, "no <form> tags found under app/ — has the scanner broken?").toBeGreaterThanOrEqual(10);
    expect(
      forms.filter((f) => f.tag.includes("onSubmit")).length,
      "no JS-handled forms found — the scanner is cutting tags short",
    ).toBeGreaterThanOrEqual(10);
    // And it must still see the ones left as GET, or the exemption list below
    // would be checking nothing.
    expect(forms.some((f) => DELIBERATE_GET[f.file])).toBe(true);
  });

  it("never lets a JS-handled form fall back to a GET", () => {
    const bad = forms
      .filter((f) => f.tag.includes("onSubmit") && !/method="post"/.test(f.tag))
      .map((f) => `${f.file}:${f.line} handles its own submit and has no method="post"`);
    expect(bad, `a form whose fallback puts its fields in the URL:\n  ${bad.join("\n  ")}`).toEqual([]);
  });

  it("never lets a form near a password be a GET", () => {
    /*
     * Stronger than the rule above and stated separately, because this is the
     * one that turns a wart into a disclosure. Any FILE that renders a
     * password box has every one of its forms checked, handler or not.
     */
    const bad: string[] = [];
    for (const f of forms) {
      const src = fs.readFileSync(path.join(ROOT, f.file), "utf8");
      if (!src.includes('type="password"')) continue;
      if (!/method="post"/.test(f.tag))
        bad.push(`${f.file}:${f.line} sits in a file with a password field and is a GET`);
    }
    expect(bad, `a credential could reach the query string from:\n  ${bad.join("\n  ")}`).toEqual([]);
    // The sweep must have had something to look at.
    const credentialFiles = new Set(
      forms
        .filter((f) => fs.readFileSync(path.join(ROOT, f.file), "utf8").includes('type="password"'))
        .map((f) => f.file),
    );
    expect(credentialFiles.size, "no password forms found — the sweep is looking at nothing").toBeGreaterThanOrEqual(4);
    for (const must of ["app/login/page.tsx", "app/sacool/page.tsx"])
      expect(credentialFiles.has(must), `${must} is not among the password forms this guard checked`).toBe(true);
  });

  it("every deliberate GET is real, and is really a GET", () => {
    /*
     * The exemption list is how a regression could hide, so it is checked back
     * against the files: a name that no longer matches a form, or a form that
     * has since grown an `onSubmit`, fails here rather than quietly widening
     * the rule.
     */
    const stale: string[] = [];
    for (const file of Object.keys(DELIBERATE_GET)) {
      const its = forms.filter((f) => f.file === file);
      if (!its.length) stale.push(`${file} is listed as a deliberate GET and has no form`);
      for (const f of its)
        if (f.tag.includes("onSubmit"))
          stale.push(`${file}:${f.line} is listed as a deliberate GET and handles its own submit`);
    }
    expect(stale, stale.join("\n  ")).toEqual([]);
  });
});

describe("the login pages say why", () => {
  const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

  it("records what the default did, where the next reader will be", () => {
    /*
     * `method="post"` looks like a formatting detail and reads like one. The
     * comment beside it is what stops somebody tidying it away, so it is part
     * of the fix and checked like one.
     */
    const login = read("app/login/page.tsx");
    expect(login).toMatch(/credential=/);
    expect(login).toMatch(/3G/);
    expect(read("app/sacool/page.tsx")).toMatch(/method="post"/);
  });
});
