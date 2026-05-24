# `prefer-raw-terminal-on-select`

Forces raw-row terminals (`getRawOne` / `getRawMany`) with an explicit generic type argument whenever a TypeORM `SelectQueryBuilder` chain contains `.select(...)` or `.addSelect(...)`.

`SelectQueryBuilder.getOne()` / `getMany()` hydrate full entity instances from the result. Once you've narrowed the projection with `.select(...)` (or extended it with `.addSelect(...)`), the row shape no longer matches the entity — TypeORM still tries to hydrate, returning an instance with most fields undefined. The intent at that point is almost always raw rows, so the terminal should be `getRawOne` / `getRawMany` with an explicit result type.

## Rule details

### Triggers

- A `CallExpression` whose receiver type resolves to TypeORM's `SelectQueryBuilder<E>` (or `QueryBuilder<E>`).
- The chain contains `.select(...)` or `.addSelect(...)`, either inline or via a same-scope variable (e.g. `const qb = repo.createQueryBuilder('x'); qb.select(...); qb.getOne();`).
- The terminal is one of: `getOne`, `getMany`, `getOneOrFail`, `getManyAndCount`, `getRawOne`, `getRawMany`.

### Behaviour by terminal

| Terminal | Disposition |
|---|---|
| `getOne` | Auto-fix → `getRawOne<{}>()` |
| `getMany` | Auto-fix → `getRawMany<{}>()` |
| `getRawOne` / `getRawMany` without generic | Auto-fix: insert `<{}>` |
| `getRawOne` / `getRawMany` with any generic | Allowed (no error) |
| `getOneOrFail`, `getManyAndCount` | Report only — these change runtime semantics; rewrite manually |
| `getCount`, `getExists`, `getRawAndEntities`, `execute`, `stream`, `getQuery` | Allowed |

The auto-fix inserts `<{}>` as a placeholder; replace it with an explicit row shape type that matches your `.select()` projection.

## Examples

### ❌ Incorrect

```ts
this.restaurantSaveRepository
  .createQueryBuilder('restaurantSave')
  .select(['restaurantSave.restaurantId'])
  .getOne();
```

### ✅ Correct

```ts
this.restaurantSaveRepository
  .createQueryBuilder('restaurantSave')
  .select(['restaurantSave.restaurantId'])
  .getRawOne<{ restaurantId: RestaurantSaveEntity['restaurantId'] }>();
```

## Limitations

- Cross-function variable flow is not tracked. If a builder is mutated by a method called on it, declare `.select` in the same function scope.
- Conditional expression branches (`(cond ? qb1 : qb2).getOne()`) are not analysed; flag and rewrite manually if needed.
- The rule does not exclude test files. Disable per line in mock-heavy tests if appropriate.

## When not to use

If you genuinely need entity hydration despite a narrowed projection (TypeORM will fill the selected fields and leave the rest undefined), disable this rule per line.
