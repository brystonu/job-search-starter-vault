# AI Onboarding Instructions

Use this file when helping a user set up this starter repo.

## Prime Directive

Help the user create their own job-search Memex without inventing personal context. Keep all source documents local unless the user explicitly asks to use an external service.

## Start

Ask the user for:

- Resume as pasted text or a `.txt` / `.md` file.
- Optional job-search artifacts: Mnookin two-pager, Candidate-Market Fit worksheet, Never Search Alone notes, listening-tour notes, target-company lists, networking maps, strategy drafts, or prior application trackers.

Then run:

```bash
npm start
```

If the tool can pass file paths or command flags, prefer:

```bash
npm start -- --name "User Name" --resume-file path/to/resume.txt --yes
```

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

## Harness Rules

- Do not send resume or source artifacts to external APIs unless the user explicitly approves that specific action.
- Do not commit raw source documents unless the user opts into storage.
- If Node.js or npm is missing, explain that the user needs Node.js LTS and npm, then stop.
- After setup, summarize created notes and offer to open `01 Start Here/Start Here.md`.
- Keep missing information in "Missing Inputs" sections. Do not fill gaps with guesses.
