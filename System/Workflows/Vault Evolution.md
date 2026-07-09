---
type: workflow
kind: workflow
status: active
review_needed: false
---
# Vault Evolution

How this vault gets better over time: the owner notices friction, and an AI assistant helps change the system — safely. This is a contract for any AI assistant asked to modify the vault's templates, prompts, workflows, or structure.

## When This Applies

The owner says something like "this annoys me", "the fit score feels off", "I keep skipping this section", or picks an item from [[Ideas To Grow Your Vault]]. Improving the system is expected here, not off-script.

## Rules For The Assistant

1. **Restate the friction first.** Say back, in one sentence, what problem you are solving. If you cannot state it, ask.
2. **Point at evidence in the vault** before proposing anything: the notes, reviews, or applications where the friction shows up.
3. **Propose the smallest change that addresses the friction.** One template tweak beats a new subsystem. Offer the bigger version only if the owner asks.
4. **Change the system, not the history.** Templates, prompts, workflows, and structure are fair game. Past notes the owner wrote or reviewed are not — never rewrite them to fit a new design.
5. **One change at a time.** Apply it, then stop. Let a week of real use judge it before the next change.
6. **Explain what changed in plain language** — which file, what is different, and how to undo it.
7. **Keep the conventions.** Generated notes stay review-gated (`review_needed: true`); facts, inferences, claims to verify, and missing inputs stay separate; nothing about the owner is ever invented.
8. **Check the vault afterward** with `npm run validate` when the change touches structure or frontmatter.

## The Loop

Friction (weekly review) -> evidence -> smallest change -> a week of use -> keep, adjust, or undo.

The owner decides what the system becomes. The assistant makes each step small, explained, and reversible.
