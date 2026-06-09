# Workflow Contracts (Node / Pipeline / Result)

## Terms

- `node` — a graph element and executable unit in an AST graph.
- `edge` — visual connection on the canvas.
- `connection` — semantic relation between ports.
- `workflow` — a connected group of nodes that solves one user goal.
- `step` — execution level in a workflow (topological layer). All nodes at the same topological level can run in parallel; level order defines the execution order.
- `pipeline` — a complete user-visible workflow (what a user starts and monitors as one chain).
- `result` — final output payload of a pipeline.

## Node contract (minimum)

Every node must satisfy:

- `id: string`
- `type: ProductionNodeType`
- `position: { x, y }`
- `size: { width, height }`
- `status: NodeStatus`
- `data` matching node type schema
- optional: `locked`

## Port contract

Port contract is shared across canvas, validator and serialization:

- `id`
- `label`
- `kind` (text/image/preset/reference/subject/location/publication/video/audio)
- `side` (`input` or `output`)

The same visual concept (circle points) and semantic concept (kind constraints) must stay aligned.

## Execution graph contract

A node result is valid only after all required upstream nodes for required inputs are valid.

Execution level is a topological level:

- level 0: source nodes
- level N: depends on level N-1 upstream data (unless cycle exists)

Cycles in runtime contracts are invalid and must be surfaced as invalid graph.

## Value contract (MVP)

Current payload policy (explicitly bounded for stability):

- `text`
- `text[]` (text collection)
- `image`
- `image[]` (image collection)
- `publication`

Node outputs can additionally expose legacy/internal structures where needed, but only these are allowed at workflow boundaries for now.

### Text variants

For text payload we support, as internal value representation:

- plain text
- formatted text (Lexical-like serialized structure)
- html/text fallback when needed by external integrations
- json representation where explicitly required

## Node and pipeline persistence rules

UI state of a node must include a persisted display state:

- `state: 'Expanded' | 'Collapsed'`

This is a schema-level requirement so users do not lose collapsed/expanded layout between sessions.

Backward compatibility rule:
- if existing boolean `collapsed` is loaded, it must be normalized to `Expanded/Collapsed`.

## What is in contract and what is deferred

- Contract for `ExecutionMode` / backend-run mode: deferred for backend integration.
- Endpoint strategy (`single endpoint vs per-pipeline endpoint`): deferred until backend discussion closes.
- New primitive value kinds beyond the list above: deferred.
