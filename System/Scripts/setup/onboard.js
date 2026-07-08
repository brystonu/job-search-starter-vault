#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

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
  storeSources: false
};

function parseArgs(argv) {
  const options = { ...DEFAULT_OPTIONS, artifacts: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--yes" || arg === "-y") options.yes = true;
    else if (arg === "--store-sources") options.storeSources = true;
    else if (arg === "--name") options.name = argv[++i] ?? "";
    else if (arg === "--output") options.output = argv[++i] ?? process.cwd();
    else if (arg === "--resume-file") options.resumeFile = argv[++i] ?? "";
    else if (arg === "--resume-text") options.resumeText = argv[++i] ?? "";
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
    printSummary(answers.output, model);
  } finally {
    rl?.close();
  }
}

async function collectInputs(options, rl) {
  const answers = {
    ...options,
    output: path.resolve(options.output),
    targetRoles: "",
    industries: "",
    location: "",
    dealBreakers: "",
    weeklyReviewDay: "Friday",
    aiHelpLevel: "drafting and review"
  };

  if (rl) {
    answers.name ||= await ask(rl, "Preferred name or label for this vault", "Job Seeker");
    if (!answers.resumeFile && !answers.resumeText) {
      const mode = await ask(rl, "Resume input: file path, paste, or skip", "file");
      if (mode.toLowerCase().startsWith("paste")) {
        answers.resumeText = await askMultiline(rl, "Paste resume text. Type END on its own line when done.");
      } else if (!mode.toLowerCase().startsWith("skip")) {
        answers.resumeFile = await ask(rl, "Resume .txt or .md path", "");
      }
    }
    answers.targetRoles = await ask(rl, "Target roles or role families", "");
    answers.industries = await ask(rl, "Target industries or company types", "");
    answers.location = await ask(rl, "Location or remote constraints", "");
    answers.dealBreakers = await ask(rl, "Deal-breakers or constraints", "");
    answers.weeklyReviewDay = await ask(rl, "Weekly review day", answers.weeklyReviewDay);
    answers.aiHelpLevel = await ask(rl, "Preferred AI help level", answers.aiHelpLevel);
    answers.storeSources = (await ask(rl, "Store raw source documents in Private/? yes/no", "no")).toLowerCase().startsWith("y");

    while ((await ask(rl, "Add another artifact? yes/no", "no")).toLowerCase().startsWith("y")) {
      const file = await ask(rl, "Artifact .txt or .md path", "");
      const type = await ask(rl, "Artifact type", "other");
      answers.artifacts.push({ file, type: ARTIFACT_TYPES.has(type) ? type : "other" });
    }
  } else {
    answers.name ||= "Job Seeker";
  }

  answers.resume = await readResume(answers);
  answers.artifactTexts = await readArtifacts(answers.artifacts);
  return answers;
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
  if (![".txt", ".md"].includes(ext)) {
    throw new Error(`Unsupported file type for ${file}. Use pasted text, .txt, or .md for v1.`);
  }
  return fs.readFile(path.resolve(file), "utf8");
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

function extractResumeFacts(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
  const phone = text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)?.[0] ?? "";
  const metrics = lines.filter((line) => /\d/.test(line)).slice(0, 12);
  const skills = inferSkills(text);
  const roleLines = lines.filter((line) =>
    /\b(manager|director|lead|principal|senior|engineer|designer|analyst|consultant|specialist|founder|operator|product|program|project|marketing|sales|data|operations)\b/i.test(line)
  ).slice(0, 16);

  return {
    email,
    phone,
    headline: lines[0] ?? "",
    roleLines,
    metrics,
    skills
  };
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
  return `${yamlBase("guide", "start_here", model)}# Start Here\n\nWelcome, ${model.name}.\n\n## Open First\n\n1. Review [[Canonical Resume]].\n2. Review [[Resume Evidence Bank]].\n3. Review [[Candidate-Market Fit]].\n4. Review [[Job Search Strategy]].\n5. Add one role to \`04 Objects/Applications/\`.\n6. Run the first weekly review.\n\n## Review Needed\n\nThese notes were generated locally and need human review before external use.\n`;
}

function firstWeekChecklist() {
  return `# First Week Checklist\n\n- [ ] Review generated resume facts.\n- [ ] Resolve claims to verify.\n- [ ] Add target roles and company types.\n- [ ] Capture one target company.\n- [ ] Capture one conversation or outreach plan.\n- [ ] Create one application note.\n- [ ] Complete the first weekly review.\n`;
}

function jobSearchHub(model, answers) {
  return `${yamlBase("project", "job_search", model)}# Job Search\n\n## Outcome\n\nLand a role that fits my strengths, constraints, and current market strategy.\n\n## Current Targets\n\n- Roles: ${answers.targetRoles || "Missing input"}\n- Industries / company types: ${answers.industries || "Missing input"}\n- Location / remote: ${answers.location || "Missing input"}\n- Deal-breakers: ${answers.dealBreakers || "Missing input"}\n- Weekly review: ${answers.weeklyReviewDay}\n\n## Core Notes\n\n- [[Canonical Resume]]\n- [[Resume Evidence Bank]]\n- [[Candidate-Market Fit]]\n- [[Job Search Strategy]]\n\n## Operating Loop\n\nCapture -> process -> decide -> act -> reconcile -> review.\n`;
}

function canonicalResume(model, answers) {
  const resume = answers.resume.text.trim() || "No resume source provided yet.";
  return `${yamlBase("synthesis", "canonical_resume", model)}# Canonical Resume\n\nSource: ${answers.resume.source}\n\n## Current Resume Text\n\n${resume}\n\n## Claims To Verify\n\n${list(model.claimsToVerify)}\n\n## Missing Inputs\n\n${list(model.missingInputs)}\n`;
}

function evidenceBank(model) {
  return `${yamlBase("synthesis", "resume_evidence_bank", model)}# Resume Evidence Bank\n\n## Extracted Headline\n\n${model.resumeFacts.headline || "-"}\n\n## Role / Scope Signals\n\n${list(model.resumeFacts.roleLines)}\n\n## Skills And Themes\n\n${list(model.resumeFacts.skills)}\n\n## Metrics / Dates / Numbers To Verify\n\n${list(model.resumeFacts.metrics)}\n\n## Personalized Resume Families\n\n${model.resumeFamilies.map((family) => `- \`${family.id}\`: ${family.label} - ${family.reason}`).join("\n")}\n\n## Claims To Verify\n\n${list(model.claimsToVerify)}\n`;
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
  return `${yamlBase("synthesis", "weekly_review", model)}# Weekly Job Search Review - ${model.today}\n\n## Metrics\n\n- Applications submitted:\n- Active roles:\n- Roles needing action:\n- Conversations:\n- Networking messages:\n- Referrals requested:\n\n## What Changed This Week\n\n-\n\n## New Market Signals\n\n-\n\n## Candidate-Market Fit Updates\n\n-\n\n## Next Week Priorities\n\n- Review generated setup notes.\n- Add one target role.\n- Schedule or capture one job-search conversation.\n\n## Accountability / Stakeholder Update\n\nThis week I set up the job-search Memex structure. Next review day: ${answers.weeklyReviewDay}.\n`;
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
