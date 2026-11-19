// Load Next.js-compatible .env files for Node workers and the local stack.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- This .cjs entrypoint must remain CommonJS for Node preload.
require("@next/env").loadEnvConfig(process.cwd());
