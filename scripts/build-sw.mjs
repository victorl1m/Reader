/**
 * Generates `public/sw.js` from `scripts/sw.template.js`, stamping in a build
 * ID and the list of static assets to precache.
 *
 * Runs twice: once before the build so a working worker always exists, and
 * again afterwards, when `.next/static` can be read and the real asset list is
 * known. The second pass is what makes the reader work offline immediately
 * after install, since the decoder's worker chunk would otherwise only be
 * cached the first time someone opened a comic.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = join(root, "scripts", "sw.template.js");
const outPath = join(root, "public", "sw.js");
const staticDir = join(root, ".next", "static");

function buildId(template) {
  // Prefer the commit being deployed, so identical source produces an
  // identical worker and redeploys don't needlessly bust caches.
  const fromEnv =
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.GITHUB_SHA ??
    process.env.CF_PAGES_COMMIT_SHA;
  if (fromEnv) return fromEnv.slice(0, 12);

  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    // Not a git checkout: fall back to hashing the worker itself, which at
    // least changes whenever the caching logic does.
    return createHash("sha256").update(template).digest("hex").slice(0, 12);
  }
}

/** Every `.js` and `.css` file under `.next/static`, as a served URL path. */
async function collectAssets(dir = staticDir, prefix = "/_next/static") {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    // Pre-build pass: nothing to read yet.
    return [];
  }

  const found = [];
  for (const entry of entries) {
    const url = posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await collectAssets(join(dir, entry.name), url)));
    } else if (/\.(js|css)$/.test(entry.name)) {
      found.push(url);
    }
  }
  return found;
}

const template = await readFile(templatePath, "utf8");

for (const token of ["__BUILD_ID__", "__PRECACHE_ASSETS__"]) {
  if (!template.includes(token)) {
    console.error(`[build-sw] template is missing the ${token} placeholder`);
    process.exit(1);
  }
}

const id = buildId(template);
const assets = (await collectAssets()).sort();

await mkdir(join(root, "public"), { recursive: true });
await writeFile(
  outPath,
  `// Generated from scripts/sw.template.js — do not edit.\n${template
    .replaceAll("__BUILD_ID__", id)
    .replace("__PRECACHE_ASSETS__", JSON.stringify(assets))}`,
  "utf8",
);

console.log(
  `[build-sw] public/sw.js written with build id ${id} and ${assets.length} precached assets`,
);
