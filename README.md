# @m-one-dev/awesome-nest-eslint

Opinionated ESLint plugin with NestJS-aware, TypeScript-aware rules used across m-one projects.

## Install

This package is published to GitHub Packages under the `@m-one-dev` scope. You need a GitHub PAT with `read:packages` to install.

Add an `.npmrc` at the consumer repo root:

```
@m-one-dev:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

Then:

```bash
yarn add -D @m-one-dev/awesome-nest-eslint
```

## Usage (flat config)

```ts
// eslint.config.ts
import awesomeNest from '@m-one-dev/awesome-nest-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig(
  // ... your other configs
  awesomeNest.configs.recommended,
);
```

`configs.recommended` registers the plugin and turns on:

| Rule | Severity | Files |
|---|---|---|
| `awesome-nest/no-typeorm-finder-methods` | error | all |
| `awesome-nest/payload-type-suffix` | error | all |
| `awesome-nest/dto-must-extend-abstract-or-base` | error | `**/*.dto.ts`, `**/dto/**/*.ts` |

`configs.all` enables every rule at error severity, no file scoping.

## Rules

- [`awesome-nest/no-typeorm-finder-methods`](./docs/rules/no-typeorm-finder-methods.md) — bans TypeORM entity-read finders, auto-fixes to `createQueryBuilder` chains.
- [`awesome-nest/dto-must-extend-abstract-or-base`](./docs/rules/dto-must-extend-abstract-or-base.md) — DTOs must transitively extend `AbstractDto` / `BaseDto`.
- [`awesome-nest/payload-type-suffix`](./docs/rules/payload-type-suffix.md) — NATS payload types must end with `PayloadDto` / pagination DTO suffixes.

## Requirements

All rules are TypeScript-aware. Your ESLint config must use `@typescript-eslint/parser` with a typed parser service:

```ts
parserOptions: {
  projectService: true,
  // or: project: ['./tsconfig.json'],
  tsconfigRootDir: import.meta.dirname,
}
```

Peer dependencies:

- `eslint >= 9`
- `typescript >= 5.4`
- `@typescript-eslint/parser >= 8`

## Development

```bash
yarn install
yarn build
yarn test
```

## Releasing

Releases are tag-driven. Bump and tag:

```bash
yarn version <patch|minor|major>
git push --follow-tags
```

The `publish.yml` workflow runs `install → build → test → yarn npm publish` on every `v*` tag and pushes to GitHub Packages with the workflow `GITHUB_TOKEN`.
