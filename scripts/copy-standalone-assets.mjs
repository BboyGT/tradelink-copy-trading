import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const standalone = resolve(root, ".next-build/standalone");
const standaloneBuild = resolve(standalone, ".next-build");
await mkdir(resolve(standaloneBuild, "static"), { recursive: true });
await cp(resolve(root, ".next-build/static"), resolve(standaloneBuild, "static"), { recursive: true });
await cp(resolve(root, "public"), resolve(standalone, "public"), { recursive: true });
