import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const standalone = resolve(root, ".next-build/standalone");
await mkdir(resolve(standalone, ".next"), { recursive: true });
await cp(resolve(root, ".next-build/static"), resolve(standalone, ".next/static"), { recursive: true });
await cp(resolve(root, "public"), resolve(standalone, "public"), { recursive: true });
