# MapManager Web Components — Agent Instructions

## Repository role

This repository contains reusable browser components shared by static web and
Python/NiceGUI clients. It is an npm workspace; each component under
`packages/` is an independent package with its own public API and dependencies.

Do not add CloudScope-specific orchestration, AcqStore transport behavior, or
Python adapter code here. Those concerns belong to their consuming repositories.

## Architecture

- Keep framework-independent engines separate from rendering frameworks.
- Keep Plotly, canvas, Vue, and Custom Element adapters at visual boundaries.
- Do not make one workspace package depend on another without a demonstrated
  shared requirement.
- Use TypeScript and TSDoc-compatible comments for exported APIs.
- Prefer KISS and DRY without workspace orchestration frameworks.

## Commands

Run from the repository root:

```bash
npm ci
npm run check
```

Run one package with npm's `--workspace` option.

## Verification

Run focused tests while developing, followed by the root `npm run check`.
Browser behavior must also be inspected in the relevant standalone and embedded
client when GUI integration changes.

## Git discipline

Preserve unrelated changes. Do not commit, push, create branches, or publish
packages unless explicitly requested.
