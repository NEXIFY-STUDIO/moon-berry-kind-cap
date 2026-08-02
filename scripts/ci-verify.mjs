#!/usr/bin/env node
/**
 * Local CI gate: typecheck → unit tests → build.
 * Exit 0 only if all green. Optional: post GitHub commit status if GH_TOKEN/gh available.
 */
import { spawnSync } from "node:child_process";
import { execSync } from "node:child_process";

function run(cmd, args) {
  console.log(`\n▶ ${cmd} ${args.join(" ")}\n`);
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (r.status !== 0) {
    console.error(`\n✖ failed: ${cmd} ${args.join(" ")} (exit ${r.status})\n`);
    process.exit(r.status || 1);
  }
}

run("npm", ["run", "typecheck"]);
run("npm", ["run", "test:unit"]);
run("npm", ["run", "build"]);

console.log("\n✔ local CI green: typecheck · unit · build\n");

// Best-effort commit status (needs gh auth)
try {
  const sha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const remote = execSync("git remote get-url origin", { encoding: "utf8" }).trim();
  const m = remote.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
  if (m) {
    const repo = `${m[1]}/${m[2]}`;
    execSync(
      `gh api -X POST repos/${repo}/statuses/${sha} -f state=success -f context=ci/local-quality -f description="typecheck · unit · build OK"`,
      { stdio: "inherit" },
    );
  }
} catch {
  /* optional */
}
