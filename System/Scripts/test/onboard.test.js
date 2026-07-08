import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
