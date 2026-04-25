# `awesome-nest/payload-type-suffix`

`@Payload()` parameters on NATS controllers and `data` arguments to `AbstractClientService#send` / `#emit` must use a type whose name ends with an allowed payload suffix.

## Rationale

NATS message payloads cross service boundaries. If a controller accepts an arbitrary type — say, a database entity or a response DTO — those types are coupled across services and drift over time. Restricting payloads to dedicated `*PayloadDto` (and pagination DTOs) makes the wire contract explicit, greppable, and decoupled from internal representations.

## Default allowed suffixes

- `PayloadDto`
- `PageOptionsDto`
- `CursorPageOptionsDto`

## Examples

### Incorrect

```ts
class FooController {
  @MessagePattern('foo.create')
  create(@Payload() payload: CreateFooDto) {} // wrong suffix
}

class FooClient extends AbstractClientService<Action> {
  createFoo(input: CreateFooDto) {
    return this.send(Action.CREATE, input); // wrong suffix
  }
}
```

### Correct

```ts
class FooController {
  @MessagePattern('foo.create')
  create(@Payload() payload: CreateFooPayloadDto) {}
}

class FooClient extends AbstractClientService<Action> {
  createFoo(input: CreateFooPayloadDto) {
    return this.send(Action.CREATE, input);
  }
}
```

## Options

```ts
type Options = {
  allowedSuffixes?: string[];          // default: ['PayloadDto', 'PageOptionsDto', 'CursorPageOptionsDto']
  enforcePayloadParamName?: boolean;   // default: false — when true, parameter must be named `payload`
};
```

## When not to use

If your project doesn't use NATS or doesn't have a payload-DTO naming convention.
