# `awesome-nest/require-use-dto-decorator`

Concrete classes extending `AbstractEntity` (transitively) must have a `@UseDto(SomeDto)` class decorator.

## Rationale

`AbstractEntity.toDto()` reads the DTO class from `this.constructor.prototype.dtoClass`, which is set by the `@UseDto(SomeDto)` decorator. Without `@UseDto`, calling `entity.toDto()` throws at runtime:

> You need to use @UseDto on class (FooEntity) be able to call toDto function

This rule catches the omission at lint time instead of at request time in production.

## Examples

### Incorrect

```ts
class UserEntity extends AbstractEntity {} // missing @UseDto
```

### Correct

```ts
@UseDto(UserDto)
class UserEntity extends AbstractEntity {}
```

## Skipped

- Classes declared with the `abstract` keyword — they're not instantiated, so `.toDto()` is never called on them directly.
- `AbstractEntity` and `AbstractTranslationEntity` themselves (the base classes).
- Classes that don't transitively extend `AbstractEntity` (per the type-checker heritage walk).

## Autofix

The autofix inserts `@UseDto(FooDto)` above the class, deriving the DTO name by replacing the trailing `Entity` suffix with `Dto`:

| Class name | Inserted decorator |
| --- | --- |
| `UserEntity` | `@UseDto(UserDto)` |
| `SkillTranslationEntity` | `@UseDto(SkillTranslationDto)` |
| `Foo` (no `Entity` suffix) | `@UseDto(FooDto)` |

The autofix does **not** add imports for `UseDto` or the DTO class — paths are project-specific. Resolve them via your IDE / `organize-imports`.

## Options

None.

## Scope in `recommended`

Applied to `**/*.entity.ts` and `**/entities/**/*.ts`, excluding test files.

## When not to use

If your project doesn't use the `@UseDto` / `AbstractEntity.toDto()` pattern, turn this rule off.
