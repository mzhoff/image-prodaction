# Reverie Image Production

Node-based image production workspace for Reverie.

The local contour includes Next.js, PostgreSQL, private S3-compatible storage,
transactional-email capture and a durable AI generation worker:

- import image references;
- extract structured text layers from an image through OpenRouter;
- connect text or image outputs between nodes;
- generate images from prompt, references, aspect ratio and model settings;
- store projects, sessions, assets, provider connections and usage on the backend;
- keep each Workspace OpenRouter key encrypted and isolated.

## Quick Start

```bash
npm install
cp .env.example .env.local
docker compose up --build
```

Open [http://localhost:3004](http://localhost:3004).

Before the first launch, generate the three independent secrets described in
`.env.example`. Connect OpenRouter afterwards in
`Settings → Workspace → AI Providers`; the raw key is never returned to the
browser after it is saved.

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
- [Workspace AI execution architecture](./docs/workspace-ai-execution-architecture.md)
- [Workspace AI execution implementation plan](./docs/workspace-ai-execution-implementation-plan.md)
- [Executable Pipelines architecture](./docs/executable-pipelines-architecture.md)
- [Quality gates](./docs/quality-gates.md)

## Useful Scripts

```bash
npm run dev:local   # Start local app on port 3004
npm run worker      # Start the durable generation worker
npm run dev         # Start Next.js on default port 3000
npm run check:architecture # Verify modular boundaries
npm run typecheck   # Run TypeScript checks
npm run test        # Run focused unit tests
npm run test:generation-persistence-smoke # Verify PostgreSQL + MinIO generation fences
npm run test:workflow-contract  # Contract-level tests
npm run build       # Build production bundle
```

## Git Hygiene

Commit `.env.example`, documentation and source code.
Do not commit `.env.local`, `.next`, `node_modules`, screenshots, or local cache files.
