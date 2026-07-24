import { cp, mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve as resolvePath } from "node:path";

await new Promise((done, reject) => {
  const child = spawn(process.execPath, [resolvePath("node_modules/next/dist/bin/next"), "build"], {
    stdio: "inherit",
    env: { ...process.env, PACKWORKS_PORTAL_BUILD: "1" },
  });
  child.on("error", reject);
  child.on("exit", (code) => code === 0 ? done() : reject(new Error(`Next build exited with ${code}`)));
});

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("out", "dist", { recursive: true });
console.log("Built PACKWORKS portal bundle in dist/");
