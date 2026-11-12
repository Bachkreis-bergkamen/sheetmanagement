# Security

Sheetmanagement handles member names, email addresses and an orchestra's Google data, so security reports are taken seriously.

## Reporting a vulnerability

Please **don't open a public issue**. Report it privately through [GitHub's security advisories](https://github.com/Bachkreis-bergkamen/sheetmanagement/security/advisories/new). You'll get an answer within a week.

Helpful to include: what's affected, how to reproduce it (the demo at https://noten-demo.bachkreis.workers.dev or `pnpm dev:demo` is fine for that), and what an attacker could do with it.

## Supported versions

Only the latest version on `main` gets fixes. Deployments update by redeploying.

## Scope

In scope: this repository's code. Out of scope: the public demo's sample data (it's invented and resets), Cloudflare and Google themselves, and individual deployments' configuration. Please don't test against an orchestra's real deployment.
