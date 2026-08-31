/**
 * Generate the home-screen PNGs from app/icon.svg.
 *
 * Run with `npm run icons` after editing the mark. The SVG is the source; every
 * PNG here is derived, so nothing has to be redrawn to change a colour.
 *
 * `sharp` is not a declared dependency: it arrives with Next.js, which uses it
 * for image optimisation, and it is in the lockfile for that reason. This script
 * is a one-off developer tool, not part of the build — nothing in `npm run
 * build` touches it, and the PNGs it produces are committed. If a future Next
 * release drops sharp, install it as a devDependency rather than making the
 * build depend on this.
 *
 * Two shapes, because Android needs both:
 *
 *   - `icon-<n>.png` — the mark as drawn, used where the launcher shows the
 *     icon as-is.
 *   - `maskable-<n>.png` — the same mark inset to 80% on a solid ground, so a
 *     launcher may crop it to a circle, a squircle or a rounded square without
 *     cutting into the artwork. Android's safe zone is the middle 80%; a
 *     maskable icon that ignores it gets its edges shaved off, which is why the
 *     rounded corners are filled in here rather than left transparent.
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const SRC = path.join(ROOT, "app", "icon.svg");
const OUT = path.join(ROOT, "public", "icons");
const GROUND = "#0d9488"; // --color-teal-600

const SIZES = [192, 512];

fs.mkdirSync(OUT, { recursive: true });
const svg = fs.readFileSync(SRC);

for (const size of SIZES) {
  await sharp(svg, { density: 512 })
    .resize(size, size)
    .png()
    .toFile(path.join(OUT, `icon-${size}.png`));

  // 80% safe zone: the artwork occupies the middle 80%, the rest is ground the
  // launcher is free to crop.
  const inner = Math.round(size * 0.8);
  const pad = Math.round((size - inner) / 2);
  const art = await sharp(svg, { density: 512 }).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: GROUND } })
    .composite([{ input: art, top: pad, left: pad }])
    .png()
    .toFile(path.join(OUT, `maskable-${size}.png`));
}

// Apple ignores the manifest and reads <link rel="apple-touch-icon">, which it
// puts on a white-ish home screen with its own rounded mask — so this one is
// flattened onto the brand ground rather than left transparent.
await sharp(svg, { density: 512 })
  .resize(180, 180)
  .flatten({ background: GROUND })
  .png()
  .toFile(path.join(OUT, "apple-touch-icon.png"));

console.log("icons written to public/icons:", fs.readdirSync(OUT).join(", "));
