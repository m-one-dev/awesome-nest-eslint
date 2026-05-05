# @m-one-dev/awesome-nest-eslint

Opinionated ESLint plugin with NestJS-aware, TypeScript-aware rules used across m-one projects.

## Install

```bash
npm install -D @m-one-dev/awesome-nest-eslint
# or
pnpm add -D @m-one-dev/awesome-nest-eslint
# or
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
| `awesome-nest/unique-endpoint-dtos` | error | all |
| `awesome-nest/dto-must-extend-abstract-or-base` | error | `**/*.dto.ts`, `**/dto/**/*.ts` |

`configs.all` enables every rule at error severity, no file scoping.

## Rules

- [`awesome-nest/no-typeorm-finder-methods`](./docs/rules/no-typeorm-finder-methods.md) — bans TypeORM entity-read finders, auto-fixes to `createQueryBuilder` chains.
- [`awesome-nest/no-unused-injectable`](./docs/rules/no-unused-injectable.md) — flags `@Injectable()` services that are only registered in `@Module()` decorators (or nowhere) and never consumed.
- [`awesome-nest/dto-must-extend-abstract-or-base`](./docs/rules/dto-must-extend-abstract-or-base.md) — DTOs must transitively extend `AbstractDto` / `BaseDto`.
- [`awesome-nest/payload-type-suffix`](./docs/rules/payload-type-suffix.md) — NATS payload types must end with `PayloadDto` / pagination DTO suffixes.
- [`awesome-nest/unique-endpoint-dtos`](./docs/rules/unique-endpoint-dtos.md) — each endpoint slot (`@Body`, `@Query`, response) must use its own DTO across the project.

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
pnpm install
pnpm build
pnpm test
```

## Releasing

Releases are tag-driven. Bump the version in `package.json`, commit, then tag:

```bash
git add package.json
git commit -m "chore: bump version to x.y.z"
git tag vx.y.z
git push --follow-tags
```

The `publish.yml` workflow runs `install → build → test → pnpm publish` on every `v*` tag and pushes to npmjs.com using the `NPM_TOKEN` repository secret.
