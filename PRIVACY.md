# Privacy And Public Safety

This starter is designed to be safe to share before it contains user data.

## Rules

- The setup wizard runs locally.
- No external API calls are made by default.
- Raw resume and artifact text is not stored unless the user opts in.
- Generated notes are marked `review_needed: true`.
- Facts, inferences, claims to verify, and missing inputs stay separate.
- The fictional demo is the only included example content.

## Do Not Add To A Public Starter

- Real applications
- Real contacts
- Interview transcripts
- Private role-history details
- Personal calendars, tasks, emails, or account references
- Absolute local paths
- Source documents the user did not opt into storing

## Optional Private Storage

If the user chooses to store source artifacts, put them under:

```txt
Private/Resume Sources/
Private/Source Artifacts/
```

The `Private/` folder is ignored by Git.
