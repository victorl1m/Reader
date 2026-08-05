/**
 * Generates `public/sw.js` from `scripts/sw.template.js`, stamping a build ID
 * into the cache names.
 *
 * Without this the shell cache key is a hand-edited constant, which means a
 * deploy can leave users on the previous build indefinitely.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = join(root, "scripts", "sw.template.js");
const outPath = join(root, "public", "sw.js");

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

const template = await readFile(templatePath, "utf8");
const id = buildId(template);

if (!template.includes("__BUILD_ID__")) {
  console.error("[build-sw] template is missing the __BUILD_ID__ placeholder");
  process.exit(1);
}

await mkdir(join(root, "public"), { recursive: true });
await writeFile(
  outPath,
  `// Generated from scripts/sw.template.js — do not edit.\n${template.replaceAll(
    "__BUILD_ID__",
    id,
  )}`,
  "utf8",
);

console.log(`[build-sw] public/sw.js written with build id ${id}`);
