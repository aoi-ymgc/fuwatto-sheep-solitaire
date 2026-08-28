import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const output = resolve(root, "public");
const entries = ["index.html", "css", "js", "games", "assets"];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const entry of entries) {
  await cp(resolve(root, entry), resolve(output, entry), { recursive: true });
}
console.log(`Static assets built: ${output}`);
