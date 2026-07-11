# AI Onboarding Instructions

Use this file when helping a user set up this starter repo. It applies to any AI coding harness (Claude Code, Codex, Cursor, OpenCode, or similar); the general agent contract lives in `AGENTS.md`, which every harness reads directly or through the `CLAUDE.md` / `.cursor/rules/` mirrors.

## Prime Directive

Help the user create their own job-search Memex without inventing personal context. Keep all source documents local unless the user explicitly asks to use an external service.

**Never commit generated personal notes to the starter repository.** The wizard creates the user's personal vault in a sibling folder (default `../My Job Search Vault`) precisely so personal data never enters this public repo. Do not override that default by committing resume content, generated notes, or any personal data here. Leave the starter working tree clean when you finish.

## Start

First, ask the user conversationally for:

- Target roles they are pursuing.
- Industries of interest.
- Location or remote constraints.
- Deal-breakers.
- Preferred weekly review day.

If the user declines or does not know an answer, leave that field unset. The wizard records unset fields as Missing Inputs. Never guess them.

Then ask for:

- Resume as pasted text or a `.txt` / `.md` / `.docx` file. PDFs are not parsed: ask the user to paste the text or re-save as `.docx` or `.txt`.
- Optional job-search artifacts: Mnookin two-pager, Candidate-Market Fit worksheet, Never Search Alone notes, listening-tour notes, target-company lists, networking maps, strategy drafts, or prior application trackers.

Then run the wizard, passing everything the user supplied as flags:

```bash
npm start -- \
  --name "Jordan Lee" \
  --resume-file path/to/resume.docx \
  --target-roles "Product Manager; Program Manager" \
  --industries "Healthcare; Climate" \
  --location "Remote, or hybrid near hometown" \
  --deal-breakers "No heavy travel" \
  --review-day Friday \
  --ai-help \
  --yes
```

Only pass flags for answers the user actually gave. Omit the rest.

Artifacts can be supplied as:

```bash
npm start -- --artifact path/to/cmf.md:cmf --artifact path/to/strategy.md:strategy
```

Allowed artifact types:

```txt
resume
cmf
strategy
networking
target_companies
applications
conversation_notes
other
```

## Flags

- `--name`, `--resume-file`, `--resume-text`, `--artifact`, `--yes`, `--store-sources` — as before.
- `--target-roles`, `--industries`, `--location`, `--deal-breakers`, `--review-day`, `--ai-help` — pass the user's interview answers non-interactively.
- `--output` — where to create the vault. Default is a sibling folder, `../My Job Search Vault`.
- `--version-control copy|git|backup` — how the vault is kept. `copy` (default) leaves plain files; `git` adds local history with a first commit; `backup` also prints steps for the user to push to their own private repo. In interactive mode the wizard asks this as a 3-way choice; non-interactively, pass the user's stated preference or omit for `copy`. Never point a vault remote at this public starter.
- `--in-place` — advanced: set up inside the starter clone instead of a sibling folder. In this mode the wizard renames the git remote `origin` to `starter-origin` as a push guard. `--keep-remote` opts out of the rename. Do not choose `--in-place` on the user's behalf.

## After The Wizard: Enrichment Contract

After `npm start` succeeds, do this enrichment pass inside the generated vault, not in the starter.

**Resume Evidence Bank.** Restructure the raw resume evidence into per-role accomplishment sections: company, title, and dates as the heading, accomplishment bullets beneath. Group skills into themes. Keep a single de-duplicated Claims To Verify list containing every metric and date.

**Candidate-Market Fit.** Derive strength themes from the evidence bank. Each theme must be evidence-backed and traceable to a specific resume line. Leave target roles, industries, and constraints as Missing Inputs unless the user supplied them.

**Job Search Strategy.** Write a short diagnosis grounded only in inputs the user supplied, with concrete next actions.

Hard rules for this pass:

- Do not invent roles, companies, metrics, compensation, contacts, or constraints.
- Every number stays flagged for verification.
- Missing Inputs sections stay present.
- Keep `review_needed: true` on generated notes.

When enrichment is done, tell the user two things about the vault's future: the weekly review will ask what annoyed them about the system, and `System/Workflows/Ideas To Grow Your Vault.md` holds enhancement ideas they can build with you later. Do not build any of those enhancements now — they are the user's to pick when a real friction appears. Later changes to the vault's templates, prompts, or workflows follow `System/Workflows/Vault Evolution.md`.

The generated vault carries its own agent instructions (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`), so any harness the user opens it with later will inherit these rules.

## Harness Rules

- Do not send resume or source artifacts to external APIs unless the user explicitly approves that specific action.
- Never commit personal notes or resume content to this starter repo. The personal vault lives in its sibling folder; keep it there, and keep the starter working tree clean.
- Do not commit raw source documents anywhere unless the user opts into storage; opted-in sources go under the vault's git-ignored `Private/` folder.
- If Node.js or npm is missing, explain that the user needs Node.js LTS and npm, then stop.
- After setup and enrichment, summarize created notes and offer to open the generated vault's `01 Start Here/Start Here.md` in Obsidian. Remind the user to open the vault folder, not the starter.
- Keep missing information in "Missing Inputs" sections. Do not fill gaps with guesses.
- Run `npm run validate:vault` (or the generated vault's own `npm run validate`) to check a personal vault. Reserve the starter's `npm run validate` for template contributions; it includes a private-string scan that a personalized in-place vault will fail.
