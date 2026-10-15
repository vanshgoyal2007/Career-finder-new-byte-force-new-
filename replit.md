# CareerPilot

CareerPilot helps students and early-career professionals discover live jobs and internships, understand evidence-based matches, save listings, and track applications.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/careerpilot run typecheck` — check the CareerPilot web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required secret: `TINYFISH_API_KEY` — server-side TinyFish REST API key. Add it in Replit Secrets; never put it in frontend code.
- Required env: `DATABASE_URL` — Postgres connection string (not used for CareerPilot v1 saved data)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/careerpilot/` — desktop-first CareerPilot React/Vite app
- `artifacts/api-server/src/routes/careerpilot.ts` and `careerpilot-service.ts` — TinyFish-backed search and verification endpoints
- `lib/api-spec/openapi.yaml` — source of truth for the generated API contract
- `lib/api-client-react/` — generated React Query client hooks
- CareerPilot preferences, saved listings, and application tracking currently persist in this browser's local storage only.

## Architecture decisions

- TinyFish Search discovers pages; TinyFish Fetch reads the listings; TinyFish Agent is used only for explicit verification when fetched evidence is insufficient.
- The TinyFish credential stays server-side and is sent using the documented `X-API-Key` header.
- No account system is enabled in v1; saved jobs and tracker data are device/browser-local and do not sync across devices.

## Product

- Live job and internship discovery from multiple job boards and company career pages, with evidence-based match scoring and listing verification.
- Local-only saved jobs, editable preferences, and application tracking.

## User preferences

- Desktop-first web app; do not add mobile-specific navigation or mobile onboarding in this phase.
- Keep listings and eligibility information factual; never use fabricated jobs, counts, or scores.

## Gotchas

- TinyFish Search/Fetch use daily allowances; Agent requests may use TinyFish account credits.
- Search results are live and may be partial; preserve successful sources when another source fails.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
