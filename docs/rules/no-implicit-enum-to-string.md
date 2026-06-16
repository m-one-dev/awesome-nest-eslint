# `awesome-nest/no-implicit-enum-to-string`

Bans implicitly passing a **string enum** value where a plain `string` is expected:

```ts
enum Role { Admin = 'admin' }

function grant(role: string) {}

grant(Role.Admin); // ← flagged
```

TypeScript **accepts** this — a string-enum member is assignable to `string` — so the compiler is silent. This rule surfaces it anyway.

## Rationale

Two problems hide behind that silent assignment:

1. **Nominal hygiene.** The enum identity is silently degraded to a bare string. The thing that was a `Role` is now "just a string" at the call site, and nothing records that it came from `Role`. Usually the signature should have accepted the enum (`role: Role`) or the call should have converted explicitly.
2. **Refactor safety.** If the enum's *value* later changes (`Admin = 'admin'` → `Admin = 'ADMIN'`), every site that leaned on the raw string silently changes behavior, with no type error to catch it.

Surfacing each occurrence forces a deliberate decision: is this sink really a `string`, or should it speak the enum's type?

## What counts

The check is **type-based**, not syntactic — it fires on any expression whose static type is a string enum, however it's written:

```ts
grant(Role.Admin);                 // member access
const r = Role.Admin; grant(r);    // variable holding the member
function fwd(role: Role) { grant(role); } // forwarded enum-typed value
```

It fires across every `string` **sink**, not just call arguments:

```ts
grant(Role.Admin);                       // call / method / constructor / decorator argument
const s: string = Role.Admin;            // variable annotation
function f(): string { return Role.Admin; } // return position
let x: string; x = Role.Admin;           // assignment
const o: { k: string } = { k: Role.Admin }; // object property
const a: string[] = [Role.Admin];        // array element
```

A sink "expects a string" when its type has a bare `string` constituent and the enum is accepted **only** through it — so `string | undefined` fires, but a sink typed as the enum, `unknown`, or `any` does not.

## Examples

### Incorrect

```ts
enum Lang { En = 'en' }

cls.set(ContextType.Language, Lang.En); // set(key: string, value: string)
dto.groups = [Role.Admin];              // groups: string[]
const header: string = Lang.En;
```

### Correct

Make the sink speak the enum's type:

```ts
function grant(role: Role) {}
grant(Role.Admin);
```

Or convert explicitly, accepting that the value is now decoupled from the enum:

```ts
grant(String(Role.Admin));
grant(`${Role.Admin}`);
grant(Role.Admin.toString());
```

Or, for a deliberate exception, disable with a reason:

```ts
// eslint-disable-next-line awesome-nest/no-implicit-enum-to-string
// CLS store is keyed by raw strings; ContextType is the canonical key source.
cls.set(ContextType.Language, Lang.En);
```

## How it works

For every value expression the rule asks the type checker two questions:

1. Is the expression's type a string enum? (Every constituent is an `EnumLiteral` whose value is a `StringLiteral`. This excludes numeric enum members — already rejected by TS at a string sink — and plain string-literal unions like `'a' | 'b'`, which are not enums.)
2. Is the expression's **contextual type** (the type the surrounding position expects) one that accepts the enum only via a bare `string`? It decomposes the contextual type, requires a bare-`string` constituent, and confirms no remaining constituent accepts the enum on its own.

Explicit conversions need no special-casing: `String(x)` and `` `${x}` `` hand their operand a contextual type of `any`, and `.toString()` makes the value a real `string` — none present a bare-`string` sink to a string-enum-typed expression, so none fire. Likewise comparisons (`s === Role.Admin`), `switch`/`case`, and `+` concatenation are not sinks (no contextual `string`), so they are left alone.

## A note on `string | EnumType`

You cannot opt a sink out by typing it `string | Role`. Because every string-enum member is a **subtype** of `string`, TypeScript collapses `string | Role` to plain `string` — the union is erased and indistinguishable from `string`. To accept the enum, type the sink as the **enum itself** (`role: Role`), or as `unknown` / `any`.

## Options

None.

## When not to use

If your codebase deliberately treats certain string enums as interchangeable with their raw values in many places (e.g. enum members used as `class-transformer` serialization groups), this rule will be noisy. Prefer narrowing the offending sink's type to the enum, or disable the rule for that file/pattern, rather than sprinkling `String()` to mute it — `String()` silences the lint without addressing the refactor-safety concern.

## Related

- `awesome-nest/no-double-cast-laundering` — sibling rule that bans laundering a type past the checker through `unknown`/`any`.
