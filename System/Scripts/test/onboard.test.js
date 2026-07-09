import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(new URL("../../..", import.meta.url).pathname);
const ONBOARD = path.join(ROOT, "System/Scripts/setup/onboard.js");
const VALIDATE = path.join(ROOT, "System/Scripts/validate/validate-starter.js");

test("setup generates review-gated notes from resume and artifacts", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "job-search-memex-test-"));
  const resume = path.join(tmp, "resume.md");
  const cmf = path.join(tmp, "cmf.md");
  await fs.writeFile(resume, "# Jordan Lee\n\nSenior Product Manager\n\nLed analytics platform work and improved onboarding by 24%.\n", "utf8");
  await fs.writeFile(cmf, "# Candidate Market Fit\n\nTarget product platform roles in data and AI tooling.\n", "utf8");

  await execFileAsync("node", [
    ONBOARD,
    "--yes",
    "--name",
    "Jordan Lee",
    "--resume-file",
    resume,
    "--artifact",
    `${cmf}:cmf`,
    "--output",
    tmp
  ]);

  const start = await fs.readFile(path.join(tmp, "01 Start Here/Start Here.md"), "utf8");
  const evidence = await fs.readFile(path.join(tmp, "06 Synthesis/Career/Resume Evidence Bank.md"), "utf8");
  const cmfOut = await fs.readFile(path.join(tmp, "06 Synthesis/Career/Candidate-Market Fit.md"), "utf8");

  assert.match(start, /Welcome, Jordan Lee/);
  assert.match(evidence, /data_ai_analytics|product_platforms/);
  assert.match(cmfOut, /Candidate Market Fit/);
  assert.match(cmfOut, /review_needed: true/);
});

test("starter validates before user data is added", async () => {
  const result = await execFileAsync("node", [VALIDATE, "--root", ROOT]);
  assert.match(result.stdout, /Starter validation passed/);
});

function buildStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuffer = Buffer.from(name, "utf8");
    const body = Buffer.from(data, "utf8");
    const crc = typeof zlib.crc32 === "function" ? zlib.crc32(body) >>> 0 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    localParts.push(local, nameBuffer, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);

    offset += local.length + nameBuffer.length + body.length;
  }
  const centralBuffer = Buffer.concat(centralParts);
  const endOfCentralDir = Buffer.alloc(22);
  endOfCentralDir.writeUInt32LE(0x06054b50, 0);
  endOfCentralDir.writeUInt16LE(entries.length, 8);
  endOfCentralDir.writeUInt16LE(entries.length, 10);
  endOfCentralDir.writeUInt32LE(centralBuffer.length, 12);
  endOfCentralDir.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralBuffer, endOfCentralDir]);
}

test("setup ingests a .docx resume", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "job-search-memex-docx-"));
  const documentXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>',
    "<w:p><w:r><w:t>Casey Morgan</w:t></w:r></w:p>",
    "<w:p><w:r><w:t>Principal Product Manager for data &amp; analytics platforms</w:t></w:r></w:p>",
    "</w:body></w:document>"
  ].join("");
  const docxPath = path.join(tmp, "resume.docx");
  await fs.writeFile(docxPath, buildStoredZip([{ name: "word/document.xml", data: documentXml }]));

  await execFileAsync("node", [ONBOARD, "--yes", "--resume-file", docxPath, "--output", tmp]);

  const canonical = await fs.readFile(path.join(tmp, "06 Synthesis/Career/Canonical Resume.md"), "utf8");
  assert.match(canonical, /Casey Morgan/);
  assert.match(canonical, /Principal Product Manager for data & analytics platforms/);
});

test("target flags flow into Job Search hub", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "job-search-memex-flags-"));

  await execFileAsync("node", [
    ONBOARD,
    "--yes",
    "--target-roles",
    "Principal PM",
    "--location",
    "Portland or remote",
    "--output",
    tmp
  ]);

  const hub = await fs.readFile(path.join(tmp, "02 Projects/Job Search.md"), "utf8");
  assert.match(hub, /- Roles: Principal PM/);
  assert.match(hub, /- Location \/ remote: Portland or remote/);
  assert.doesNotMatch(hub, /- Roles: Missing input/);
  assert.doesNotMatch(hub, /- Location \/ remote: Missing input/);
});

test("output pointed at a starter root is redirected to a sibling vault", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "job-search-memex-redirect-"));
  const fakeStarter = path.join(tmp, "starter-clone");
  await fs.mkdir(path.join(fakeStarter, "System/Scripts/setup"), { recursive: true });
  await fs.writeFile(path.join(fakeStarter, "AI_ONBOARDING.md"), "marker\n", "utf8");
  await fs.writeFile(path.join(fakeStarter, "System/Scripts/setup/onboard.js"), "", "utf8");

  const result = await execFileAsync("node", [ONBOARD, "--yes", "--output", fakeStarter]);
  assert.match(result.stdout, /redirected/i);

  const vaultStart = path.join(tmp, "My Job Search Vault/01 Start Here/Start Here.md");
  await fs.access(vaultStart);
  await assert.rejects(fs.access(path.join(fakeStarter, "01 Start Here/Start Here.md")));
});

test("generated vault passes vault-mode validation", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "job-search-memex-vault-validate-"));
  await execFileAsync("node", [ONBOARD, "--yes", "--output", tmp]);

  const result = await execFileAsync("node", [VALIDATE, "--root", tmp, "--mode", "vault"]);
  assert.match(result.stdout, /Vault validation passed/);
});

test("exported vault carries harness-agnostic agent instructions and the learning loop", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "job-search-memex-agent-files-"));
  await execFileAsync("node", [ONBOARD, "--yes", "--output", tmp]);

  const agents = await fs.readFile(path.join(tmp, "AGENTS.md"), "utf8");
  const claude = await fs.readFile(path.join(tmp, "CLAUDE.md"), "utf8");
  const cursorRule = await fs.readFile(path.join(tmp, ".cursor/rules/agent-contract.mdc"), "utf8");
  assert.match(agents, /Personal Job-Search Vault Agent Contract/);
  assert.match(agents, /Vault Evolution/);
  assert.match(claude, /@AGENTS\.md/);
  assert.match(cursorRule, /alwaysApply: true/);

  await fs.access(path.join(tmp, "System/Workflows/Vault Evolution.md"));
  await fs.access(path.join(tmp, "System/Workflows/Ideas To Grow Your Vault.md"));

  const reviews = await fs.readdir(path.join(tmp, "01 Reviews/Weekly"));
  const weekly = await fs.readFile(path.join(tmp, "01 Reviews/Weekly", reviews[0]), "utf8");
  assert.match(weekly, /## System Friction/);

  const checklist = await fs.readFile(path.join(tmp, "01 Start Here/First Week Checklist.md"), "utf8");
  assert.match(checklist, /Week 2 And Beyond/);
});
