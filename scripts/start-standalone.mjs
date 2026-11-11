import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
require("@next/env").loadEnvConfig(root);

// Prisma CLI paths are relative to prisma/schema.prisma. Resolve SQLite URLs
// before starting Next's standalone server, whose runtime directory differs.
const url = process.env.DATABASE_URL;
if (url?.startsWith("file:")) {
  const [databasePath, ...query] = url.slice(5).split("?");
  if (databasePath && !isAbsolute(databasePath)) {
    const absolutePath = resolve(root, "prisma", databasePath);
    const portablePath = sep === "\\" ? absolutePath.replaceAll("\\", "/") : absolutePath;
    process.env.DATABASE_URL = `file:${portablePath}${query.length ? `?${query.join("?")}` : ""}`;
  }
}

const serverPath = resolve(root, ".next-build", "standalone", "server.js");
const child = spawn(process.execPath, [serverPath], { cwd: root, env: process.env, stdio: "inherit" });
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
