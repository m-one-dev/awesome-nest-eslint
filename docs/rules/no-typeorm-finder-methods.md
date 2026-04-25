# `awesome-nest/no-typeorm-finder-methods`

Disallow TypeORM entity-read finder methods on `Repository`, `EntityManager`, `DataSource.manager`, and transactional `manager` callbacks.

This rule is auto-fixable: it rewrites banned calls into equivalent `createQueryBuilder(...)` chains where it can.

## Rationale

Finder methods (`find`, `findOne`, `findBy`, `findAndCount`, `count`, `exist`, etc.) hide the resulting SQL, make joins/projections inconsistent, and limit observability. The query builder forces every read to be explicit, which composes better, traces cleanly, and stays readable when filters or relations evolve.

## Banned methods

`find`, `findBy`, `findOne`, `findOneBy`, `findOneOrFail`, `findOneByOrFail`, `findAndCount`, `findAndCountBy`, `count`, `countBy`, `exist`, `exists`, `sum`, `average`, `minimum`, `maximum`.

## Examples

### Incorrect

```ts
const user = await userRepository.findOne({ where: { id }, relations: ['profile'] });
const total = await userRepository.count({ where: { active: true } });
```

### Correct

```ts
const user = await userRepository
  .createQueryBuilder('user')
  .leftJoinAndSelect('user.profile', 'profile')
  .where('user.id = :id', { id })
  .getOne();

const total = await userRepository
  .createQueryBuilder('user')
  .where('user.active = :active', { active: true })
  .getCount();
```

## Options

None.

## When not to use

If you don't use TypeORM, or if your codebase has explicitly opted into entity-read finder methods (rare).
