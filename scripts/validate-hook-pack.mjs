#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

const fail = (message) => {
  console.error(`[validate-hook-pack] ERROR: ${message}`);
  process.exit(1);
};

const ok = (message) => {
  console.log(`[validate-hook-pack] OK: ${message}`);
};

function checkFile(path, label) {
  if (!existsSync(path)) {
    fail(`${label} not found: ${path}`);
  }
}

const packagePath = resolve(repoRoot, "package.json");
checkFile(packagePath, "package.json");
const pkg = JSON.parse(readFileSync(packagePath, "utf-8"));

if (!pkg.openclaw || !Array.isArray(pkg.openclaw.hooks) || pkg.openclaw.hooks.length === 0) {
  fail("package.json must define openclaw.hooks with at least one hook path");
}

for (const hookRelPath of pkg.openclaw.hooks) {
  const hookDir = resolve(repoRoot, hookRelPath);
  const hookMdPath = resolve(hookDir, "HOOK.md");
  const handlerTsPath = resolve(hookDir, "handler.ts");
  checkFile(hookMdPath, "HOOK.md");
  checkFile(handlerTsPath, "handler.ts");

  const hookMd = readFileSync(hookMdPath, "utf-8");
  const fmMatch = hookMd.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    fail(`HOOK.md at ${hookMdPath} is missing YAML frontmatter`);
  }

  const fm = fmMatch[1];
  if (!/^name:\s+\S+/m.test(fm)) {
    fail(`HOOK.md at ${hookMdPath} frontmatter missing "name"`);
  }
  if (!/^description:\s+.+/m.test(fm)) {
    fail(`HOOK.md at ${hookMdPath} frontmatter missing "description"`);
  }
  if (!/^metadata:\s*$/m.test(fm) || !/^\s+openclaw:\s*$/m.test(fm)) {
    fail(`HOOK.md at ${hookMdPath} must include metadata.openclaw section`);
  }
  if (!/^\s+events:\s*$/m.test(fm)) {
    fail(`HOOK.md at ${hookMdPath} must define metadata.openclaw.events`);
  }
  if (!/^\s+-\s+"?command:new"?\s*$/m.test(fm)) {
    fail(`HOOK.md at ${hookMdPath} should include command:new in events`);
  }
}

ok("Hook structure and metadata are valid");
