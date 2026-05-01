# `awesome-nest/no-dto-direct-instantiation`

DTOs must be instantiated through their designated factory:

- **Input DTOs** (subclasses of `BaseDto`) → `SomeDto.create({...})`
- **Entity-backed DTOs** (subclasses of `AbstractDto`) → `entity.toDto()` / `entity.toDtos()`

Direct `new SomeDto(...)` and `plainToInstance(SomeDto, ...)` calls bypass `validateSync` and the `@UseDto` mapping contract.

## Rationale

`BaseDto.create()` runs `class-validator`'s `validateSync` and throws `UnprocessableEntityException` on bad input (in non-production). Calling `new SomeDto(plainObject)` or `plainToInstance(SomeDto, plainObject)` skips validation entirely — bad data flows downstream silently.

For `AbstractDto` subclasses, `entity.toDto()` resolves the DTO class via the `@UseDto` decorator and centralizes the entity → DTO mapping. Calling `new SomeDto(entity)` from handler code duplicates that knowledge across the codebase and breaks the indirection.

## Examples

### Incorrect

```ts
const dto = new GetEmployeeDto(employeeEntity);            // bypasses entity.toDto()
const dto2 = new CreateUserDto({ email: '...' });          // bypasses validation
const dto3 = plainToInstance(CreateUserDto, payload);      // bypasses validation
const dto4 = UtilsProvider.plainToInstance(UserDto, raw);  // bypasses validation
```

### Correct

```ts
const dto = employeeEntity.toDto();
const dtos = employeeEntities.toDtos();
const dto2 = CreateUserDto.create({ email: '...' });
```

## Allowed exceptions

- `new SomeDto(...)` inside `static create()` on the same `SomeDto` class — that **is** the factory implementation.
- The internal `AbstractEntity.toDto()` uses `new dtoClass(this, options)` where `dtoClass` is a variable, not an identifier ending in `Dto` — not flagged.

## Autofix

| Pattern | Autofix |
| --- | --- |
| `new SomeDto({ object literal })` | `SomeDto.create({...})` |
| `plainToInstance(SomeDto, data)` (2 args) | `SomeDto.create(data)` |
| `UtilsProvider.plainToInstance(SomeDto, data)` (2 args) | `SomeDto.create(data)` |
| `new SomeDto(identifier)` | none — caller likely needs `entity.toDto()` |
| `plainToInstance(SomeDto, data, options)` | none — third arg behavior is non-trivial |

## Options

None.

## Scope in `recommended`

Applied to all `.ts` files except:

- Test files (`**/*.spec.ts`, `**/*.e2e-spec.ts`, `**/test/**`)
- `libs/common-module/src/services/abstract-client.service.ts` — NATS deserialization layer for trusted inter-service responses

## When not to use

If your project doesn't use the `BaseDto.create()` / `AbstractEntity.toDto()` conventions, this rule won't apply meaningfully — turn it off.
