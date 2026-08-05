/**
 * Copies the unrar wasm binary out of node_modules and into `public/`.
 *
 * The decoder worker fetches it from `/unrar.wasm` at runtime, so it has to be
 * a served asset rather than a bundled import. Running this on `postinstall`
 * keeps the copy in step with whatever version of node-unrar-js is installed.
 */
import { copyFile, mkdir, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const source = join(
  dirname(require.resolve("node-unrar-js/package.json")),
  "dist",
  "js",
  "unrar.wasm",
);
const target = join(root, "public", "unrar.wasm");

try {
  await stat(source);
} catch {
  console.error(`[sync-unrar-wasm] not found: ${source}`);
  process.exit(1);
}

await mkdir(join(root, "public"), { recursive: true });
await copyFile(source, target);
console.log("[sync-unrar-wasm] public/unrar.wasm is up to date");
