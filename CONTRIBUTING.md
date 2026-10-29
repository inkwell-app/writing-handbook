# Contributing

Contribute original, practical workflows, templates, examples or verified resource corrections. Explain who the change helps and how you checked it. Keep product availability and pricing on the canonical product pages instead of duplicating details that will become stale.

1. Fork the repository and create a branch.
2. Edit the relevant Markdown or `resources.json`. Never edit the generated directory inside README directly.
3. Use Node 22.18+ and pnpm 10.20.0. Run `pnpm install --frozen-lockfile --ignore-scripts`, `pnpm generate`, `pnpm typecheck`, and `pnpm test`. These commands also validate workflow links and local heading anchors. Tooling is TypeScript; readers need no runtime to copy the templates.
4. Check external destinations with `pnpm links`. Markdown, `llms.txt`, issue-template YAML and citation metadata are included. Same-repository blob links are checked locally; after publication, `pnpm links --published` also checks them on GitHub. Report temporary failures honestly; do not remove useful sources solely because they rate-limit a checker.
5. Open a pull request explaining the reader’s task, provenance and verification.

Use invented examples or material you have rights to contribute under MIT. Do not upload private drafts, personal information or copied screenplay passages. External datasets keep their own licenses. Contributions are reviewed by Inkwell maintainers; a proposed product feature is not a shipped capability.

## Editorial review

A workflow names its reader's task, required inputs, usable output and completion criteria. A new template should explain an ambiguous field with a filled example. A substantial new technique needs an original worked case readers can inspect, including a limitation or a rejected option. Keep synthetic examples visibly labeled; do not turn invented numbers into external evidence.

The generated directory contains first-party Inkwell resources only, using canonical HTTPS destinations on `www.inkwell.software` or `app.inkwell.software`. Keep those destinations in `resources.json`; contextual workflow links use the same records. Keep IDs stable when correcting destinations.

External tools and research belong in the README's **Open tools and research** table. Name the owner, preserve the source's license attribution and use its clean URL. Every entry should help a specific writing task and resolve to a maintained destination. Avoid duplicate resources, affiliate links, keyword lists and unverified product claims.

Follow the [code of conduct](CODE_OF_CONDUCT.md). Maintainers review contributions for useful examples, clear instructions and accurate claims.

Report broken links using the issue template. Send account-specific product questions through the website’s help center. For security concerns, see `SECURITY.md`.
