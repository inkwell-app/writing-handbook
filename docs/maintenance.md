# Maintaining the handbook

The public repository is the source of truth for these workflows and templates. Product capabilities, pricing and availability remain owned by the linked product pages.

Before a release, run the catalog check, unit tests and live link check described in CONTRIBUTING. Review changes for originality, useful examples and accurate claims. Keep resource IDs stable when fixing destinations. Record meaningful additions in release notes and use a tag so citations can identify a version.

Run `pnpm links --published` monthly and before each release. It checks Markdown, the LLM navigation index, issue-template YAML and citation metadata. Temporary HTTP rate limits require a manual check; do not silently report success. GitHub Actions checks deterministic content generation and local links on every change, including same-repository links in the LLM index. Network checks run explicitly so third-party outages do not block unrelated contributions.

Use pull requests for subsequent changes. A release with an incorrect link can be corrected in a patch release without deleting history. Do not synchronize private product source into this repository.
