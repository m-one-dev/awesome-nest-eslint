import * as path from 'node:path';
import { RuleTester } from '@typescript-eslint/rule-tester';

import { noTypeormFinderMethods } from '../../src/rules/no-typeorm-finder-methods.js';

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
  class QueryBuilder<T> {
    where(_c: string, _p?: Record<string, unknown>): QueryBuilder<T> { return this; }
    andWhere(_c: string, _p?: Record<string, unknown>): QueryBuilder<T> { return this; }
    orWhere(_c: string, _p?: Record<string, unknown>): QueryBuilder<T> { return this; }
    leftJoinAndSelect(_a: string, _b: string): QueryBuilder<T> { return this; }
    select(_s: string | string[]): QueryBuilder<T> { return this; }
    orderBy(_c: string, _d?: string, _n?: string): QueryBuilder<T> { return this; }
    addOrderBy(_c: string, _d?: string, _n?: string): QueryBuilder<T> { return this; }
    take(_n: number): QueryBuilder<T> { return this; }
    skip(_n: number): QueryBuilder<T> { return this; }
    withDeleted(): QueryBuilder<T> { return this; }
    cache(_a: any, _b?: any): QueryBuilder<T> { return this; }
    setLock(_m: string): QueryBuilder<T> { return this; }
    getOne(): Promise<T | null> { return null as any; }
    getMany(): Promise<T[]> { return null as any; }
    getCount(): Promise<number> { return null as any; }
    getExists(): Promise<boolean> { return null as any; }
    getManyAndCount(): Promise<[T[], number]> { return null as any; }
  }
  class Repository<Entity> {
    find(_o?: unknown): Promise<Entity[]> { return null as any; }
    findBy(_w: unknown): Promise<Entity[]> { return null as any; }
    findOne(_o: unknown): Promise<Entity | null> { return null as any; }
    findOneBy(_w: unknown): Promise<Entity | null> { return null as any; }
    findOneOrFail(_o: unknown): Promise<Entity> { return null as any; }
    findOneByOrFail(_w: unknown): Promise<Entity> { return null as any; }
    findAndCount(_o?: unknown): Promise<[Entity[], number]> { return null as any; }
    findAndCountBy(_w: unknown): Promise<[Entity[], number]> { return null as any; }
    count(_o?: unknown): Promise<number> { return null as any; }
    countBy(_w: unknown): Promise<number> { return null as any; }
    exist(_o?: unknown): Promise<boolean> { return null as any; }
    exists(_o?: unknown): Promise<boolean> { return null as any; }
    sum(_f: keyof Entity, _o?: unknown): Promise<number | null> { return null as any; }
    average(_f: keyof Entity, _o?: unknown): Promise<number | null> { return null as any; }
    save(e: Entity): Promise<Entity> { return null as any; }
    createQueryBuilder(_alias: string): QueryBuilder<Entity> { return null as any; }
  }
  class TreeRepository<E> extends Repository<E> {}
  class EntityManager {
    find<T>(_e: new () => T, _o?: unknown): Promise<T[]> { return null as any; }
    findOne<T>(_e: new () => T, _o?: unknown): Promise<T | null> { return null as any; }
    findOneBy<T>(_e: new () => T, _w: unknown): Promise<T | null> { return null as any; }
    findAndCount<T>(_e: new () => T, _o?: unknown): Promise<[T[], number]> { return null as any; }
    count<T>(_e: new () => T, _o?: unknown): Promise<number> { return null as any; }
    getRepository<T>(_e: new () => T): Repository<T> { return null as any; }
    transaction<R>(fn: (m: EntityManager) => Promise<R>): Promise<R> { return fn(this); }
  }
  class DataSource {
    manager: EntityManager = new EntityManager();
    getRepository<T>(_e: new () => T): Repository<T> { return null as any; }
    transaction<R>(fn: (m: EntityManager) => Promise<R>): Promise<R> { return fn(this.manager); }
  }
  class BaseEntity {
    static find<T>(this: new () => T, _o?: unknown): Promise<T[]> { return null as any; }
  }
  class User { id!: string; companyId!: string; email!: string; createdAt!: Date; tags!: string[]; }
  function In<T>(_v: readonly T[]): any { return null; }
  function Not<T>(_v: T): any { return null; }
  function IsNull(): any { return null; }
  function LessThan<T>(_v: T): any { return null; }
  function LessThanOrEqual<T>(_v: T): any { return null; }
  function MoreThan<T>(_v: T): any { return null; }
  function MoreThanOrEqual<T>(_v: T): any { return null; }
  function Equal<T>(_v: T): any { return null; }
  function Between<T>(_a: T, _b: T): any { return null; }
  function Like(_p: string): any { return null; }
  function ILike(_p: string): any { return null; }
  function Any<T>(_v: readonly T[]): any { return null; }
  function ArrayContains<T>(_v: readonly T[]): any { return null; }
  function ArrayContainedBy<T>(_v: readonly T[]): any { return null; }
  function ArrayOverlap<T>(_v: readonly T[]): any { return null; }
  function Raw(_fn: any): any { return null; }
  function Or<T>(..._args: T[]): any { return null; }
`;

ruleTester.run('no-typeorm-finder-methods', noTypeormFinderMethods, {
  valid: [
    {
      name: 'valid: createQueryBuilder().getOne()',
      filename: testFilename,
      code: `${preamble}
        class UserService {
          constructor(private readonly userRepository: Repository<User>) {}
          async byId(id: string) {
            return this.userRepository.createQueryBuilder('user').where('user.id = :id', { id }).getOne();
          }
        }
      `,
    },
    {
      name: 'valid: Array.prototype.find is not flagged',
      filename: testFilename,
      code: `${preamble}
        const users: User[] = [];
        const u = users.find((x) => x.id === 'abc');
      `,
    },
    {
      name: 'valid: custom service method named findOne is not flagged',
      filename: testFilename,
      code: `${preamble}
        class UserLookupService {
          findOne(id: string): User { return null as any; }
          findBy(q: string): User[] { return []; }
          find(q: string): User[] { return []; }
          count(): number { return 0; }
        }
        const svc = new UserLookupService();
        const u = svc.findOne('abc');
        const us = svc.findBy('abc');
        const uss = svc.find('abc');
        const n = svc.count();
      `,
    },
    {
      name: 'valid: save() is not banned',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async create(u: User) { return this.userRepository.save(u); }
        }
      `,
    },
    {
      name: 'valid: createQueryBuilder on EntityManager',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly entityManager: EntityManager) {}
          async f() {
            return this.entityManager.transaction(async (m) => m.getRepository(User).createQueryBuilder('u').getOne());
          }
        }
      `,
    },
  ],

  invalid: [
    // -----------------------------------------------------------------
    // baseline: flat where (existing tests)
    // -----------------------------------------------------------------
    {
      name: 'Repository.findOneBy with flat primitive -> autofix to QB.getOne()',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async byId(id: string) {
    return this.userRepository.findOneBy({ id });
  }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findOneBy', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async byId(id: string) {
    return this.userRepository.createQueryBuilder('user')
      .where('user.id = :id', { id })
      .getOne();
  }
}
`,
    },
    {
      name: 'Repository.findBy with flat primitives -> autofix to QB.getMany()',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async list(companyId: string) {
    return this.userRepository.findBy({ companyId });
  }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async list(companyId: string) {
    return this.userRepository.createQueryBuilder('user')
      .where('user.companyId = :companyId', { companyId })
      .getMany();
  }
}
`,
    },
    {
      name: 'Repository.findOne({ where: { flat } }) -> autofix',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async byEmail(email: string) {
    return this.userRepository.findOne({ where: { email } });
  }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findOne', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async byEmail(email: string) {
    return this.userRepository.createQueryBuilder('user')
      .where('user.email = :email', { email })
      .getOne();
  }
}
`,
    },
    {
      name: 'Repository.find({ where: { flat, flat } }) -> autofix with andWhere',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async list(companyId: string, email: string) {
    return this.userRepository.find({ where: { companyId, email } });
  }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'find', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async list(companyId: string, email: string) {
    return this.userRepository.createQueryBuilder('user')
      .where('user.companyId = :companyId', { companyId })
      .andWhere('user.email = :email', { email })
      .getMany();
  }
}
`,
    },
    {
      name: 'Repository.findOneOrFail is error-only (no autofix, changes semantics)',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async byId(id: string) { return this.userRepository.findOneOrFail({ where: { id } }); }
        }
      `,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findOneOrFail', receiver: 'Repository' } }],
      output: null,
    },
    {
      name: 'Repository.findOneByOrFail is error-only',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async byId(id: string) { return this.userRepository.findOneByOrFail({ id }); }
        }
      `,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findOneByOrFail', receiver: 'Repository' } }],
      output: null,
    },
    {
      name: 'Repository.findOneBy with non-flat (object) value bails when relation not joined',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async list() { return this.userRepository.findOneBy({ company: { id: 'x' } as any }); }
        }
      `,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findOneBy', receiver: 'Repository' } }],
      output: null,
    },
    {
      name: 'TreeRepository (subclass) is banned',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly tree: TreeRepository<User>) {}
  async f(id: string) { return this.tree.findOneBy({ id }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findOneBy', receiver: 'TreeRepository' } }],
      output: `${preamble}
class S {
  constructor(private readonly tree: TreeRepository<User>) {}
  async f(id: string) { return this.tree.createQueryBuilder('tree')
      .where('tree.id = :id', { id })
      .getOne(); }
}
`,
    },

    // -----------------------------------------------------------------
    // new terminals (findAndCount/count/exist/exists)
    // -----------------------------------------------------------------
    {
      name: 'Repository.findAndCount() -> getManyAndCount',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async list() { return this.userRepository.findAndCount(); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findAndCount', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async list() { return this.userRepository.createQueryBuilder('user')
      .getManyAndCount(); }
}
`,
    },
    {
      name: 'Repository.findAndCountBy({ x }) -> getManyAndCount with where',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async list(companyId: string) { return this.userRepository.findAndCountBy({ companyId }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findAndCountBy', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async list(companyId: string) { return this.userRepository.createQueryBuilder('user')
      .where('user.companyId = :companyId', { companyId })
      .getManyAndCount(); }
}
`,
    },
    {
      name: 'Repository.count() -> getCount',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async total() { return this.userRepository.count(); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'count', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async total() { return this.userRepository.createQueryBuilder('user')
      .getCount(); }
}
`,
    },
    {
      name: 'Repository.countBy({ x }) -> getCount with where',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async total(companyId: string) { return this.userRepository.countBy({ companyId }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'countBy', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async total(companyId: string) { return this.userRepository.createQueryBuilder('user')
      .where('user.companyId = :companyId', { companyId })
      .getCount(); }
}
`,
    },
    {
      name: 'Repository.exist() -> getExists',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async any() { return this.userRepository.exist(); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'exist', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async any() { return this.userRepository.createQueryBuilder('user')
      .getExists(); }
}
`,
    },
    {
      name: 'Repository.exists({ where }) -> getExists',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async any(email: string) { return this.userRepository.exists({ where: { email } }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'exists', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async any(email: string) { return this.userRepository.createQueryBuilder('user')
      .where('user.email = :email', { email })
      .getExists(); }
}
`,
    },
    {
      name: 'Count terminal strips select/order/take/skip',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async total(companyId: string) {
    return this.userRepository.count({ where: { companyId }, select: ['id'], order: { id: 'ASC' }, take: 10, skip: 0 });
  }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'count', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async total(companyId: string) {
    return this.userRepository.createQueryBuilder('user')
      .where('user.companyId = :companyId', { companyId })
      .getCount();
  }
}
`,
    },

    // -----------------------------------------------------------------
    // aggregates stay error-only
    // -----------------------------------------------------------------
    {
      name: 'Repository.sum is error-only',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async s() { return this.userRepository.sum('id'); }
        }
      `,
      errors: [{ messageId: 'bannedMethod', data: { method: 'sum', receiver: 'Repository' } }],
      output: null,
    },
    {
      name: 'Repository.average is error-only',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async s() { return this.userRepository.average('id'); }
        }
      `,
      errors: [{ messageId: 'bannedMethod', data: { method: 'average', receiver: 'Repository' } }],
      output: null,
    },

    // -----------------------------------------------------------------
    // where operators: clean ten + Any + Array*
    // -----------------------------------------------------------------
    {
      name: 'where: { id: In([...]) } -> IN',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(ids: string[]) { return this.userRepository.findBy({ id: In(ids) }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(ids: string[]) { return this.userRepository.createQueryBuilder('user')
      .where('user.id IN (:...id)', { id: ids })
      .getMany(); }
}
`,
    },
    {
      name: 'where: { id: Equal(x) } -> =',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(x: string) { return this.userRepository.findBy({ id: Equal(x) }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(x: string) { return this.userRepository.createQueryBuilder('user')
      .where('user.id = :id', { id: x })
      .getMany(); }
}
`,
    },
    {
      name: 'where: { id: IsNull() } -> IS NULL',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f() { return this.userRepository.findBy({ id: IsNull() }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f() { return this.userRepository.createQueryBuilder('user')
      .where('user.id IS NULL')
      .getMany(); }
}
`,
    },
    {
      name: 'where: { id: Not(IsNull()) } -> IS NOT NULL',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f() { return this.userRepository.findBy({ id: Not(IsNull()) }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f() { return this.userRepository.createQueryBuilder('user')
      .where('user.id IS NOT NULL')
      .getMany(); }
}
`,
    },
    {
      name: 'where: { id: Not(x) } -> !=',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(x: string) { return this.userRepository.findBy({ id: Not(x) }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(x: string) { return this.userRepository.createQueryBuilder('user')
      .where('user.id != :id', { id: x })
      .getMany(); }
}
`,
    },
    {
      name: 'where: { id: Not(In([...])) } -> NOT IN',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(ids: string[]) { return this.userRepository.findBy({ id: Not(In(ids)) }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(ids: string[]) { return this.userRepository.createQueryBuilder('user')
      .where('user.id NOT IN (:...id)', { id: ids })
      .getMany(); }
}
`,
    },
    {
      name: 'where: { createdAt: LessThan(x) } -> <',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(x: Date) { return this.userRepository.findBy({ createdAt: LessThan(x) }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(x: Date) { return this.userRepository.createQueryBuilder('user')
      .where('user.createdAt < :createdAt', { createdAt: x })
      .getMany(); }
}
`,
    },
    {
      name: 'where: { createdAt: LessThanOrEqual(x) } -> <=',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(x: Date) { return this.userRepository.findBy({ createdAt: LessThanOrEqual(x) }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(x: Date) { return this.userRepository.createQueryBuilder('user')
      .where('user.createdAt <= :createdAt', { createdAt: x })
      .getMany(); }
}
`,
    },
    {
      name: 'where: { createdAt: MoreThan(x) } -> >',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(x: Date) { return this.userRepository.findBy({ createdAt: MoreThan(x) }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(x: Date) { return this.userRepository.createQueryBuilder('user')
      .where('user.createdAt > :createdAt', { createdAt: x })
      .getMany(); }
}
`,
    },
    {
      name: 'where: { createdAt: MoreThanOrEqual(x) } -> >=',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(x: Date) { return this.userRepository.findBy({ createdAt: MoreThanOrEqual(x) }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(x: Date) { return this.userRepository.createQueryBuilder('user')
      .where('user.createdAt >= :createdAt', { createdAt: x })
      .getMany(); }
}
`,
    },
    {
      name: 'where: { createdAt: Between(a, b) } -> BETWEEN with Start/End params',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(a: Date, b: Date) { return this.userRepository.findBy({ createdAt: Between(a, b) }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(a: Date, b: Date) { return this.userRepository.createQueryBuilder('user')
      .where('user.createdAt BETWEEN :createdAtStart AND :createdAtEnd', { createdAtStart: a, createdAtEnd: b })
      .getMany(); }
}
`,
    },
    {
      name: 'where: { email: Like(p) } -> LIKE',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(p: string) { return this.userRepository.findBy({ email: Like(p) }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(p: string) { return this.userRepository.createQueryBuilder('user')
      .where('user.email LIKE :email', { email: p })
      .getMany(); }
}
`,
    },
    {
      name: 'where: { email: ILike(p) } -> ILIKE',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(p: string) { return this.userRepository.findBy({ email: ILike(p) }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(p: string) { return this.userRepository.createQueryBuilder('user')
      .where('user.email ILIKE :email', { email: p })
      .getMany(); }
}
`,
    },
    {
      name: 'where: { id: Any([...]) } -> = ANY',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(ids: string[]) { return this.userRepository.findBy({ id: Any(ids) }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(ids: string[]) { return this.userRepository.createQueryBuilder('user')
      .where('user.id = ANY(:id)', { id: ids })
      .getMany(); }
}
`,
    },
    {
      name: 'where: { tags: ArrayContains([...]) } -> @>',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(t: string[]) { return this.userRepository.findBy({ tags: ArrayContains(t) }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(t: string[]) { return this.userRepository.createQueryBuilder('user')
      .where('user.tags @> :tags', { tags: t })
      .getMany(); }
}
`,
    },
    {
      name: 'where: { tags: ArrayContainedBy([...]) } -> <@',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(t: string[]) { return this.userRepository.findBy({ tags: ArrayContainedBy(t) }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(t: string[]) { return this.userRepository.createQueryBuilder('user')
      .where('user.tags <@ :tags', { tags: t })
      .getMany(); }
}
`,
    },
    {
      name: 'where: { tags: ArrayOverlap([...]) } -> &&',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(t: string[]) { return this.userRepository.findBy({ tags: ArrayOverlap(t) }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(t: string[]) { return this.userRepository.createQueryBuilder('user')
      .where('user.tags && :tags', { tags: t })
      .getMany(); }
}
`,
    },

    // -----------------------------------------------------------------
    // operator bails
    // -----------------------------------------------------------------
    {
      name: 'where: { x: Raw(...) } bails (always)',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async f() { return this.userRepository.findBy({ id: Raw(() => 'now()') }); }
        }
      `,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: null,
    },
    {
      name: 'where: { x: Or(...) } field-level Or bails',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async f() { return this.userRepository.findBy({ id: Or(Equal('a'), Equal('b')) }); }
        }
      `,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: null,
    },
    {
      name: 'where: { tags: Not(Any(...)) } -> NOT (= ANY)',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(t: string[]) { return this.userRepository.findBy({ tags: Not(Any(t)) }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(t: string[]) { return this.userRepository.createQueryBuilder('user')
      .where('NOT (user.tags = ANY(:tags))', { tags: t })
      .getMany(); }
}
`,
    },
    {
      name: 'where: { tags: Not(ArrayContains(...)) } -> NOT (@>)',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(t: string[]) { return this.userRepository.findBy({ tags: Not(ArrayContains(t)) }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(t: string[]) { return this.userRepository.createQueryBuilder('user')
      .where('NOT (user.tags @> :tags)', { tags: t })
      .getMany(); }
}
`,
    },
    {
      name: 'where: { tags: Not(ArrayContainedBy(...)) } -> NOT (<@)',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(t: string[]) { return this.userRepository.findBy({ tags: Not(ArrayContainedBy(t)) }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(t: string[]) { return this.userRepository.createQueryBuilder('user')
      .where('NOT (user.tags <@ :tags)', { tags: t })
      .getMany(); }
}
`,
    },
    {
      name: 'where: { tags: Not(ArrayOverlap(...)) } -> NOT (&&)',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(t: string[]) { return this.userRepository.findBy({ tags: Not(ArrayOverlap(t)) }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(t: string[]) { return this.userRepository.createQueryBuilder('user')
      .where('NOT (user.tags && :tags)', { tags: t })
      .getMany(); }
}
`,
    },
    {
      name: 'where: { id: In(getIds()) } CallExpression arg bails',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async f() { const getIds = (): string[] => []; return this.userRepository.findBy({ id: In(getIds()) }); }
        }
      `,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: null,
    },
    {
      name: 'where: { id: In([...spread]) } SpreadElement bails',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async f(a: string[]) { return this.userRepository.findBy({ id: In([...a]) }); }
        }
      `,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: null,
    },
    {
      name: 'user-defined In() (not from typeorm) is not translated -> bails',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async f() {
            const InLocal = (_v: string[]) => null as any;
            return this.userRepository.findBy({ id: InLocal(['a']) });
          }
        }
      `,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findBy', receiver: 'Repository' } }],
      output: null,
    },

    // -----------------------------------------------------------------
    // OR-array form
    // -----------------------------------------------------------------
    {
      name: 'where: [{ a }, { b }] -> .where().orWhere()',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(companyId: string, email: string) {
    return this.userRepository.find({ where: [{ companyId }, { email }] });
  }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'find', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(companyId: string, email: string) {
    return this.userRepository.createQueryBuilder('user')
      .where('user.companyId = :companyId', { companyId })
      .orWhere('user.email = :email', { email })
      .getMany();
  }
}
`,
    },
    {
      name: 'where: [{ a, b }, { c }] -> branch1 wraps in parens',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(companyId: string, email: string, id: string) {
    return this.userRepository.find({ where: [{ companyId, email }, { id }] });
  }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'find', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(companyId: string, email: string, id: string) {
    return this.userRepository.createQueryBuilder('user')
      .where('(user.companyId = :companyId AND user.email = :email)', { companyId, email })
      .orWhere('user.id = :id', { id })
      .getMany();
  }
}
`,
    },
    {
      name: 'where: [{ id: 1 }, { id: 2 }] dedups :id -> :id_2',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f() { return this.userRepository.find({ where: [{ id: '1' }, { id: '2' }] }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'find', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f() { return this.userRepository.createQueryBuilder('user')
      .where('user.id = :id', { id: '1' })
      .orWhere('user.id = :id_2', { id_2: '2' })
      .getMany(); }
}
`,
    },

    // -----------------------------------------------------------------
    // relations
    // -----------------------------------------------------------------
    {
      name: 'relations: array form',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(id: string) {
    return this.userRepository.findOne({ where: { id }, relations: ['posts', 'comments'] });
  }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findOne', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(id: string) {
    return this.userRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.posts', 'posts')
      .leftJoinAndSelect('user.comments', 'comments')
      .where('user.id = :id', { id })
      .getOne();
  }
}
`,
    },
    {
      name: 'relations: flat object form',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(id: string) {
    return this.userRepository.findOne({ where: { id }, relations: { posts: true, comments: true } });
  }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findOne', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(id: string) {
    return this.userRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.posts', 'posts')
      .leftJoinAndSelect('user.comments', 'comments')
      .where('user.id = :id', { id })
      .getOne();
  }
}
`,
    },
    {
      name: 'relations: nested object form',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(id: string) {
    return this.userRepository.findOne({ where: { id }, relations: { posts: { author: true } } });
  }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findOne', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(id: string) {
    return this.userRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.posts', 'posts')
      .leftJoinAndSelect('posts.author', 'author')
      .where('user.id = :id', { id })
      .getOne();
  }
}
`,
    },
    {
      name: 'relations: alias collision (two branches with same alias) bails',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async f(id: string) {
            return this.userRepository.findOne({ where: { id }, relations: { posts: { author: true }, comments: { author: true } } });
          }
        }
      `,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findOne', receiver: 'Repository' } }],
      output: null,
    },
    {
      name: 'relations: dotted string in array bails',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async f(id: string) {
            return this.userRepository.findOne({ where: { id }, relations: ['posts.author'] });
          }
        }
      `,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findOne', receiver: 'Repository' } }],
      output: null,
    },
    {
      name: 'relations: alias collides with root alias bails',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async f(id: string) {
            return this.userRepository.findOne({ where: { id }, relations: { user: true } });
          }
        }
      `,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findOne', receiver: 'Repository' } }],
      output: null,
    },
    {
      name: 'nested-relation where reuses joined alias',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(cid: string) {
    return this.userRepository.findOne({ where: { company: { id: cid } as any }, relations: { company: true } as any });
  }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findOne', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(cid: string) {
    return this.userRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.company', 'company')
      .where('company.id = :id', { id: cid })
      .getOne();
  }
}
`,
    },
    {
      name: 'nested-relation where without matching relation bails',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async f(cid: string) { return this.userRepository.findOneBy({ company: { id: cid } as any }); }
        }
      `,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findOneBy', receiver: 'Repository' } }],
      output: null,
    },

    // -----------------------------------------------------------------
    // select
    // -----------------------------------------------------------------
    {
      name: 'select: array form',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(id: string) { return this.userRepository.findOne({ where: { id }, select: ['id', 'email'] }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findOne', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(id: string) { return this.userRepository.createQueryBuilder('user')
      .select(['user.id', 'user.email'])
      .where('user.id = :id', { id })
      .getOne(); }
}
`,
    },
    {
      name: 'select: flat object form',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(id: string) { return this.userRepository.findOne({ where: { id }, select: { id: true, email: true } }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findOne', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(id: string) { return this.userRepository.createQueryBuilder('user')
      .select(['user.id', 'user.email'])
      .where('user.id = :id', { id })
      .getOne(); }
}
`,
    },
    {
      name: 'select: nested object matching joined relation',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(id: string) {
    return this.userRepository.findOne({
      where: { id },
      relations: { posts: true } as any,
      select: { id: true, posts: { id: true, title: true } } as any,
    });
  }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findOne', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(id: string) {
    return this.userRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.posts', 'posts')
      .select(['user.id', 'posts.id', 'posts.title'])
      .where('user.id = :id', { id })
      .getOne();
  }
}
`,
    },
    {
      name: 'select: nested without matching relation bails',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async f(id: string) {
            return this.userRepository.findOne({ where: { id }, select: { id: true, posts: { id: true } } as any });
          }
        }
      `,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findOne', receiver: 'Repository' } }],
      output: null,
    },
    {
      name: 'select: { x: false } bails',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async f(id: string) { return this.userRepository.findOne({ where: { id }, select: { id: true, email: false } as any }); }
        }
      `,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findOne', receiver: 'Repository' } }],
      output: null,
    },

    // -----------------------------------------------------------------
    // order
    // -----------------------------------------------------------------
    {
      name: 'order: flat ASC/DESC',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f() {
    return this.userRepository.find({ order: { createdAt: 'DESC', email: 'ASC' } });
  }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'find', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f() {
    return this.userRepository.createQueryBuilder('user')
      .orderBy('user.createdAt', 'DESC')
      .addOrderBy('user.email', 'ASC')
      .getMany();
  }
}
`,
    },
    {
      name: 'order: { direction, nulls } object form',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f() {
    return this.userRepository.find({ order: { createdAt: { direction: 'DESC', nulls: 'FIRST' } as any } });
  }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'find', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f() {
    return this.userRepository.createQueryBuilder('user')
      .orderBy('user.createdAt', 'DESC', 'NULLS FIRST')
      .getMany();
  }
}
`,
    },
    {
      name: 'order: nested matching joined relation',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f() {
    return this.userRepository.find({
      relations: { posts: true } as any,
      order: { posts: { createdAt: 'DESC' } } as any,
    });
  }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'find', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f() {
    return this.userRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.posts', 'posts')
      .orderBy('posts.createdAt', 'DESC')
      .getMany();
  }
}
`,
    },
    {
      name: 'order: nested without matching relation bails',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async f() { return this.userRepository.find({ order: { posts: { createdAt: 'DESC' } } as any }); }
        }
      `,
      errors: [{ messageId: 'bannedMethod', data: { method: 'find', receiver: 'Repository' } }],
      output: null,
    },

    // -----------------------------------------------------------------
    // take/skip/withDeleted/cache/lock
    // -----------------------------------------------------------------
    {
      name: 'take + skip',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(limit: number, offset: number) {
    return this.userRepository.find({ take: limit, skip: offset });
  }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'find', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(limit: number, offset: number) {
    return this.userRepository.createQueryBuilder('user')
      .take(limit)
      .skip(offset)
      .getMany();
  }
}
`,
    },
    {
      name: 'take with non-literal/non-identifier (binary expr) bails',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async f(n: number) { return this.userRepository.find({ take: n + 1 }); }
        }
      `,
      errors: [{ messageId: 'bannedMethod', data: { method: 'find', receiver: 'Repository' } }],
      output: null,
    },
    {
      name: 'withDeleted: true',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f() { return this.userRepository.find({ withDeleted: true }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'find', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f() { return this.userRepository.createQueryBuilder('user')
      .withDeleted()
      .getMany(); }
}
`,
    },
    {
      name: 'withDeleted: false bails',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async f() { return this.userRepository.find({ withDeleted: false }); }
        }
      `,
      errors: [{ messageId: 'bannedMethod', data: { method: 'find', receiver: 'Repository' } }],
      output: null,
    },
    {
      name: 'cache: number literal',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f() { return this.userRepository.find({ cache: 60000 }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'find', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f() { return this.userRepository.createQueryBuilder('user')
      .cache(60000)
      .getMany(); }
}
`,
    },
    {
      name: 'cache: { id, milliseconds }',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f() { return this.userRepository.find({ cache: { id: 'users', milliseconds: 60000 } }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'find', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f() { return this.userRepository.createQueryBuilder('user')
      .cache('users', 60000)
      .getMany(); }
}
`,
    },
    {
      name: 'lock: { mode } string literal',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f() { return this.userRepository.findOne({ lock: { mode: 'pessimistic_write' } } as any); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findOne', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f() { return this.userRepository.createQueryBuilder('user')
      .setLock('pessimistic_write')
      .getOne(); }
}
`,
    },
    {
      name: 'lock: { mode, tables } bails',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async f() { return this.userRepository.findOne({ lock: { mode: 'pessimistic_partial_write', tables: ['user'] } } as any); }
        }
      `,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findOne', receiver: 'Repository' } }],
      output: null,
    },

    // -----------------------------------------------------------------
    // unrecognized option key bails
    // -----------------------------------------------------------------
    {
      name: 'unknown option key bails',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly userRepository: Repository<User>) {}
          async f(id: string) { return this.userRepository.findOne({ where: { id }, mystery: true } as any); }
        }
      `,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findOne', receiver: 'Repository' } }],
      output: null,
    },

    // -----------------------------------------------------------------
    // combined fix: relations + select + where + order + take + skip
    // -----------------------------------------------------------------
    {
      name: 'combined: relations + select + where + order + take + skip',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(companyId: string, limit: number, offset: number) {
    return this.userRepository.findAndCount({
      where: { companyId },
      relations: { posts: true } as any,
      select: { id: true, email: true } as any,
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findAndCount', receiver: 'Repository' } }],
      output: `${preamble}
class S {
  constructor(private readonly userRepository: Repository<User>) {}
  async f(companyId: string, limit: number, offset: number) {
    return this.userRepository.createQueryBuilder('user')
      .leftJoinAndSelect('user.posts', 'posts')
      .select(['user.id', 'user.email'])
      .where('user.companyId = :companyId', { companyId })
      .orderBy('user.createdAt', 'DESC')
      .take(limit)
      .skip(offset)
      .getManyAndCount();
  }
}
`,
    },

    // -----------------------------------------------------------------
    // EM / DataSource autofix
    // -----------------------------------------------------------------
    {
      name: 'EntityManager.findOne(User, { where: { id } }) -> autofix',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly entityManager: EntityManager) {}
  async f(id: string) { return this.entityManager.findOne(User, { where: { id } }); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findOne', receiver: 'EntityManager' } }],
      output: `${preamble}
class S {
  constructor(private readonly entityManager: EntityManager) {}
  async f(id: string) { return this.entityManager.getRepository(User).createQueryBuilder('user')
      .where('user.id = :id', { id })
      .getOne(); }
}
`,
    },
    {
      name: 'EntityManager.findOne(User, {}) empty options -> autofix',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly entityManager: EntityManager) {}
  async f() { return this.entityManager.findOne(User, {}); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findOne', receiver: 'EntityManager' } }],
      output: `${preamble}
class S {
  constructor(private readonly entityManager: EntityManager) {}
  async f() { return this.entityManager.getRepository(User).createQueryBuilder('user')
      .getOne(); }
}
`,
    },
    {
      name: 'manager inside transaction callback -> autofix',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly dataSource: DataSource) {}
  async f() {
    return this.dataSource.transaction(async (m) => m.findOne(User, {}));
  }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'findOne', receiver: 'EntityManager' } }],
      output: `${preamble}
class S {
  constructor(private readonly dataSource: DataSource) {}
  async f() {
    return this.dataSource.transaction(async (m) => m.getRepository(User).createQueryBuilder('user')
      .getOne());
  }
}
`,
    },
    {
      name: 'DataSource.manager.find(User) -> autofix',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly dataSource: DataSource) {}
  async f() { return this.dataSource.manager.find(User); }
}
`,
      errors: [{ messageId: 'bannedMethod', data: { method: 'find', receiver: 'EntityManager' } }],
      output: `${preamble}
class S {
  constructor(private readonly dataSource: DataSource) {}
  async f() { return this.dataSource.manager.getRepository(User).createQueryBuilder('user')
      .getMany(); }
}
`,
    },
    {
      name: 'EntityManager with non-Identifier entity arg bails',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly entityManager: EntityManager) {}
          async f() { const cls = User; return this.entityManager.find(cls as any, {}); }
        }
      `,
      errors: [{ messageId: 'bannedMethod', data: { method: 'find', receiver: 'EntityManager' } }],
      output: null,
    },
  ],
});
