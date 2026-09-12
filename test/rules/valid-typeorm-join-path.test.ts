import * as path from 'node:path';
import { RuleTester } from '@typescript-eslint/rule-tester';

import { validTypeormJoinPath } from '../../src/rules/valid-typeorm-join-path.js';

const fixturesDir = path.resolve(import.meta.dirname, '..', 'fixtures');
// The directory name is load-bearing: the rule only treats a builder as
// TypeORM's when its declaration lives under a `/typeorm/` path, which is what
// lets the inline stub below stand in for the real class.
const testFilename = path.join(fixturesDir, 'typeorm', 'in-test.ts');

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: {
        allowDefaultProject: ['*.ts', '*.tsx', 'typeorm/*.ts'],
        defaultProject: 'tsconfig.json',
      },
      tsconfigRootDir: fixturesDir,
    },
  },
});

const preamble = `
  class SelectQueryBuilder<T> {
    leftJoin(_a: any, _b: string, _c?: string, _p?: Record<string, unknown>): SelectQueryBuilder<T> { return this; }
    innerJoin(_a: any, _b: string, _c?: string, _p?: Record<string, unknown>): SelectQueryBuilder<T> { return this; }
    leftJoinAndSelect(_a: any, _b: string, _c?: string, _p?: Record<string, unknown>): SelectQueryBuilder<T> { return this; }
    innerJoinAndSelect(_a: any, _b: string, _c?: string, _p?: Record<string, unknown>): SelectQueryBuilder<T> { return this; }
    leftJoinAndMapOne(_p: string, _a: any, _b: string, _c?: string, _q?: Record<string, unknown>): SelectQueryBuilder<T> { return this; }
    leftJoinAndMapMany(_p: string, _a: any, _b: string, _c?: string, _q?: Record<string, unknown>): SelectQueryBuilder<T> { return this; }
    innerJoinAndMapOne(_p: string, _a: any, _b: string, _c?: string, _q?: Record<string, unknown>): SelectQueryBuilder<T> { return this; }
    innerJoinAndMapMany(_p: string, _a: any, _b: string, _c?: string, _q?: Record<string, unknown>): SelectQueryBuilder<T> { return this; }
    andWhere(_c: string | ((qb: SelectQueryBuilder<T>) => string), _p?: Record<string, unknown>): SelectQueryBuilder<T> { return this; }
    subQuery(): SelectQueryBuilder<T> { return new SelectQueryBuilder<T>(); }
    getMany(): Promise<T[]> { return null as any; }
  }
  class Repository<Entity> {
    createQueryBuilder(_alias?: string): SelectQueryBuilder<Entity> { return null as any; }
  }
  function Column(..._a: any[]): PropertyDecorator { return () => {}; }
  function ManyToOne(..._a: any[]): PropertyDecorator { return () => {}; }
  function OneToMany(..._a: any[]): PropertyDecorator { return () => {}; }
  function OneToOne(..._a: any[]): PropertyDecorator { return () => {}; }

  class Company {
    @Column() name!: string;
    @OneToMany(() => Profile) profiles!: Profile[];
  }
  class Profile {
    @Column() bio!: string;
    @ManyToOne(() => Company) company?: Company;
    @ManyToOne(() => User) user?: User;
  }
  class User {
    @Column() name!: string;
    @Column() companyId!: string;
    @OneToMany(() => Profile) profiles!: Profile[];
    @OneToOne(() => Profile) mainProfile?: Profile;
    /** Undecorated on purpose: a *AndMap* target, never joinable itself. */
    latestProfile?: Profile;
  }
`;

const wrap = (body: string) => `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async list() {
${body}
  }
}
`;

ruleTester.run('valid-typeorm-join-path', validTypeormJoinPath, {
  valid: [
    {
      name: 'valid: relation on the root alias',
      filename: testFilename,
      code: wrap(`    return this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.profiles', 'profile')
      .getMany();`),
    },
    {
      name: 'valid: relation reached through a previously joined alias',
      filename: testFilename,
      code: wrap(`    return this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.profiles', 'profile')
      .leftJoinAndSelect('profile.company', 'company')
      .getMany();`),
    },
    {
      name: 'valid: alias introduced by an entity-class join is usable downstream',
      filename: testFilename,
      code: wrap(`    return this.userRepository
      .createQueryBuilder('user')
      .innerJoin(Profile, 'profile', 'profile.userId = user.id')
      .leftJoinAndSelect('profile.company', 'company')
      .getMany();`),
    },
    {
      name: 'valid: raw table-name join carries no relation path to check',
      filename: testFilename,
      code: wrap(`    return this.userRepository
      .createQueryBuilder('user')
      .innerJoin('profiles_table', 'p', 'p.user_id = user.id')
      .getMany();`),
    },
    {
      name: 'valid: joins on a builder held in a local variable',
      filename: testFilename,
      code: wrap(`    const qb = this.userRepository.createQueryBuilder('user');
    qb.leftJoinAndSelect('user.profiles', 'profile');
    qb.leftJoinAndSelect('profile.company', 'company');

    return qb.getMany();`),
    },
    {
      name: 'valid: chained joins off a local variable resolve past the first',
      filename: testFilename,
      code: wrap(`    const qb = this.userRepository.createQueryBuilder('user');

    qb.leftJoinAndSelect('user.profiles', 'profile')
      .leftJoinAndSelect('profile.company', 'company');

    return qb.getMany();`),
    },
    {
      name: 'valid: *AndMap* maps onto an undecorated property',
      filename: testFilename,
      code: wrap(`    return this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndMapOne('user.latestProfile', Profile, 'profile', 'profile.userId = user.id')
      .getMany();`),
    },
    {
      name: 'valid: nested property path is left to TypeORM',
      filename: testFilename,
      code: wrap(`    return this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.mainProfile.company', 'company')
      .getMany();`),
    },
    {
      name: 'valid: non-literal relation path is not guessed at',
      filename: testFilename,
      code: `${preamble}
declare const relationPath: string;
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async list() {
    return this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect(relationPath, 'x')
      .getMany();
  }
}
`,
    },
    {
      name: 'valid: joins inside a subQuery have their own alias scope',
      filename: testFilename,
      code: wrap(`    return this.userRepository
      .createQueryBuilder('user')
      .andWhere((sub) => {
        sub.subQuery().leftJoin('other.thing', 'thing');

        return 'EXISTS (...)';
      })
      .getMany();`),
    },
    {
      name: 'valid: a look-alike builder outside TypeORM is ignored',
      filename: testFilename,
      code: `${preamble}
class CustomBuilder {
  leftJoinAndSelect(_a: string, _b: string): CustomBuilder { return this; }
  createQueryBuilder(_a: string): CustomBuilder { return this; }
}
const cb = new CustomBuilder();
cb.createQueryBuilder('x').leftJoinAndSelect('x.nonsense', 'n');
`,
    },
    {
      name: 'valid: aliasless createQueryBuilder anchors nothing',
      filename: testFilename,
      code: wrap(`    return this.userRepository
      .createQueryBuilder()
      .leftJoinAndSelect('user.profiles', 'profile')
      .getMany();`),
    },
  ],

  invalid: [
    {
      name: 'invalid: property does not exist on the root entity',
      filename: testFilename,
      code: wrap(`    return this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.doesNotExist', 'x')
      .getMany();`),
      errors: [
        {
          messageId: 'unknownProperty',
          data: { property: 'doesNotExist', entity: 'User' },
        },
      ],
    },
    {
      name: 'invalid: property exists but is a plain column',
      filename: testFilename,
      code: wrap(`    return this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.companyId', 'company')
      .getMany();`),
      errors: [
        {
          messageId: 'notARelation',
          data: { property: 'companyId', entity: 'User' },
        },
      ],
    },
    {
      name: 'invalid: property exists but carries no decorator at all',
      filename: testFilename,
      code: wrap(`    return this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.latestProfile', 'profile')
      .getMany();`),
      errors: [
        {
          messageId: 'notARelation',
          data: { property: 'latestProfile', entity: 'User' },
        },
      ],
    },
    {
      name: 'invalid: alias was never introduced',
      filename: testFilename,
      code: wrap(`    return this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('profile.company', 'company')
      .getMany();`),
      errors: [
        {
          messageId: 'unknownAlias',
          data: { alias: 'profile', available: "'user'" },
        },
      ],
    },
    {
      name: 'invalid: alias used before the join that introduces it',
      filename: testFilename,
      code: wrap(`    return this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('profile.company', 'company')
      .leftJoinAndSelect('user.profiles', 'profile')
      .getMany();`),
      errors: [
        {
          messageId: 'unknownAlias',
          data: { alias: 'profile', available: "'user'" },
        },
      ],
    },
    {
      name: 'invalid: bad property past the first join of a chain off a local',
      filename: testFilename,
      code: wrap(`    const qb = this.userRepository.createQueryBuilder('user');

    qb.leftJoinAndSelect('user.profiles', 'profile')
      .leftJoinAndSelect('profile.nope', 'x');

    return qb.getMany();`),
      errors: [
        {
          messageId: 'unknownProperty',
          data: { property: 'nope', entity: 'Profile' },
        },
      ],
    },
    {
      name: 'invalid: bad property on a joined alias',
      filename: testFilename,
      code: wrap(`    return this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.profiles', 'profile')
      .leftJoinAndSelect('profile.nope', 'x')
      .getMany();`),
      errors: [
        {
          messageId: 'unknownProperty',
          data: { property: 'nope', entity: 'Profile' },
        },
      ],
    },
    {
      name: 'invalid: *AndMap* target property does not exist',
      filename: testFilename,
      code: wrap(`    return this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndMapOne('user.missingTarget', Profile, 'profile', 'profile.userId = user.id')
      .getMany();`),
      errors: [
        {
          messageId: 'unknownMapProperty',
          data: { property: 'missingTarget', entity: 'User' },
        },
      ],
    },
    {
      name: 'invalid: both a bad map target and a bad relation path',
      filename: testFilename,
      code: wrap(`    return this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndMapMany('user.missingTarget', 'user.alsoMissing', 'profile')
      .getMany();`),
      errors: [
        {
          messageId: 'unknownMapProperty',
          data: { property: 'missingTarget', entity: 'User' },
        },
        {
          messageId: 'unknownProperty',
          data: { property: 'alsoMissing', entity: 'User' },
        },
      ],
    },
  ],
});
