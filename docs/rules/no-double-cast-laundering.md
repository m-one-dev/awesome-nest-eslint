# `awesome-nest/no-double-cast-laundering`

Bans the double-cast type-laundering pattern:

```ts
expr as unknown as T
expr as any as T
```

Both forms launder a value of one type past the type checker by hopping through a top type (`unknown` / `any`). They defeat the purpose of TypeScript.

## Rationale

A single `expr as T` requires `expr`'s type to overlap with `T` — TypeScript will reject a cast between completely unrelated types. The standard workaround is to go through `unknown` first (or `any`), which always succeeds. That's the laundering pattern.

It is almost always a sign that:

1. The type model is wrong and should be fixed.
2. A type guard or runtime check belongs there instead of an assertion.
3. An external library's types are inadequate (legitimate, but should be isolated in one well-commented adapter, not sprinkled).

Surfacing every instance as a lint error forces a deliberate decision per occurrence.

## Examples

### Incorrect

```ts
const user = raw as unknown as User;
const result = response as any as ApiResult;
return (event as unknown as IndexedEventDto);
```

### Correct

Use a type guard:

```ts
function isUser(value: unknown): value is User {
  return typeof value === 'object' && value !== null && 'id' in value;
}

if (!isUser(raw)) throw new ValidationError('not a user');
const user = raw;
```

Or model the type honestly:

```ts
const user: User = User.parse(raw);
```

Or, when bridging an external library with broken types, isolate the cast in one named helper and disable the rule with a comment explaining why:

```ts
// eslint-disable-next-line awesome-nest/no-double-cast-laundering
// PluginX exports its handler as `unknown` but the runtime contract is well-known.
const handler = pluginX.handler as unknown as PluginHandler;
```

## How it works

The rule fires on `TSAsExpression` whose `expression` is itself a `TSAsExpression` whose `typeAnnotation` is `TSUnknownKeyword` or `TSAnyKeyword`. That is the exact shape of the laundering pattern.

Single casts (`expr as T`), `as const`, and casts through a non-top type (`expr as A as B` where A is concrete) are not flagged.

## Options

None.

## Scope in `recommended`

Applied to all `.ts` files except test files (`**/*.spec.ts`, `**/*.e2e-spec.ts`, `**/test/**`), where mock construction sometimes needs the laundering pattern.

## When not to use

If your codebase legitimately bridges many untyped external surfaces, the noise may exceed the value. Prefer narrowing to a single adapter module and disabling the rule there.

## Related

- ADR 0005 — Typed object literal contract
- `awesome-nest/require-object-literal-anchor` — sibling rule
- `@typescript-eslint/no-explicit-any` — companion built-in rule
