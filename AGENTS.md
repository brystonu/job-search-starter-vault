# Job Search Memex Starter Agent Contract

This file is the shared agent contract for every AI coding harness. Codex, OpenCode, and Cursor read it directly; Claude Code imports it via `CLAUDE.md`; `.cursor/rules/` points here as well. Keep this file the single source of truth — mirror files only reference it.

This repo is a public-safe starter vault, not a private job-search archive.

Before editing generated user notes:

- Never commit generated personal notes or resume content to this starter repository — the wizard creates the personal vault in a sibling folder; keep it there.
- Preserve human-authored content.
- Do not invent resume facts, target companies, metrics, compensation, or relationship context.
- Keep all generated claims reviewable.
- Keep source documents local unless the user explicitly approves external processing.
- Prefer `npm start` for onboarding, `npm run validate` for starter checks, and `npm run validate:vault` for personal vaults.
- When asked to change a vault's templates, prompts, or workflows, follow `System/Workflows/Vault Evolution.md`: smallest reversible change, one at a time, explained in plain language.

Expected AI setup request:

```txt
Set up this job-search Memex for me using my resume and job-search docs.
```
