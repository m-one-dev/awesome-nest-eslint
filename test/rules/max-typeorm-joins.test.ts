import * as path from 'node:path';
import { RuleTester } from '@typescript-eslint/rule-tester';

import { maxTypeormJoins } from '../../src/rules/max-typeorm-joins.js';

const fixturesDir = path.resolve(import.meta.dirname, '..', 'fixtures');
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
    leftJoin(_a: string, _b: string, _c?: string, _p?: Record<string, unknown>): SelectQueryBuilder<T> { return this; }
    innerJoin(_a: string, _b: string, _c?: string, _p?: Record<string, unknown>): SelectQueryBuilder<T> { return this; }
    leftJoinAndSelect(_a: string, _b: string, _c?: string, _p?: Record<string, unknown>): SelectQueryBuilder<T> { return this; }
    innerJoinAndSelect(_a: string, _b: string, _c?: string, _p?: Record<string, unknown>): SelectQueryBuilder<T> { return this; }
    leftJoinAndMapOne(_p: string, _a: any, _b: string, _c?: string, _q?: Record<string, unknown>): SelectQueryBuilder<T> { return this; }
    leftJoinAndMapMany(_p: string, _a: any, _b: string, _c?: string, _q?: Record<string, unknown>): SelectQueryBuilder<T> { return this; }
    innerJoinAndMapOne(_p: string, _a: any, _b: string, _c?: string, _q?: Record<string, unknown>): SelectQueryBuilder<T> { return this; }
    innerJoinAndMapMany(_p: string, _a: any, _b: string, _c?: string, _q?: Record<string, unknown>): SelectQueryBuilder<T> { return this; }
    where(_c: string | ((qb: SelectQueryBuilder<T>) => string), _p?: Record<string, unknown>): SelectQueryBuilder<T> { return this; }
    andWhere(_c: string | ((qb: SelectQueryBuilder<T>) => string), _p?: Record<string, unknown>): SelectQueryBuilder<T> { return this; }
    select(_s: string | string[]): SelectQueryBuilder<T> { return this; }
    from<U>(_e: new () => U, _alias: string): SelectQueryBuilder<U> { return null as any; }
    subQuery(): SelectQueryBuilder<T> { return new SelectQueryBuilder<T>(); }
    getQuery(): string { return ''; }
    getOne(): Promise<T | null> { return null as any; }
    getMany(): Promise<T[]> { return null as any; }
  }
  class Repository<Entity> {
    createQueryBuilder(_alias: string): SelectQueryBuilder<Entity> { return null as any; }
  }
  class User { id!: string; }
  class Profile { id!: string; }
`;

ruleTester.run('max-typeorm-joins', maxTypeormJoins, {
  valid: [
    {
      name: 'valid: zero joins',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async list() {
            return this.userRepository.createQueryBuilder('user').getMany();
          }
        }
      `,
    },
    {
      name: 'valid: exactly 3 joins (at the boundary)',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async list() {
            return this.userRepository
              .createQueryBuilder('user')
              .leftJoin('user.a', 'a')
              .leftJoin('user.b', 'b')
              .leftJoin('user.c', 'c')
              .getMany();
          }
        }
      `,
    },
    {
      name: 'valid: 3 joins mixing different join families',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async list() {
            return this.userRepository
              .createQueryBuilder('user')
              .leftJoin('user.a', 'a')
              .innerJoinAndSelect('user.b', 'b')
              .leftJoinAndMapOne('user.c', Profile, 'c', 'c.userId = user.id')
              .getMany();
          }
        }
      `,
    },
    {
      name: 'valid: sequential joins on a local var totaling 3',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async list() {
            const qb = this.userRepository.createQueryBuilder('user');
            qb.leftJoin('user.a', 'a');
            qb.leftJoin('user.b', 'b');
            qb.leftJoin('user.c', 'c');
            return qb.getMany();
          }
        }
      `,
    },
    {
      name: 'valid: non-TypeORM object with leftJoin method',
      filename: testFilename,
      code: `${preamble}
        class CustomBuilder {
          leftJoin(_a: string, _b: string): CustomBuilder { return this; }
          createQueryBuilder(_a: string): CustomBuilder { return this; }
        }
        const cb = new CustomBuilder();
        cb.createQueryBuilder('x').leftJoin('a', 'a').leftJoin('b', 'b').leftJoin('c', 'c').leftJoin('d', 'd');
      `,
    },
    {
      name: 'valid: custom max=5, chain with 5 joins',
      filename: testFilename,
      options: [{ max: 5 }],
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async list() {
            return this.userRepository
              .createQueryBuilder('user')
              .leftJoin('user.a', 'a')
              .leftJoin('user.b', 'b')
              .leftJoin('user.c', 'c')
              .leftJoin('user.d', 'd')
              .leftJoin('user.e', 'e')
              .getMany();
          }
        }
      `,
    },
    {
      name: 'valid: two independent QBs in the same function, each with 3 joins',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async list() {
            const a = await this.userRepository
              .createQueryBuilder('u')
              .leftJoin('u.a', 'a')
              .leftJoin('u.b', 'b')
              .leftJoin('u.c', 'c')
              .getMany();
            const b = await this.userRepository
              .createQueryBuilder('u2')
              .leftJoin('u2.a', 'a')
              .leftJoin('u2.b', 'b')
              .leftJoin('u2.c', 'c')
              .getMany();
            return [a, b];
          }
        }
      `,
    },
    {
      name: 'valid: QB passed to helper function is not tracked across boundary',
      filename: testFilename,
      code: `${preamble}
        function addJoins(qb: SelectQueryBuilder<User>) {
          qb.leftJoin('u.a', 'a').leftJoin('u.b', 'b').leftJoin('u.c', 'c').leftJoin('u.d', 'd');
        }
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async list() {
            const qb = this.userRepository.createQueryBuilder('user');
            addJoins(qb);
            return qb.getMany();
          }
        }
      `,
    },
    {
      name: 'valid: joins inside a subQuery callback do not count toward outer',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async list() {
            return this.userRepository
              .createQueryBuilder('user')
              .leftJoin('user.a', 'a')
              .leftJoin('user.b', 'b')
              .leftJoin('user.c', 'c')
              .andWhere((sub) => {
                sub.subQuery().leftJoin('x.a', 'a').leftJoin('x.b', 'b').leftJoin('x.c', 'c').leftJoin('x.d', 'd').leftJoin('x.e', 'e');
                return 'EXISTS (...)';
              })
              .getMany();
          }
        }
      `,
    },
  ],

  invalid: [
    {
      name: 'invalid: 4-join chain reports on the 4th join',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async list() {
    return this.userRepository
      .createQueryBuilder('user')
      .leftJoin('user.a', 'a')
      .leftJoin('user.b', 'b')
      .leftJoin('user.c', 'c')
      .leftJoin('user.d', 'd')
      .getMany();
  }
}
`,
      errors: [{ messageId: 'tooManyJoins', data: { count: 4, max: 3 } }],
    },
    {
      name: 'invalid: 6-join chain reports exactly once (on the 4th)',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async list() {
    return this.userRepository
      .createQueryBuilder('user')
      .leftJoin('user.a', 'a')
      .leftJoin('user.b', 'b')
      .leftJoin('user.c', 'c')
      .leftJoin('user.d', 'd')
      .leftJoin('user.e', 'e')
      .leftJoin('user.f', 'f')
      .getMany();
  }
}
`,
      errors: [{ messageId: 'tooManyJoins', data: { count: 4, max: 3 } }],
    },
    {
      name: 'invalid: 2-in-chain + 2-sequential-on-local-var totals 4',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async list() {
    const qb = this.userRepository
      .createQueryBuilder('user')
      .leftJoin('user.a', 'a')
      .leftJoin('user.b', 'b');
    qb.leftJoin('user.c', 'c');
    qb.leftJoin('user.d', 'd');
    return qb.getMany();
  }
}
`,
      errors: [{ messageId: 'tooManyJoins', data: { count: 4, max: 3 } }],
    },
    {
      name: 'invalid: innerJoin family is counted',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async list() {
    return this.userRepository
      .createQueryBuilder('user')
      .innerJoin('user.a', 'a')
      .innerJoin('user.b', 'b')
      .innerJoin('user.c', 'c')
      .innerJoin('user.d', 'd')
      .getMany();
  }
}
`,
      errors: [{ messageId: 'tooManyJoins', data: { count: 4, max: 3 } }],
    },
    {
      name: 'invalid: leftJoinAndSelect family is counted',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async list() {
    return this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.a', 'a')
      .leftJoinAndSelect('user.b', 'b')
      .leftJoinAndSelect('user.c', 'c')
      .leftJoinAndSelect('user.d', 'd')
      .getMany();
  }
}
`,
      errors: [{ messageId: 'tooManyJoins', data: { count: 4, max: 3 } }],
    },
    {
      name: 'invalid: leftJoinAndMapMany family is counted',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async list() {
    return this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndMapMany('user.a', Profile, 'a', 'a.userId = user.id')
      .leftJoinAndMapMany('user.b', Profile, 'b', 'b.userId = user.id')
      .leftJoinAndMapMany('user.c', Profile, 'c', 'c.userId = user.id')
      .leftJoinAndMapMany('user.d', Profile, 'd', 'd.userId = user.id')
      .getMany();
  }
}
`,
      errors: [{ messageId: 'tooManyJoins', data: { count: 4, max: 3 } }],
    },
    {
      name: 'invalid: custom max=1 reports on the 2nd join',
      filename: testFilename,
      options: [{ max: 1 }],
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async list() {
    return this.userRepository
      .createQueryBuilder('user')
      .leftJoin('user.a', 'a')
      .leftJoin('user.b', 'b')
      .getMany();
  }
}
`,
      errors: [{ messageId: 'tooManyJoins', data: { count: 2, max: 1 } }],
    },
  ],
});
