# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Generosity Incident Management — a monorepo with separate `backend/` and `frontend/` directories (each has its own `package.json` and `node_modules`).

## Architecture

### Backend (`backend/`)

- **Infrastructure**: SST v4 (Ion) deploying to AWS — config in `sst.config.ts`
- **Runtime**: Hono web framework on AWS Lambda via Function URL (`src/index.ts`)
- **Auth**: AWS Cognito UserPool with email-based usernames, SRP + password auth flows
- **AWS SDKs**: Cognito Identity Provider, S3, S3 presigner
- **Validation**: Zod v4
- **Build**: esbuild bundling to `dist/index.js` (target: node20)
- **SST resources** are linked to the Lambda function (UserPool, client) and accessed via `sst` module's `Resource`

### Frontend (`frontend/`)

- **Framework**: Vue 3 with Composition API (`<script setup lang="ts">`)
- **State**: Pinia (composition store style — `defineStore` with `ref`/`computed`)
- **Routing**: Vue Router 5 with `createWebHistory`
- **Build**: Vite 7
- **Linting/Formatting**: Biome 2 — **tabs for indentation, double quotes**
- **Testing**: Vitest with jsdom environment, `@vue/test-utils`
- **Path alias**: `@/` maps to `./src/`

### Shared Patterns

- API responses use `{ success, data?, error? }` format (see `backend/src/lib/api-response.ts`)
- Types use `readonly` properties for immutability (see `backend/src/auth/auth.types.ts`)

## Commands

### Backend

```sh
cd backend
npm install
npm run dev          # SST dev mode (local Lambda emulation)
npm run build        # esbuild bundle
npm run deploy       # build → zip → update Lambda
```

### Frontend

```sh
cd frontend
npm install
npm run dev          # Vite dev server
npm run build        # Type-check + Vite build
npm run test:unit    # Vitest (all tests)
npm run type-check   # vue-tsc
npm run lint         # Biome check --write (auto-fix)
```

Run a single test file:
```sh
cd frontend && npx vitest run src/__tests__/App.spec.ts
```

## Code Style

### Frontend (Biome enforced)

- Indent with **tabs**
- **Double quotes** for strings
- Imports auto-organized by Biome

### Backend

- Standard TypeScript style (spaces, single quotes in existing code)
- ESM (`"type": "module"`)
