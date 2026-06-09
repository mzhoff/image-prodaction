# Reverie Image Production

Node-based image production pipeline prototype for Reverie.

The current MVP is a local Next.js app for building image workflows on a canvas:

- import image references;
- extract structured text layers from an image through OpenRouter;
- connect text or image outputs between nodes;
- generate images from prompt, references, aspect ratio and model settings;
- store the local graph and image assets in the browser.

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run dev:local
```

Open [http://localhost:3004](http://localhost:3004).

Before using real AI calls, fill `OPENROUTER_API_KEY` in `.env.local`.
The local `.env.local` file is ignored by git and must not be committed.

## Documentation

- [Local setup](./docs/local-setup.md)
- [Repository structure](./docs/repository-structure.md)
- [OpenRouter node flow](./docs/openrouter-node-flow.md)
- [MVP plan](./docs/mvp-plan.md)
- [MVP risks and open questions](./docs/mvp-risks-and-questions.md)
- [Phase 2 plan](./docs/phase-2-plan.md)
- [Phase 3 plan](./docs/phase-3-plan.md)
- [Phase 4 plan](./docs/phase-4-plan.md)
- [Coding standards](./docs/coding-standards.md)
- [Workflow contracts](./docs/workflow-contracts.md)
- [Quality gates](./docs/quality-gates.md)

## Useful Scripts

```bash
npm run dev:local   # Start local app on port 3004
npm run dev         # Start Next.js on default port 3000
npm run typecheck   # Run TypeScript checks
npm run test        # Run focused unit tests
npm run test:workflow-contract  # Contract-level tests
npm run build       # Build production bundle
```

## Git Hygiene

Commit `.env.example`, documentation and source code.
Do not commit `.env.local`, `.next`, `node_modules`, screenshots, or local cache files.
