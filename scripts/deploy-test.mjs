// Publish the current working tree to the herm.cool test channel at
// https://herm.cool/games/packs/test — the live game at /games/packs is not
// touched. Requires a sibling checkout of the herm.cool repo.
//
//   npm run deploy:test            build + copy into ../herm.cool/games-test/packs
//   npm run deploy:test -- --push  also commit and push herm.cool (auto-deploys)

import { cp, mkdir, rm, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve as resolvePath } from "node:path";

const portalRoot = resolvePath(process.env.HERM_COOL_DIR || "../herm.cool");
const target = resolvePath(portalRoot, "games-test/packs");
const push = process.argv.includes("--push");

function run(command, args, cwd) {
  return new Promise((done, reject) => {
    const child = spawn(command, args, { stdio: "inherit", cwd, shell: process.platform === "win32" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? done() : reject(new Error(`${command} ${args.join(" ")} exited with ${code}`)));
  });
}

try {
  await access(portalRoot);
} catch {
  console.error(`herm.cool checkout not found at ${portalRoot} — set HERM_COOL_DIR or clone it next to this repo.`);
  process.exit(1);
}

await run(process.execPath, [resolvePath("scripts/build-test.mjs")]);
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp("dist-test", target, { recursive: true });
console.log(`Copied dist-test/ to ${target}`);

if (push) {
  await run("git", ["add", "games-test/packs"], portalRoot);
  await run("git", ["commit", "-m", "Update PACKWORKS test channel"], portalRoot);
  await run("git", ["push"], portalRoot);
  console.log("Pushed herm.cool — the portal deploy workflow will publish /games/packs/test shortly.");
} else {
  console.log("Review the copy, then commit and push herm.cool to publish the test channel.");
}
