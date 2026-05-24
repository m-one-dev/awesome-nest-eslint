# `awesome-nest/require-client-action-on-nats-pattern`

NATS routing keys must be a non-computed member access on a `*ClientAction` enum.

The rule applies to four sites that together form the complete NATS contract surface:

- `@MessagePattern(...)` decorators (handler side, request/response)
- `@EventPattern(...)` decorators (handler side, fire-and-forget)
- `this.send(...)` / `super.send(...)` inside any `*ClientService` class extending `AbstractClientService` (caller side, request/response)
- `this.emit(...)` / `super.emit(...)` inside any `*ClientService` class extending `AbstractClientService` (caller side, fire-and-forget)

## Rationale

A NATS routing key crosses the wire by string. Whether it is written as `'auth.login'`, `AuthClientAction.LOGIN`, or `getPattern()`, the on-wire bytes are identical. What differs is everything **around** the bytes:

- **Symbol grep affordance.** "Where do we route `JOB_POST_CREATED`?" is a single symbol search when every site reads `XClientAction.JOB_POST_CREATED`. Mix in literals, templates, or rebinds and the search becomes a string-spelunking exercise.
- **Sentry / log aggregation.** Routing keys appear in `RpcException` payloads and timeout messages. Literal divergence collapses distinct routes into noise buckets; symbol convergence groups them correctly.
- **Refactor safety.** Renaming `AuthClientAction.LOGIN` via TypeScript's rename-symbol must update every call site. Any non-symbol form (literal, computed access, variable rebind, function call) silently survives the rename — the first symptom is a NATS timeout in production.

The codebase is currently 100% compliant. This rule prevents the first regression rather than remediating an established drift.

## Examples

### Incorrect

```ts
// Decorator side
@MessagePattern('auth.login')                          // string literal
@MessagePattern(`auth.${kind}`)                        // template literal
@MessagePattern(action)                                // bare-identifier rebind
@MessagePattern(getPattern())                          // function call
@MessagePattern({ cmd: 'auth.login' })                 // object literal
@MessagePattern(AuthClientAction['LOGIN'])             // computed access
@MessagePattern(SomeEnum.LOGIN)                        // wrong enum suffix
@EventPattern('post.created')                          // string literal

// Caller side (inside a *ClientService class)
this.send('auth.login', payload)                       // string literal
this.emit('post.created', payload)                     // string literal
this.send(getPattern(), payload)                       // function call
super.send(SomeEnum.X, payload)                        // wrong enum suffix
```

### Correct

```ts
// Decorator side
@MessagePattern(AuthClientAction.LOGIN)
@EventPattern(SeoIndexClientAction.JOB_POST_CREATED)
@MessagePattern(AuthClientAction.LOGIN as ActionType)        // TS cast unwrapped
@MessagePattern(AuthClientAction.LOGIN!)                     // non-null unwrapped
@MessagePattern(AuthClientAction.LOGIN satisfies ActionType) // satisfies unwrapped
@MessagePattern(Foo.AuthClientAction.LOGIN)                  // namespaced enum

// Caller side
this.send(AuthClientAction.LOGIN, payload)
this.emit(SeoIndexClientAction.JOB_POST_CREATED, payload)
super.send(AuthClientAction.LOGIN, payload)
```

## Detection

The rule uses two AST visitors under one rule name:

- **`Decorator` visitor.** Fires on `@MessagePattern(...)` and `@EventPattern(...)` based on decorator-callee identifier name. No enclosing-class guard — both decorators are owned by `@nestjs/microservices` and unambiguously denote NATS handlers.
- **`CallExpression` visitor.** Fires on `<receiver>.send(...)` and `<receiver>.emit(...)` where the receiver is `this` or `super`, **and** the enclosing class declaration's name matches `/.*ClientService$/`, **and** the class name is not literally `AbstractClientService`. The class-name guard prevents false positives on `WebSocketGateway` (`socket.emit`), Telegram bot handlers (`bot.send`), `EventEmitter`, and similar same-named methods elsewhere in the codebase.

### First-argument shape

The rule recursively unwraps `TSAsExpression`, `TSNonNullExpression`, and `TSSatisfiesExpression` (TypeScript-syntactic noise that does not change semantics). The unwrapped node must be a non-computed `MemberExpression` whose enum-name segment ends in `ClientAction`.

The enum-name segment is:

- The `object` identifier when the member expression is `<Identifier>.<member>` (e.g. `AuthClientAction.LOGIN` → `AuthClientAction`).
- The `object.property` identifier when the member expression is `<Namespace>.<EnumName>.<member>` (e.g. `Foo.AuthClientAction.LOGIN` → `AuthClientAction`).

## Message ids

| Message id | Trigger |
| --- | --- |
| `notMemberExpression` | First argument is a literal, template literal, bare identifier, function call, object literal, spread, or any other non-`MemberExpression` shape after unwrapping. |
| `computedAccess` | First argument is a `MemberExpression` with `computed: true`, e.g. `AuthClientAction['LOGIN']`. |
| `wrongEnumSuffix` | First argument is a non-computed `MemberExpression`, but its enum-name segment does not end in `ClientAction`. |

## Allowed exceptions

- `this.send(...)` / `this.emit(...)` invocations inside the literal `AbstractClientService` class itself — that class receives `pattern: ActionType` as a method parameter and forwards it; variable forwarding is correct at the abstraction boundary and incorrect everywhere else.
- Calls on receivers other than `this`/`super` (e.g. `socket.emit(...)`, `bot.send(...)`, `eventEmitter.emit(...)`) — these are not `AbstractClientService` calls and have no NATS-pattern semantics.
- Calls in classes whose name does not end in `ClientService` — same reason.
- Decorators that are not `@MessagePattern` / `@EventPattern` (e.g. `@SubscribeMessage`).
- Zero-argument `@MessagePattern()` / `@EventPattern()` — TypeScript's type checker already errors on these; the rule skips them silently.

## Autofix

None. Selecting the right `*ClientAction` member requires knowing the action's intent, which is outside ESLint's reach. A naive autofix would mask the problem.

## Options

None.

## Scope in `recommended`

Applied to all `.ts` files except:

- Test files (`**/*.spec.ts`, `**/*.e2e-spec.ts`, `**/test/**`)
- `libs/common-module/src/services/abstract-client.service.ts` — the abstract base class itself

The `AbstractClientService` exclusion is defense-in-depth; the rule's class-name guard already excludes the class by name. Both layers exist so the rule is correct in isolation (without the recommended config) and the recommended config is correct without relying on the rule's internal guard.

## When not to use

If your project does not use `*ClientService` subclasses of `AbstractClientService` for NATS contracts, or if your routing keys do not follow the `*ClientAction` enum convention, this rule does not apply — turn it off.

## Related

- ADR `docs/adr/0003-nats-pattern-source-of-truth-contract.md` — design rationale, alternatives considered, scope decisions.
- Sibling rules: `awesome-nest/no-dto-direct-instantiation`, `awesome-nest/no-builtin-exception-instantiation` — same shape of contract (one invariant, multiple AST entry points, hard error severity).
