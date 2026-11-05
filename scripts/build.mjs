import { spawnSync } from "node:child_process";
const environment = process.argv[2];
if (!["development", "qa", "production"].includes(environment))
  throw new Error("Ambiente inválido.");
const result = spawnSync(
  process.execPath,
  ["node_modules/astro/bin/astro.mjs", "build"],
  {
    env: { ...process.env, SITE_ENV: environment },
    stdio: "inherit",
  }
);
process.exitCode = result.status ?? 1;
