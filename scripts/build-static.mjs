import { cp, mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve as resolvePath } from "node:path";

await new Promise((done, reject) => {
  const child = spawn(process.execPath, [resolvePath("node_modules/next/dist/bin/next"), "build"], {
    stdio: "inherit",
    env: { ...process.env, PACKWORKS_STATIC_BUILD: "1" },
  });
  child.on("error", reject);
  child.on("exit", (code) => code === 0 ? done() : reject(new Error(`Next build exited with ${code}`)));
});

await rm("dist", { recursive: true, force: true });
await mkdir("dist/assets", { recursive: true });
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
await cp("out", "dist/assets", { recursive: true });
await cp("worker/index.js", "dist/server/index.js");
await cp(".openai/hosting.json", "dist/.openai/hosting.json");
console.log("Built PACKWORKS Sites artifact in dist/");
