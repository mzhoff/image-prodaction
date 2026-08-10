# Architecture Refactoring

## Goal

Prepare the current product for the next large feature without changing its
external product contracts. The refactoring keeps the frontend aligned with
Feature-Sliced Design and the backend aligned with domain-driven boundaries.

## Completed plan

1. Preserve the existing feature work in `main` and continue in a dedicated
   refactoring branch.
2. Establish executable quality gates for lint, types, architecture, cycles,
   file size and test coverage.
3. Split backend repositories, services, provider adapters, workers, route
   handlers and executable-pipeline operations by responsibility.
4. Split frontend page composition, feature models, technical hooks, UI blocks
   and pure helpers along FSD boundaries.
5. Remove every legacy file-size exception; all implementation files now obey
   the 300-line limit.
6. Add focused regression tests for extracted domain and transformation rules.
7. Enforce the new gates in pull-request CI.
8. Audit dependencies and fix production high-severity findings without forced
   breaking downgrades.

## Architecture decisions

- Frontend dependencies flow downward: `app → pages → widgets → features →
  entities → shared`.
- Backend domain modules flow from stable contracts into core, then use-case
  orchestration, then infrastructure adapters.
- Next.js route files remain thin HTTP adapters.
- The executable pipeline runtime remains inside the modular monolith until a
  real consumer or operational pressure justifies extraction.
- UI components do not own network workflows; page/feature models coordinate
  asynchronous state and expose explicit actions.

## Automated acceptance criteria

- ESLint: zero warnings.
- TypeScript: no errors.
- Architecture: no upward FSD imports, forbidden backend dependencies or
  undocumented cycles.
- File size: every implementation `.ts`/`.tsx` file is at most 300 lines.
- Unit tests: all discovered tests pass.
- Coverage: lines 65%, branches 70%, functions 60% or higher.
- Database schema and production build pass.
- Production dependency audit contains no high or critical findings.

## Known dependency constraint

Drizzle Kit 0.31.10 still brings a deprecated development-only esbuild loader
with a moderate advisory. npm's automatic force fix proposes a breaking Drizzle
downgrade, so it is intentionally not applied. The CI production gate blocks
high and critical findings; this transitive dev advisory should be removed when
Drizzle publishes a compatible dependency update.
