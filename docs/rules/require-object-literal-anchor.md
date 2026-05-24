# `awesome-nest/require-object-literal-anchor`

Object literals whose contextual type cannot be inferred by TypeScript must be anchored locally with `{...} satisfies T` (or `{...} as const` for frozen literals).

`{...} as T` is **not** accepted as an anchor — see [Why not `as T`?](#why-not-as-t) below.

## Rationale

Sibling to ADR 0001 (`no-dto-direct-instantiation`). That rule catches "you bypassed the DTO factory by `new`-ing." This rule catches the other bypass: "you skipped the DTO entirely and emitted a raw object literal that happens to have the right field names."

The motivating footgun is loss of contextual-type flow inside short-circuit expressions:

```ts
event: event &&
  ({
    id: event.id,
    // ...
    organizerSlug: event.organizer!.slug,
  }),
```

The outer object's contextual type does **not** flow through `event && ({...})` — the parenthesised binary expression breaks contextual typing. TypeScript infers a fresh anonymous shape for the inner literal. Renaming a DTO field, adding a new required property, or typoing one here produces no diagnostic.

This rule asks TypeScript directly: "does this literal have a contextual type?" If it doesn't, the dev must declare what shape they meant.

## How it works

For every `ObjectExpression` node, the rule queries `checker.getContextualType(node)`:

- **Contextual type present (anything, including `any` / `unknown`)** → fine. TypeScript already has a contract to check.
- **Contextual type missing AND parent is `{...} satisfies T`** → fine.
- **Contextual type missing AND parent is `{...} as const`** → fine.
- **Parent is `{...} as T` (any non-`const` type)** → error ("use `satisfies` instead").
- **Otherwise** → error ("anchor the literal").

## Examples

### Incorrect

```ts
const event =
  hasEvent &&
  ({
    id: src.id,
    title: src.title,
  });
```

```ts
function build() {
  return {
    foo: 1,
    bar: 'x',
  };
}
```

```ts
const cfg = { retries: 3, timeoutMs: 1000 };
```

```ts
const dto = { id: 1, name: 'x' } as UserDto;
```

### Correct

```ts
const event =
  hasEvent &&
  ({
    id: src.id,
    title: src.title,
  } satisfies IndexedActivityEventDto);
```

```ts
function build(): BuildResult {
  return { foo: 1, bar: 'x' };
}
```

```ts
const cfg: ClientConfig = { retries: 3, timeoutMs: 1000 };
```

```ts
const dto = { id: 1, name: 'x' } satisfies UserDto;
```

```ts
const COLOURS = { primary: '#000', secondary: '#fff' } as const;
```

```ts
UserDto.create({ id: 1, name: 'x' });
```

## Why not `as T`?

`as` permits unsafe widening. `{} as UserDto` compiles. `satisfies` does not — it verifies the literal is assignable to `T` without widening it. Same character count, strictly safer. The rule funnels devs to the safer form.

`as const` is different — it produces a deeply readonly literal-typed value rather than asserting an unrelated type. It is allowed.

## Options

None.

## Scope in `recommended`

Applied to all `.ts` files except:

- Test files (`**/*.spec.ts`, `**/*.e2e-spec.ts`, `**/test/**`)
- `**/migrations/**`, `**/database/data-source.ts` — TypeORM codegen and DataSource config
- `**/seeds/**`, `scripts/**` — one-off scripts
- `libs/common-module/src/services/abstract-client.service.ts` — NATS deserialization layer (consistent with `no-dto-direct-instantiation`)

## When not to use

If your codebase relies heavily on inline anonymous object shapes returned from utility helpers (rather than named types), this rule will be noisy and the migration cost may outweigh the benefit.

## Related

- ADR 0005 — Typed object literal contract
- `awesome-nest/no-dto-direct-instantiation` — sibling rule for DTO factory enforcement
- `awesome-nest/no-double-cast-laundering` — sibling rule for laundering casts
- `@typescript-eslint/no-explicit-any` — enable at error severity alongside this rule
