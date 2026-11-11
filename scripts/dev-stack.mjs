import { spawn } from "node:child_process";
const services = [
  { name: "web", args: ["node_modules/next/dist/bin/next", "dev", "--webpack"] },
  { name: "events", args: ["--import=tsx", "--watch", "mini-services/trade-events/index.ts"] },
  { name: "worker", args: ["--import=tsx", "--watch", "mini-services/copy-worker/index.ts"] },
];

const children = services.map(({ name, args }) => {
  const child = spawn(process.execPath, args, { stdio: "inherit", env: process.env });
  child.on("error", (error) => {
    console.error(`[dev:stack] ${name} could not start:`, error.message);
    shutdown(1);
  });
  child.on("exit", (code) => {
    if (!stopping) shutdown(code ?? 1);
  });
  return child;
});

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
  }
  process.exitCode = code;
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
