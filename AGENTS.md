# MapManager Web Components — Agent Instructions

## Repository role

This repository contains reusable browser components shared by static web and
Python/NiceGUI clients. It is an npm workspace; each component under
`packages/` is an independent package with its own public API and dependencies.

Do not add CloudScope-specific orchestration, AcqStore transport behavior, or
application-specific Python behavior here. Generic, isolated Python adapters
that expose these browser components to environments such as Jupyter or
NiceGUI may live under `integrations/`; they must consume the components'
public browser APIs and must not duplicate analysis, rendering, state, or
transport behavior owned elsewhere.

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

During implementation, run focused unit tests and type checks for the affected
workspace. Provide the user with exact commands for broader repository checks,
Playwright tests, and embedded-client smoke tests. Do not repeatedly run the
complete repository check unless the user explicitly requests it or the scope
and risk of the change justify it.

The user normally performs interactive browser, PyQt5 WebEngine, and host-
application smoke tests on the local macOS development machine. Clearly report
which checks were run and which remain for the user.

## Git discipline

Preserve unrelated changes. Do not commit, push, create branches, or publish
packages unless explicitly requested.
