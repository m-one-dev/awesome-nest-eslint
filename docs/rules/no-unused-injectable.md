# `awesome-nest/no-unused-injectable`

Flags `@Injectable()` services that are never injected anywhere — i.e. classes
that are only registered in `@Module({ providers: [...] })` arrays (or only
re-exported, or have no references at all) but no other code ever consumes them
via constructor injection, `@Inject()`, `useClass`, factory `inject`, or
`forwardRef`.

This complements [`knip`](https://knip.dev), which catches services that are
never *registered* in a module. This rule catches the opposite: services that
*are* registered but never *consumed*.

## Why

A `@Injectable()` provider that is wired into a module but never injected
anywhere is dead weight: it costs DI graph time at startup, makes the module
graph harder to read, and usually signals either a leftover after a refactor
or a bug (the developer forgot to inject the new service into its consumer).

## Rule details

The rule flags any `@Injectable()`-decorated **named** class declaration whose
class symbol has no references **outside** an `@Module({...})` decorator's
`providers`, `exports`, or `imports` arrays.

A class is exempt if any of the following hold (these are framework
entry-points NestJS invokes directly without anyone "injecting" them):

- A method has any of: `@MessagePattern`, `@EventPattern`, `@SubscribeMessage`,
  `@Cron`, `@Interval`, `@Timeout`, `@Sse`, `@Get`, `@Post`, `@Put`, `@Patch`,
  `@Delete`.
- The class has `@Catch(...)` or `@WebSocketGateway(...)`.
- The class `implements` one of: `OnModuleInit`, `OnModuleDestroy`,
  `OnApplicationBootstrap`, `OnApplicationShutdown`, `BeforeApplicationShutdown`.
- The class `extends` one of: `PassportStrategy`, `BaseExceptionFilter`,
  `WebSocketGateway`.

### Examples

❌ **Incorrect** — `OnlyModuleService` is registered in the module but never injected:

```ts
// only-module.service.ts
@Injectable()
export class OnlyModuleService {
  doStuff() {}
}

// only-module.module.ts
@Module({ providers: [OnlyModuleService] })
export class OnlyModuleModule {}
```

✅ **Correct** — `InjectedService` is consumed via constructor injection:

```ts
// injected.service.ts
@Injectable()
export class InjectedService {
  ping() { return 'pong'; }
}

// consumer.service.ts
@Injectable()
export class ConsumerService {
  constructor(private readonly injected: InjectedService) {}
}
```

✅ **Correct** — `MessagePatternService` is exempt because it has a NATS handler:

```ts
@Injectable()
export class MessagePatternService {
  @MessagePattern('foo.created')
  handle() {}
}
```

## Options

```ts
type Options = [
  {
    exemptDecorators?: string[];
    exemptInterfaces?: string[];
  },
];
```

- `exemptDecorators` — additional class- or method-level decorator names that
  exempt a class from this rule. Useful for in-house framework decorators
  (e.g. `@JobHandler`, `@DomainEventListener`) that imply runtime invocation.
- `exemptInterfaces` — additional `implements` interface names that exempt a
  class.

Both options are additive on top of the built-in lists.

## Requirements

This rule requires a typed parser service. Configure ESLint with
`@typescript-eslint/parser` and either `parserOptions.projectService: true` or
`parserOptions.project: ['./tsconfig.json']`. Without a typed parser the rule
silently no-ops.

## Performance

The rule builds a one-time reverse symbol index per `ts.Program` (cached on a
`WeakMap` keyed by program), then does O(1) lookups per `@Injectable()`
declaration. The first lint of a file in a program walks every source file
once; subsequent lints reuse the cache until the program is invalidated (e.g.
on edit in an IDE).

## When not to use

Disable this rule in projects that resolve providers dynamically (e.g. heavy
use of `ModuleRef.get(SomeService)` with the class only referenced by string
token) — those references won't be matched by the symbol-based analysis.
