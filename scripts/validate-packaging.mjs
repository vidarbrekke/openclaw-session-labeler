#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

const fail = (message) => {
  console.error(`[validate-packaging] ERROR: ${message}`);
  process.exit(1);
};

const ok = (message) => {
  console.log(`[validate-packaging] OK: ${message}`);
};

const pack = spawnSync("npm", ["pack", "--dry-run", "--json"], {
  cwd: repoRoot,
  encoding: "utf-8",
});

if (pack.status !== 0) {
  fail(`npm pack --dry-run failed:\n${pack.stderr || pack.stdout}`);
}

let packInfo;
try {
  packInfo = JSON.parse(pack.stdout);
} catch {
  fail(`Could not parse npm pack output as JSON:\n${pack.stdout}`);
}

const files = (packInfo?.[0]?.files ?? []).map((f) => f.path);
if (files.length === 0) {
  fail("Package would contain zero files");
}

const forbiddenPatterns = [
  "node_modules/",
  ".git/",
  "coverage/",
  ".cursor/",
  ".DS_Store",
];

for (const file of files) {
  for (const forbidden of forbiddenPatterns) {
    if (file.includes(forbidden)) {
      fail(`Forbidden path in package: ${file}`);
    }
  }
}

const required = [
  "package.json",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "hooks/session-labeler/HOOK.md",
  "hooks/session-labeler/handler.ts",
];

for (const file of required) {
  if (!files.includes(file)) {
    fail(`Required file missing from package: ${file}`);
  }
}

ok(`Packaging manifest looks good (${files.length} files)`);
