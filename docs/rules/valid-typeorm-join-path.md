# valid-typeorm-join-path

Checks that the strings passed to TypeORM's join methods name a real relation on
an alias that actually exists at that point in the query.

TypeORM resolves join paths through entity metadata at `.join()` call time and
throws `Relation with property path X in entity was not found.` when the path is
wrong. Because query builders are routinely mocked in unit tests, that throw
usually surfaces in production rather than in CI.

## Why a lint rule and not types

TypeScript cannot express this. Augmenting `SelectQueryBuilder` through
declaration merging only *adds* overloads — it cannot remove TypeORM's own
`leftJoinAndSelect(property: string, alias: string, ...)`. A stricter overload
that fails to match simply falls through to the permissive one, so the call
compiles either way. See ADR 0055 in the backend workspace.

## What it checks

For all eight join methods — `leftJoin`, `innerJoin`, `leftJoinAndSelect`,
`innerJoinAndSelect`, `leftJoinAndMapOne`, `leftJoinAndMapMany`,
`innerJoinAndMapOne`, `innerJoinAndMapMany`:

- the source alias in `'alias.property'` was introduced earlier in the same
  chain, by `createQueryBuilder` or by a preceding join;
- the property exists on that alias's entity;
- the property is a relation — decorated `@ManyToOne`, `@OneToMany`, `@OneToOne`
  or `@ManyToMany`. A plain `@Column` cannot be joined.

For the `*AndMap*` joins the `mapToProperty` argument is checked for *existence
only*. Mapping onto a non-relation property is the entire point of those
methods, so requiring a relation decorator there would be wrong.

## What it deliberately skips

The rule stays silent rather than guess. It reports nothing when the join is a
raw table name (`innerJoin('threads', 't', …)`), an entity class
(`innerJoin(UserEntity, 'u', …)`), a subquery, a non-literal string, or a nested
property path (`'user.profile.city'`); when the builder's alias comes from a
`.subQuery()` scope or a `createQueryBuilder()` with no alias; and when the
entity type behind an alias cannot be resolved.

It also treats "no relation decorator" as unknown, never as a failure, when the
entity is declared in a `.d.ts` — declaration files strip decorators.

## Examples

Incorrect:

```ts
// `gift` is not a relation on UserRewardEntity — only a `giftId` column exists
qb.createQueryBuilder('userReward').leftJoinAndSelect('userReward.gift', 'gift');

// `profile` is joined after it is used
qb.createQueryBuilder('user')
  .leftJoinAndSelect('profile.company', 'company')
  .leftJoinAndSelect('user.profiles', 'profile');
```

Correct:

```ts
qb.createQueryBuilder('user')
  .leftJoinAndSelect('user.profiles', 'profile')
  .leftJoinAndSelect('profile.company', 'company');
```

## Options

None.
