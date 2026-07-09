#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const REQUIRED_PATHS = [
  "README.md",
  "GETTING_STARTED.md",
  "AI_ONBOARDING.md",
  "PRIVACY.md",
  "AGENTS.md",
  "package.json",
  "Start Onboarding.command",
  "Start Onboarding.bat",
  "System/Templates/Job Application.md",
  "System/Templates/Company.md",
  "System/Templates/Person.md",
  "System/Templates/Listening Tour Conversation.md",
  "System/Templates/Weekly Job Search Review.md",
  "System/Templates/Role History.md",
  "System/Bases/Applications.base",
  "System/Bases/Companies.base",
  "System/Bases/Conversations.base",
  "System/Prompts/Job Posting Intake.md",
  "System/Prompts/Job Fit Scoring.md",
  "System/Prompts/Conversation Debrief.md",
  "System/Prompts/Weekly Review.md",
  "System/Workflows/Job Search Operating Loop.md",
  "System/Workflows/Property Options.md",
  "System/Workflows/AI Guardrails.md"
];

const GENERATED_REQUIRED_PATHS = [
  "01 Start Here/Start Here.md",
  "02 Projects/Job Search.md",
  "06 Synthesis/Career/Canonical Resume.md",
  "06 Synthesis/Career/Resume Evidence Bank.md",
  "06 Synthesis/Career/Candidate-Market Fit.md",
  "06 Synthesis/Career/Job Search Strategy.md"
];

const PRIVATE_STRINGS = [
  "/Users/" + "bmu",
  "Bry" + "ston",
  "Ul" + "rich",
  "Mar" + "riott",
  "Ni" + "ke",
  "JSC" + "-5901",
  "Kat" + "ie"
];

const VAULT_REQUIRED_PATHS = [
  "01 Start Here/Start Here.md",
  "02 Projects/Job Search.md"
];

const MODES = ["starter", "vault"];

function parseArgs(argv) {
  const rootIndex = argv.indexOf("--root");
  const root = rootIndex === -1 ? process.cwd() : path.resolve(argv[rootIndex + 1]);
  const modeIndex = argv.indexOf("--mode");
  const mode = modeIndex === -1 ? "starter" : argv[modeIndex + 1];
  if (!MODES.includes(mode)) {
    throw new Error(`Unknown --mode "${mode}". Expected one of: ${MODES.join(", ")}.`);
  }
  return { root, mode };
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (["node_modules", ".git", "Private"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else files.push(full);
  }
  return files;
}

async function checkGeneratedPaths(root) {
  for (const generatedPath of GENERATED_REQUIRED_PATHS) {
    const target = path.join(root, generatedPath);
    if (await exists(target)) {
      const text = await fs.readFile(target, "utf8");
      requireFrontmatter(generatedPath, text);
      if (!text.includes("review_needed: true")) {
        throw new Error(`${generatedPath} must be review-gated.`);
      }
    }
  }
}

async function main() {
  const { root, mode } = parseArgs(process.argv.slice(2));

  if (mode === "vault") {
    for (const requiredPath of VAULT_REQUIRED_PATHS) {
      const target = path.join(root, requiredPath);
      if (!(await exists(target))) throw new Error(`Missing required vault path: ${requiredPath}`);
    }

    await checkGeneratedPaths(root);

    console.log("Vault validation passed.");
    return;
  }

  for (const requiredPath of REQUIRED_PATHS) {
    const target = path.join(root, requiredPath);
    if (!(await exists(target))) throw new Error(`Missing required starter path: ${requiredPath}`);
  }

  await checkGeneratedPaths(root);

  const files = await walk(root);
  for (const file of files) {
    const relative = path.relative(root, file);
    const text = await fs.readFile(file, "utf8");
    if (relative.startsWith(`examples${path.sep}fictional-demo${path.sep}`)) continue;
    for (const privateString of PRIVATE_STRINGS) {
      if (text.includes(privateString)) {
        throw new Error(`${relative} contains private string: ${privateString}`);
      }
    }
  }

  console.log("Starter validation passed.");
}

function requireFrontmatter(file, text) {
  if (!text.startsWith("---\n")) throw new Error(`${file} is missing frontmatter.`);
  const close = text.indexOf("\n---", 4);
  if (close === -1) throw new Error(`${file} has unclosed frontmatter.`);
}

main().catch((error) => {
  console.error(`Validation failed: ${error.message}`);
  process.exitCode = 1;
});
