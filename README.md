# Job Search Memex Starter

A lightweight Obsidian-ready starter for running a job search with notes, evidence, applications, conversations, and weekly review.

The easiest path is to open this folder in an AI coding tool and say:

```txt
Set up this job-search Memex for me using my resume and job-search docs.
```

The simplest local command is:

```bash
npm start
```

## Prerequisites

- Required for local setup: Git, Node.js LTS, and npm.
- Recommended: Obsidian desktop.
- Optional: Codex, Claude Code, Cursor, ChatGPT, or another AI coding harness.

If you do not know whether Node.js is installed, try the double-click launcher for your system or ask your AI coding tool to run onboarding.

## What Setup Creates

By default the wizard creates your personal vault in a new folder next to this one (default `../My Job Search Vault`). It copies the System files the vault needs (Templates, Prompts, Bases, Workflows, Scripts) plus its own `package.json`, so the vault is standalone and has no git remote. Your personal data never lands in this public starter. Advanced users can pass `--in-place` to set up inside the starter clone instead.

Inside the generated vault:

- `02 Projects/Job Search.md`
- `06 Synthesis/Career/Canonical Resume.md`
- `06 Synthesis/Career/Resume Evidence Bank.md`
- `06 Synthesis/Career/Candidate-Market Fit.md`
- `06 Synthesis/Career/Job Search Strategy.md`
- `01 Reviews/Weekly/Weekly Job Search Review - <date>.md`
- Optional starter notes for companies, people, applications, and conversations when you provide source material.

All generated notes are marked for review. The setup wizard separates facts, inferences, claims to verify, and missing inputs.

## Inputs

The wizard supports pasted text, `.txt`, `.md`, and `.docx` files.

Recommended first input:

- Resume

Optional inputs:

- Mnookin two-pager
- Candidate-Market Fit worksheet
- Never Search Alone notes
- Listening-tour notes
- Target-company lists
- Networking maps
- Job-search strategy drafts
- Prior application trackers

`.pdf` files are not parsed. Paste the relevant text instead, or re-save the file as `.docx` or `.txt`.

## Validation

- `npm run validate` checks the starter itself, including a scan for private strings. Use it if you contribute to the template.
- `npm run validate:vault` checks a personal vault: frontmatter and review gating only, so a personalized vault passes cleanly. The generated vault's own `npm run validate` runs this mode.

## Privacy

The wizard runs locally. It does not call external APIs. It does not store raw source documents unless you explicitly choose to store them.

See `PRIVACY.md` for the public-safety rules.

## Examples

The `examples/fictional-demo/` folder contains a fully fictional sample. It is safe to inspect or delete.

## License

MIT. See `LICENSE`.
