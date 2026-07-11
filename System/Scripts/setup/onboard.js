#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";
import { extractDocxText } from "./docx.js";

const execFileAsync = promisify(execFile);
const STARTER_ROOT = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const DEFAULT_VAULT_DIRNAME = "My Job Search Vault";

const SCAFFOLD_PATHS = [
  "System/Templates",
  "System/Prompts",
  "System/Bases",
  "System/Workflows",
  "System/Scripts",
  ".gitignore",
  "PRIVACY.md"
];

const ARTIFACT_TYPES = new Set([
  "resume",
  "cmf",
  "strategy",
  "networking",
  "target_companies",
  "applications",
  "conversation_notes",
  "other"
]);

const DEFAULT_OPTIONS = {
  name: "",
  output: process.cwd(),
  resumeFile: "",
  resumeText: "",
  artifacts: [],
  yes: false,
  storeSources: false,
  targetRoles: "",
  industries: "",
  location: "",
  dealBreakers: "",
  reviewDay: "",
  aiHelp: "",
  inPlace: false,
  keepRemote: false,
  versionControl: ""
};

const VERSION_CONTROL_MODES = new Set(["copy", "git", "backup"]);

function parseVersionControl(value) {
  const mode = (value || "").trim().toLowerCase();
  if (!VERSION_CONTROL_MODES.has(mode)) {
    throw new Error(`Unknown --version-control value "${value}". Use copy, git, or backup.`);
  }
  return mode;
}

function parseArgs(argv) {
  const options = { ...DEFAULT_OPTIONS, artifacts: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--yes" || arg === "-y") options.yes = true;
    else if (arg === "--store-sources") options.storeSources = true;
    else if (arg === "--in-place") options.inPlace = true;
    else if (arg === "--keep-remote") options.keepRemote = true;
    else if (arg === "--name") options.name = argv[++i] ?? "";
    else if (arg === "--output") options.output = argv[++i] ?? process.cwd();
    else if (arg === "--resume-file") options.resumeFile = argv[++i] ?? "";
    else if (arg === "--resume-text") options.resumeText = argv[++i] ?? "";
    else if (arg === "--target-roles") options.targetRoles = argv[++i] ?? "";
    else if (arg === "--industries") options.industries = argv[++i] ?? "";
    else if (arg === "--location") options.location = argv[++i] ?? "";
    else if (arg === "--deal-breakers") options.dealBreakers = argv[++i] ?? "";
    else if (arg === "--review-day") options.reviewDay = argv[++i] ?? "";
    else if (arg === "--ai-help") options.aiHelp = argv[++i] ?? "";
    else if (arg === "--version-control") options.versionControl = parseVersionControl(argv[++i] ?? "");
    else if (arg === "--artifact") options.artifacts.push(parseArtifactArg(argv[++i] ?? ""));
  }
  return options;
}

function parseArtifactArg(value) {
  const lastColon = value.lastIndexOf(":");
  if (lastColon === -1) return { file: value, type: "other" };
  const file = value.slice(0, lastColon);
  const type = value.slice(lastColon + 1);
  return { file, type: ARTIFACT_TYPES.has(type) ? type : "other" };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const interactive = !options.yes && input.isTTY;
  const rl = interactive ? readline.createInterface({ input, output }) : null;

  try {
    const answers = await collectInputs(options, rl);
    const model = buildModel(answers);
    await writeVault(model, answers);
    await maybeStoreSources(answers);
    if (await isStarterRoot(answers.output)) {
      await maybeRenameStarterRemote(answers);
    } else {
      await exportVaultScaffold(STARTER_ROOT, answers.output);
      await initVaultGit(answers);
    }
    printSummary(answers.output, model);
  } finally {
    rl?.close();
  }
}

async function collectInputs(options, rl) {
  const answers = {
    ...options,
    output: path.resolve(options.output),
    weeklyReviewDay: options.reviewDay || "Friday",
    aiHelpLevel: options.aiHelp || "drafting and review"
  };
  answers.output = await resolveOutputDir(answers, rl);

  if (rl) {
    answers.name ||= await ask(rl, "Preferred name or label for this vault", "Job Seeker");
    if (!answers.resumeFile && !answers.resumeText) {
      const mode = await ask(rl, "Resume input: file path, paste, or skip", "file");
      if (mode.toLowerCase().startsWith("paste")) {
        answers.resumeText = await askMultiline(rl, "Paste resume text. Type END on its own line when done.");
      } else if (!mode.toLowerCase().startsWith("skip")) {
        answers.resumeFile = await ask(rl, "Resume .txt, .md, or .docx path", "");
      }
    }
    answers.targetRoles ||= await ask(rl, "Target roles or role families", "");
    answers.industries ||= await ask(rl, "Target industries or company types", "");
    answers.location ||= await ask(rl, "Location or remote constraints", "");
    answers.dealBreakers ||= await ask(rl, "Deal-breakers or constraints", "");
    if (!options.reviewDay) answers.weeklyReviewDay = await ask(rl, "Weekly review day", answers.weeklyReviewDay);
    if (!options.aiHelp) answers.aiHelpLevel = await ask(rl, "Preferred AI help level", answers.aiHelpLevel);
    answers.storeSources = (await ask(rl, "Store raw source documents in Private/? yes/no", "no")).toLowerCase().startsWith("y");

    while ((await ask(rl, "Add another artifact? yes/no", "no")).toLowerCase().startsWith("y")) {
      const file = await ask(rl, "Artifact .txt or .md path", "");
      const type = await ask(rl, "Artifact type", "other");
      answers.artifacts.push({ file, type: ARTIFACT_TYPES.has(type) ? type : "other" });
    }

    if (!answers.versionControl && !answers.inPlace) {
      answers.versionControl = await askVersionControl(rl);
    }
  } else {
    answers.name ||= "Job Seeker";
  }

  answers.versionControl ||= "copy";
  answers.resume = await readResume(answers);
  answers.artifactTexts = await readArtifacts(answers.artifacts);
  return answers;
}

async function askVersionControl(rl) {
  output.write(
    "\nHow do you want to keep your vault?\n" +
    "  1. Files only - simplest; nothing to learn, nothing to break.\n" +
    "  2. Local history - a private undo button; see and roll back every change, all on your machine.\n" +
    "  3. Ready to back up - local history plus steps to push to your own PRIVATE GitHub repo, backed up and synced.\n"
  );
  const choice = await ask(rl, "Choose 1, 2, or 3", "1");
  if (choice.startsWith("2")) return "git";
  if (choice.startsWith("3")) return "backup";
  return "copy";
}

async function ask(rl, prompt, defaultValue) {
  const suffix = defaultValue ? ` (${defaultValue})` : "";
  const answer = await rl.question(`${prompt}${suffix}: `);
  return answer.trim() || defaultValue;
}

async function askMultiline(rl, prompt) {
  output.write(`${prompt}\n`);
  const lines = [];
  while (true) {
    const line = await rl.question("");
    if (line.trim() === "END") break;
    lines.push(line);
  }
  return lines.join("\n");
}

async function resolveOutputDir(answers, rl) {
  const resolved = path.resolve(answers.output);
  if (answers.inPlace || !(await isStarterRoot(resolved))) return resolved;

  const fallback = path.resolve(resolved, "..", DEFAULT_VAULT_DIRNAME);
  if (rl) {
    output.write("Your personal vault is created next to this starter, which keeps personal data out of the public starter clone.\n");
    const chosen = await ask(rl, "Personal vault folder (created next to this starter)", `../${DEFAULT_VAULT_DIRNAME}`);
    return path.resolve(resolved, chosen);
  }
  output.write(`Notice: the output folder is the public starter clone, so personal notes were redirected to ${fallback} to keep personal data out of it. Pass --in-place to write into the starter anyway.\n`);
  return fallback;
}

async function isStarterRoot(dir) {
  return (await exists(path.join(dir, "AI_ONBOARDING.md"))) &&
    (await exists(path.join(dir, "System/Scripts/setup/onboard.js")));
}

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function exportVaultScaffold(starterRoot, outputDir) {
  if (path.resolve(starterRoot) === path.resolve(outputDir)) return;
  for (const relativePath of SCAFFOLD_PATHS) {
    await copyIfMissing(path.join(starterRoot, relativePath), path.join(outputDir, relativePath));
  }
  const packagePath = path.join(outputDir, "package.json");
  if (!(await exists(packagePath))) {
    await fs.writeFile(packagePath, `${JSON.stringify(vaultPackageJson(), null, 2)}\n`, "utf8");
  }
  await writeIfMissing(outputDir, "AGENTS.md", vaultAgentsMd());
  await writeIfMissing(outputDir, "CLAUDE.md", vaultClaudeMd());
  await writeIfMissing(outputDir, ".cursor/rules/agent-contract.mdc", vaultCursorRule());
}

async function writeIfMissing(root, relativePath, content) {
  const target = path.join(root, relativePath);
  if (await exists(target)) return;
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}

function vaultAgentsMd() {
  return `# Personal Job-Search Vault Agent Contract

This folder is one person's private job-search Memex. This file is the shared agent contract for every AI coding harness: Codex, OpenCode, and Cursor read it directly; Claude Code imports it via CLAUDE.md; .cursor/rules/ points here as well.

Ground rules:

- Never invent experience, metrics, target companies, contacts, compensation, or constraints. If it is not in this vault or the conversation, record it as a missing input.
- Keep generated notes review-gated (\`review_needed: true\`) and keep facts, inferences, claims to verify, and missing inputs separate.
- Do not send vault contents to any external service unless the owner explicitly approves that specific action.
- Applications and outreach stay human-gated: you draft, the owner decides and sends.
- To change the system itself (templates, prompts, workflows, structure), follow \`System/Workflows/Vault Evolution.md\`: smallest reversible change, one at a time, explained in plain language.
- After structural changes, check the vault with \`npm run validate\`.

Start here: \`01 Start Here/Start Here.md\`. Enhancement ideas the owner may pick from: \`System/Workflows/Ideas To Grow Your Vault.md\`.
`;
}

function vaultClaudeMd() {
  return `@AGENTS.md

Claude Code: the agent contract for this vault lives in \`AGENTS.md\` (imported above).
`;
}

function vaultCursorRule() {
  return `---
description: Agent contract for this personal job-search vault
alwaysApply: true
---

Follow the agent contract in \`AGENTS.md\` at the vault root before making any changes.
`;
}

async function copyIfMissing(source, destination) {
  const stats = await fs.stat(source).catch(() => null);
  if (!stats) return;
  if (stats.isDirectory()) {
    await fs.mkdir(destination, { recursive: true });
    for (const entry of await fs.readdir(source)) {
      await copyIfMissing(path.join(source, entry), path.join(destination, entry));
    }
  } else if (!(await exists(destination))) {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
  }
}

function vaultPackageJson() {
  return {
    name: "my-job-search-vault",
    private: true,
    type: "module",
    scripts: {
      validate: "node System/Scripts/validate/validate-starter.js --mode vault"
    },
    engines: {
      node: ">=20"
    }
  };
}

async function maybeRenameStarterRemote(answers) {
  if (answers.keepRemote) {
    output.write("Kept the git remote origin unchanged (--keep-remote). Be careful not to push personal notes to the public starter repo.\n");
    return;
  }
  if (!(await exists(path.join(answers.output, ".git")))) return;
  try {
    const { stdout } = await execFileAsync("git", ["remote"], { cwd: answers.output });
    if (!stdout.split(/\r?\n/).includes("origin")) return;
    await execFileAsync("git", ["remote", "rename", "origin", "starter-origin"], { cwd: answers.output });
    output.write("Renamed the git remote origin to starter-origin so an accidental git push cannot publish personal notes to the public starter repo. Pass --keep-remote to skip this.\n");
  } catch {
    // git is unavailable or the rename failed; nothing safe to do here.
  }
}

async function initVaultGit(answers) {
  const outputDir = answers.output;
  const mode = answers.versionControl;
  if (mode !== "git" && mode !== "backup") return;

  // Keep Private/ and any user-supplied source files that live inside the vault out of git,
  // so a broad `git add -A` (or the user's own later) never commits raw sources - upholding
  // the "sources are not committed unless opted into storage" contract, including in backup mode.
  await ensureIgnored(outputDir, ["Private/", ...inputIgnoreEntries(answers)]);

  const alreadyRepo = await exists(path.join(outputDir, ".git"));

  if (alreadyRepo) {
    // Do not touch an existing repo's history or remotes; tell the user how to commit the vault.
    output.write("This folder is already a git repository, so its history and remotes were left alone. Commit the new vault files when ready:\n");
    output.write(`  cd "${outputDir}"\n`);
    output.write("  git add -A\n");
    output.write("  git commit -m \"Add job-search vault\"\n");
  } else {
    try {
      await execFileAsync("git", ["init", "-q"], { cwd: outputDir });
      // Name the branch main (portable across git versions and safe before the first commit)
      // so the backup instructions below match what the user actually has.
      await execFileAsync("git", ["symbolic-ref", "HEAD", "refs/heads/main"], { cwd: outputDir });
      await execFileAsync("git", ["add", "-A"], { cwd: outputDir });
    } catch {
      output.write("Could not set up git here (is git installed?). Your files are safe; skipping version control.\n");
      return;
    }

    let committed = false;
    try {
      await execFileAsync("git", ["commit", "-q", "-m", "Initial job-search vault"], { cwd: outputDir });
      committed = true;
    } catch {
      // Most likely no git identity is configured. Leave the staged snapshot for the user to commit.
    }

    if (committed) {
      output.write("Set up local git history with a first commit. Run `git log` to see it and `git status` as you work.\n");
    } else {
      output.write("Staged your files for a first commit. Set your git identity, then commit:\n");
      output.write(`  cd "${outputDir}"\n`);
      output.write("  git config user.name \"Your Name\"\n");
      output.write("  git config user.email \"you@example.com\"\n");
      output.write("  git commit -m \"Initial job-search vault\"\n");
    }
  }

  if (mode === "backup") {
    await printBackupSteps(outputDir, alreadyRepo);
  }
}

async function printBackupSteps(outputDir, alreadyRepo) {
  output.write("\nTo back up to your own PRIVATE GitHub repo (keep it private - it holds personal data):\n");
  const originExists = alreadyRepo && (await remoteExists(outputDir, "origin"));
  const steps = [];
  if (!originExists) steps.push("Create a new PRIVATE repository on GitHub.");
  steps.push(`cd "${outputDir}"`);
  if (originExists) {
    // The cloned repo already points at the user's remote; just push the current branch.
    steps.push("git push -u origin HEAD   # this folder already has an 'origin' remote");
  } else {
    steps.push("git remote add origin <your-private-repo-url>");
    if (!alreadyRepo) steps.push("git branch -M main");
    steps.push(`git push -u origin ${alreadyRepo ? "HEAD" : "main"}`);
  }
  steps.forEach((step, index) => output.write(`  ${index + 1}. ${step}\n`));
}

async function remoteExists(dir, name) {
  try {
    const { stdout } = await execFileAsync("git", ["remote"], { cwd: dir });
    return stdout.split(/\r?\n/).map((line) => line.trim()).includes(name);
  } catch {
    return false;
  }
}

function inputIgnoreEntries(answers) {
  const files = [];
  if (answers.resumeFile) files.push(answers.resumeFile);
  for (const artifact of answers.artifacts) {
    if (artifact.file) files.push(artifact.file);
  }
  const entries = [];
  for (const file of files) {
    const relative = path.relative(answers.output, path.resolve(file));
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) continue; // outside the vault
    entries.push(`/${relative.split(path.sep).join("/")}`); // anchor to the vault root
  }
  return entries;
}

async function ensureIgnored(outputDir, entries) {
  const gitignorePath = path.join(outputDir, ".gitignore");
  let contents = "";
  try {
    contents = await fs.readFile(gitignorePath, "utf8");
  } catch {
    // No .gitignore yet; we will create one.
  }
  const present = new Set(contents.split(/\r?\n/).map((line) => line.trim()));
  const missing = entries.filter((entry) => entry && !present.has(entry));
  if (!missing.length) return;
  const prefix = contents && !contents.endsWith("\n") ? "\n" : "";
  await fs.writeFile(gitignorePath, `${contents}${prefix}${missing.join("\n")}\n`, "utf8");
}

async function readResume(answers) {
  if (answers.resumeText) return { text: answers.resumeText, source: "pasted resume text" };
  if (!answers.resumeFile) return { text: "", source: "not provided" };
  const text = await readSupportedTextFile(answers.resumeFile);
  return { text, source: path.basename(answers.resumeFile) };
}

async function readArtifacts(artifacts) {
  const results = [];
  for (const artifact of artifacts) {
    if (!artifact.file) continue;
    const text = await readSupportedTextFile(artifact.file);
    results.push({ ...artifact, text, name: path.basename(artifact.file) });
  }
  return results;
}

async function readSupportedTextFile(file) {
  const ext = path.extname(file).toLowerCase();
  if ([".txt", ".md"].includes(ext)) return fs.readFile(path.resolve(file), "utf8");
  if (ext === ".docx") return extractDocxText(path.resolve(file));
  if ([".pdf", ".doc"].includes(ext)) {
    throw new Error(`I cannot read ${path.basename(file)} directly. Open the file, select all the text, copy it, and re-run this setup choosing the paste option - or re-save the file as .docx or .txt and try again.`);
  }
  throw new Error(`Unsupported file type for ${file}. Use pasted text, .txt, .md, or .docx.`);
}

function buildModel(answers) {
  const resumeFacts = extractResumeFacts(answers.resume.text);
  const artifactSummary = summarizeArtifacts(answers.artifactTexts);
  const resumeFamilies = inferResumeFamilies(answers, resumeFacts, artifactSummary);
  return {
    today: new Date().toISOString().slice(0, 10),
    name: answers.name,
    resumeFacts,
    artifactSummary,
    resumeFamilies,
    missingInputs: buildMissingInputs(answers, resumeFacts),
    claimsToVerify: buildClaimsToVerify(resumeFacts, artifactSummary)
  };
}

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_PATTERN = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;

function isContactLine(line) {
  return EMAIL_PATTERN.test(line) || PHONE_PATTERN.test(line) || /linkedin\.com/i.test(line);
}

function extractResumeFacts(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const email = text.match(EMAIL_PATTERN)?.[0] ?? "";
  const phone = text.match(PHONE_PATTERN)?.[0] ?? "";
  const metrics = lines
    .filter((line) => /\d/.test(line) && !isContactLine(line) && line.length <= 220)
    .slice(0, 12);
  const skills = inferSkills(text);
  const roleLines = extractRoleLines(lines);
  const summary = lines.slice(0, 5).find((line) => line.length >= 120) ?? "";

  return {
    email,
    phone,
    headline: lines[0] ?? "",
    summary,
    roleLines,
    metrics,
    skills
  };
}

function extractRoleLines(lines) {
  const candidates = lines.filter((line) => !isContactLine(line));
  const titleAndDates = candidates.filter((line) => /^.{3,80}\|[^|]*\d{4}/.test(line));
  if (titleAndDates.length) return titleAndDates.slice(0, 16);
  return candidates.filter((line) =>
    /\b(manager|director|lead|principal|senior|engineer|designer|analyst|consultant|specialist|founder|operator|product|program|project|marketing|sales|data|operations)\b/i.test(line)
  ).slice(0, 16);
}

function inferSkills(text) {
  const dictionary = [
    "product",
    "strategy",
    "operations",
    "engineering",
    "design",
    "data",
    "analytics",
    "ai",
    "machine learning",
    "sales",
    "marketing",
    "customer success",
    "research",
    "leadership",
    "program management",
    "finance",
    "healthcare",
    "education",
    "platform",
    "growth"
  ];
  const lower = text.toLowerCase();
  return dictionary.filter((term) => lower.includes(term)).slice(0, 12);
}

function summarizeArtifacts(artifacts) {
  return artifacts.map((artifact) => ({
    name: artifact.name,
    type: artifact.type,
    themes: inferSkills(artifact.text),
    lines: artifact.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 8)
  }));
}

function inferResumeFamilies(answers, resumeFacts, artifactSummary) {
  const sourceTerms = new Set([
    ...resumeFacts.skills,
    ...artifactSummary.flatMap((artifact) => artifact.themes),
    ...answers.targetRoles.toLowerCase().split(/[,;/|]+/).map((term) => term.trim()).filter(Boolean)
  ]);

  const families = [];
  const add = (id, label, reason) => families.push({ id, label, reason });

  if (hasAny(sourceTerms, ["product", "platform"])) add("product_platforms", "Product / Platforms", "Resume or artifacts emphasize product, platforms, or product leadership.");
  if (hasAny(sourceTerms, ["strategy", "operations", "program management"])) add("strategy_operations", "Strategy / Operations", "Source material emphasizes strategy, operations, or program leadership.");
  if (hasAny(sourceTerms, ["ai", "machine learning", "data", "analytics"])) add("data_ai_analytics", "Data / AI / Analytics", "Source material emphasizes data, AI, analytics, or technical systems.");
  if (hasAny(sourceTerms, ["design", "research", "customer success", "marketing", "sales", "growth"])) add("customer_growth_experience", "Customer / Growth / Experience", "Source material emphasizes customers, growth, research, design, sales, or marketing.");
  if (hasAny(sourceTerms, ["leadership", "manager", "director"])) add("people_leadership", "People Leadership", "Source material suggests management or leadership scope.");

  if (families.length === 0) add("general", "General Resume", "Not enough signal yet to define a specialized family.");
  add("custom", "Custom / Bespoke", "Use only when the role is high priority and existing families do not fit.");
  return families;
}

function hasAny(set, terms) {
  return terms.some((term) => set.has(term));
}

function buildMissingInputs(answers, resumeFacts) {
  const missing = [];
  if (!answers.resume.text) missing.push("Resume source material");
  if (!answers.targetRoles) missing.push("Target roles or role families");
  if (!answers.industries) missing.push("Target industries or company types");
  if (!answers.location) missing.push("Location, remote, travel, or relocation constraints");
  if (!answers.dealBreakers) missing.push("Deal-breakers and non-negotiables");
  if (resumeFacts.roleLines.length === 0) missing.push("Role history details");
  return missing;
}

function buildClaimsToVerify(resumeFacts, artifactSummary) {
  return [
    ...resumeFacts.metrics.map((metric) => `Verify metric/date from resume line: ${metric}`),
    ...artifactSummary.flatMap((artifact) => artifact.lines.slice(0, 2).map((line) => `Verify artifact-derived claim from ${artifact.name}: ${line}`))
  ].slice(0, 20);
}

async function writeVault(model, answers) {
  const root = answers.output;
  await ensureDirs(root, [
    "01 Start Here",
    "02 Projects",
    "04 Objects/Applications",
    "04 Objects/Companies",
    "04 Objects/People",
    "04 Objects/Conversations",
    "06 Synthesis/Career/Role History",
    "06 Synthesis/Career/Source Artifacts",
    "01 Reviews/Weekly"
  ]);

  await write(root, "01 Start Here/Start Here.md", startHere(model));
  await write(root, "01 Start Here/First Week Checklist.md", firstWeekChecklist());
  await write(root, "02 Projects/Job Search.md", jobSearchHub(model, answers));
  await write(root, "06 Synthesis/Career/Canonical Resume.md", canonicalResume(model, answers));
  await write(root, "06 Synthesis/Career/Resume Evidence Bank.md", evidenceBank(model));
  await write(root, "06 Synthesis/Career/Candidate-Market Fit.md", candidateMarketFit(model, answers));
  await write(root, "06 Synthesis/Career/Job Search Strategy.md", jobSearchStrategy(model, answers));
  await write(root, "06 Synthesis/Career/Source Artifacts/Artifact Index.md", artifactIndex(model));
  await write(root, `01 Reviews/Weekly/Weekly Job Search Review - ${model.today}.md`, weeklyReview(model, answers));
}

async function ensureDirs(root, dirs) {
  await Promise.all(dirs.map((dir) => fs.mkdir(path.join(root, dir), { recursive: true })));
}

async function write(root, relativePath, content) {
  await fs.mkdir(path.dirname(path.join(root, relativePath)), { recursive: true });
  await fs.writeFile(path.join(root, relativePath), content, "utf8");
}

async function maybeStoreSources(answers) {
  if (!answers.storeSources) return;
  if (answers.resume.text) {
    await write(answers.output, "Private/Resume Sources/resume-source.txt", answers.resume.text);
  }
  for (const artifact of answers.artifactTexts) {
    await write(answers.output, `Private/Source Artifacts/${sanitizeFileName(artifact.name)}.txt`, artifact.text);
  }
}

function yamlBase(type, kind, model) {
  return `---\ntype: ${type}\nkind: ${kind}\nstatus: active\ncreated: ${model.today}\nupdated: ${model.today}\nreview_needed: true\ntags:\n  - job-search\n---\n`;
}

function startHere(model) {
  return `${yamlBase("guide", "start_here", model)}# Start Here\n\nWelcome, ${model.name}.\n\n## Open First\n\n1. Review [[Canonical Resume]].\n2. Review [[Resume Evidence Bank]].\n3. Review [[Candidate-Market Fit]].\n4. Review [[Job Search Strategy]].\n5. Add one role to \`04 Objects/Applications/\`.\n6. Run the first weekly review.\n\n## Make It Yours\n\nThis system is meant to be reshaped around your search, with your AI assistant doing the heavy lifting. When something annoys you, see [[Vault Evolution]]; for inspiration, browse [[Ideas To Grow Your Vault]].\n\n## Review Needed\n\nThese notes were generated locally and need human review before external use.\n`;
}

function firstWeekChecklist() {
  return `# First Week Checklist\n\n- [ ] Review generated resume facts.\n- [ ] Resolve claims to verify.\n- [ ] Add target roles and company types.\n- [ ] Capture one target company.\n- [ ] Capture one conversation or outreach plan.\n- [ ] Create one application note.\n- [ ] Complete the first weekly review.\n\n## Week 2 And Beyond\n\nThis vault is yours to change, and your AI assistant can do the heavy lifting. Climb one rung at a time:\n\n1. Use the vault as-is for a week and note what annoys you (the weekly review asks).\n2. Edit one template by hand.\n3. Ask your AI assistant to change one prompt or template for you.\n4. Pick an idea from [[Ideas To Grow Your Vault]] and build it together.\n`;
}

function jobSearchHub(model, answers) {
  return `${yamlBase("project", "job_search", model)}# Job Search\n\n## Outcome\n\nLand a role that fits my strengths, constraints, and current market strategy.\n\n## Current Targets\n\n- Roles: ${answers.targetRoles || "Missing input"}\n- Industries / company types: ${answers.industries || "Missing input"}\n- Location / remote: ${answers.location || "Missing input"}\n- Deal-breakers: ${answers.dealBreakers || "Missing input"}\n- Weekly review: ${answers.weeklyReviewDay}\n\n## Core Notes\n\n- [[Canonical Resume]]\n- [[Resume Evidence Bank]]\n- [[Candidate-Market Fit]]\n- [[Job Search Strategy]]\n\n## Operating Loop\n\nCapture -> process -> decide -> act -> reconcile -> review.\n`;
}

function canonicalResume(model, answers) {
  const resume = answers.resume.text.trim() || "No resume source provided yet.";
  return `${yamlBase("synthesis", "canonical_resume", model)}# Canonical Resume\n\nSource: ${answers.resume.source}\n\n## Current Resume Text\n\n${resume}\n\n## Claims To Verify\n\nSee [[Resume Evidence Bank]] for the claims-to-verify list.\n\n## Missing Inputs\n\n${list(model.missingInputs)}\n`;
}

function evidenceBank(model) {
  const summarySection = model.resumeFacts.summary ? `## Positioning Summary\n\n${model.resumeFacts.summary}\n\n` : "";
  return `${yamlBase("synthesis", "resume_evidence_bank", model)}# Resume Evidence Bank\n\n## Extracted Headline\n\n${model.resumeFacts.headline || "-"}\n\n${summarySection}## Role / Scope Signals\n\n${list(model.resumeFacts.roleLines)}\n\n## Skills And Themes\n\n${list(model.resumeFacts.skills)}\n\n## Metrics / Dates / Numbers To Verify\n\n${list(model.resumeFacts.metrics)}\n\n## Personalized Resume Families\n\n${model.resumeFamilies.map((family) => `- \`${family.id}\`: ${family.label} - ${family.reason}`).join("\n")}\n\n## Claims To Verify\n\n${list(model.claimsToVerify)}\n`;
}

function candidateMarketFit(model, answers) {
  const cmfArtifacts = model.artifactSummary.filter((artifact) => artifact.type === "cmf");
  return `${yamlBase("synthesis", "candidate_market_fit", model)}# Candidate-Market Fit\n\n## Working Hypotheses\n\n- Target roles: ${answers.targetRoles || "Missing input"}\n- Target industries / company types: ${answers.industries || "Missing input"}\n- Search constraints: ${answers.location || "Missing input"}\n\n## Evidence-Backed Strengths\n\n${list(model.resumeFacts.skills)}\n\n## Source Artifact Signals\n\n${artifactBullets(cmfArtifacts.length ? cmfArtifacts : model.artifactSummary)}\n\n## Objections To Test\n\n- Which roles recognize this experience quickly?\n- Which words in the market differ from the resume language?\n- Which gaps are vocabulary gaps, evidence gaps, or pattern gaps?\n\n## Missing Inputs The System Should Not Invent\n\n${list(model.missingInputs)}\n`;
}

function jobSearchStrategy(model, answers) {
  const strategyArtifacts = model.artifactSummary.filter((artifact) => ["strategy", "target_companies", "networking"].includes(artifact.type));
  return `${yamlBase("synthesis", "job_search_strategy", model)}# Job Search Strategy\n\n## Diagnosis\n\n${answers.targetRoles ? `The current search is oriented around: ${answers.targetRoles}.` : "Missing input: target roles."}\n\n## Guiding Policy\n\nPrioritize roles where the evidence bank, resume families, and market feedback point in the same direction.\n\n## Coherent Actions\n\n- Review one high-fit role at a time.\n- Use conversations to test Candidate-Market Fit.\n- Keep application notes review-gated.\n- Update the weekly review before expanding the search.\n\n## Artifact Signals\n\n${artifactBullets(strategyArtifacts)}\n\n## Constraints\n\n- Location / remote: ${answers.location || "Missing input"}\n- Deal-breakers: ${answers.dealBreakers || "Missing input"}\n- AI help level: ${answers.aiHelpLevel}\n\n## Missing Inputs The System Should Not Invent\n\n${list(model.missingInputs)}\n`;
}

function artifactIndex(model) {
  return `${yamlBase("synthesis", "source_artifact_index", model)}# Source Artifact Index\n\nRaw source documents are not stored here by default. This note records derived summaries only.\n\n${artifactBullets(model.artifactSummary)}\n`;
}

function weeklyReview(model, answers) {
  return `${yamlBase("synthesis", "weekly_review", model)}# Weekly Job Search Review - ${model.today}\n\n## Metrics\n\n- Applications submitted:\n- Active roles:\n- Roles needing action:\n- Conversations:\n- Networking messages:\n- Referrals requested:\n\n## What Changed This Week\n\n-\n\n## New Market Signals\n\n-\n\n## Candidate-Market Fit Updates\n\n-\n\n## Next Week Priorities\n\n- Review generated setup notes.\n- Add one target role.\n- Schedule or capture one job-search conversation.\n\n## System Friction\n\nWhat annoyed you about the system itself this week?\n\n-\n\nPick one item and ask your AI assistant to fix it - see [[Vault Evolution]] for how, and [[Ideas To Grow Your Vault]] if you want inspiration.\n\n## Accountability / Stakeholder Update\n\nThis week I set up the job-search Memex structure. Next review day: ${answers.weeklyReviewDay}.\n`;
}

function artifactBullets(artifacts) {
  if (!artifacts.length) return "- No artifact signals provided yet.";
  return artifacts.map((artifact) => {
    const themes = artifact.themes.join(", ") || "needs review";
    const sourceLine = artifact.lines[0] ? ` Source signal: ${artifact.lines[0]}` : "";
    return `- ${artifact.name} (${artifact.type}): ${themes}.${sourceLine}`;
  }).join("\n");
}

function list(items) {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- None yet.";
}

function sanitizeFileName(value) {
  return value.replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "source";
}

function printSummary(root, model) {
  output.write(`\nJob-search Memex setup complete.\n\n`);
  output.write(`Created starter notes in: ${root}\n`);
  output.write(`Next actions:\n`);
  output.write(`1. Fill in target roles, industries, and constraints in 02 Projects/Job Search.md\n`);
  output.write(`2. Resolve the Claims To Verify in 06 Synthesis/Career/Resume Evidence Bank.md\n`);
  output.write(`3. Complete the first weekly review in 01 Reviews/Weekly/\n`);
  output.write(`Open the vault folder in Obsidian (Open folder as vault) to get started.\n`);
  output.write(`Open next: 01 Start Here/Start Here.md\n\n`);
  output.write(`Resume families:\n${model.resumeFamilies.map((family) => `- ${family.id}: ${family.label}`).join("\n")}\n`);
  if (model.missingInputs.length) {
    output.write(`\nMissing inputs to review:\n${model.missingInputs.map((item) => `- ${item}`).join("\n")}\n`);
  }
}

main().catch((error) => {
  console.error(`\nSetup could not finish: ${error.message}`);
  process.exitCode = 1;
});
