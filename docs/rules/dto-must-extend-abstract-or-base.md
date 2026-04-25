# `awesome-nest/dto-must-extend-abstract-or-base`

Classes whose names end in `Dto` must transitively extend `AbstractDto` or `BaseDto`.

## Rationale

DTOs in m-one services share infrastructure (validation, serialization, OpenAPI metadata) provided by `AbstractDto` / `BaseDto`. Forgetting to extend a base class produces DTOs that silently lose this behavior, with bugs surfacing only in production. This rule catches the omission at lint time.

## Allowlisted names

The following names are exempt (they *are* the base classes):

- `AbstractDto`
- `BaseDto`
- `TranslatableDto`
- `AbstractTranslationDto`

## Examples

### Incorrect

```ts
class CreateUserDto {
  email!: string;
}

class UpdateUserDto extends SomeUnrelatedClass {
  name?: string;
}
```

### Correct

```ts
class CreateUserDto extends BaseDto {
  email!: string;
}

class UpdateUserDto extends AbstractDto {
  name?: string;
}

class TenantUpdateUserDto extends UpdateUserDto {} // transitive — fine
```

## Options

None.

## When not to use

If your project doesn't use `AbstractDto` / `BaseDto` conventions, this rule won't apply meaningfully — turn it off.

## Scope in `recommended`

Applied only to `**/*.dto.ts` and `**/dto/**/*.ts` to avoid false positives on test fixtures and ad-hoc helper classes.
