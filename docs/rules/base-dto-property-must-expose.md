# `awesome-nest/base-dto-property-must-expose`

Instance properties of classes that extend `BaseDto` (directly or transitively) must carry `@Expose()` or a field decorator (`StringField`, `ClassFieldOptional`, ...).

## Rationale

`BaseDto.create()` runs `plainToInstance` with `excludeExtraneousValues: true`, which keeps only properties that have `@Expose` metadata. A property without it type-checks, is accepted by `Plain<T>`, and is then silently removed — the caller passes it, the instance never has it, and the NATS or HTTP consumer receives nothing. In a non-production `create()` a validator on that property may throw; in production validation is skipped and the value just disappears.

The first run found three live instances:

- `JobPostUpdatedN8nDto.changedFields` — no decorator. The "Job Post Updated" Slack message could never show what changed.
- `UpdateGiftPayloadDto.updateData` — no decorator. The admin gift edit reached payment-service without the edit.
- `UpdateReferralStatusPayloadDto.status` — only `@IsEnum`. The admin referral status change reached applicant-service without the status.

## Why a lint rule and not a test

An undecorated property leaves nothing behind at runtime: TypeScript types are erased and no decorator wrote metadata. A test can only enumerate what metadata records, so it cannot see the property at all — only a check that reads the source can. Unit tests missed all three bugs for the same reason: a hand-written fixture cast `as SomeDto` never goes through `create()`.

## What counts as exposed

A **called** decorator whose name is `Expose`, or matches `/Field(Optional)?$/` — every field decorator in common-module applies `Expose`. Not counted:

- `ApiProperty` — documents the property for OpenAPI without exposing it.
- class-validator decorators (`IsEnum`, `IsFile`, ...) — validate without exposing.
- `@Expose` written without parentheses — it is a factory and decorates nothing.

Matching is by name, like `dto-decorator-optionality-must-match-type`, so a helper that ends in `Field` but does not apply `Expose` would pass. None exist today.

## Why `AbstractDto` is out of scope

Entity-backed DTOs are built with `new dtoClass(entity)`, never `create()`, so nothing strips their properties — an undecorated one leaks onto the wire instead of vanishing. That direction is covered by the DTO contract sweep in common-module (ADR 0054).

## Examples

### Incorrect

```ts
class JobPostUpdatedN8nDto extends BaseDto {
  changedFields!: JobPostChangedFields;
}

class UpdateReferralStatusPayloadDto extends BaseDto {
  @IsEnum(ReferralStatusEnum)
  status!: ReferralStatusEnum;
}
```

### Correct

```ts
class JobPostUpdatedN8nDto extends BaseDto {
  @Expose()
  changedFields!: JobPostChangedFields;
}

class UpdateReferralStatusPayloadDto extends BaseDto {
  @EnumField(() => ReferralStatusEnum, {
    description: 'Status to set on the referral.',
  })
  status!: ReferralStatusEnum;
}
```

A property received by a `@NatsController` needs more than `@Expose()`: its `ValidationPipe` runs with `forbidNonWhitelisted`, which rejects a property that has no class-validator metadata. Prefer the field decorators, which carry both.

## Options

None.

## Scope in `recommended`

Applied to `**/*.dto.ts` and `**/dto/**/*.ts`, alongside `dto-must-extend-abstract-or-base`.
