import * as path from 'node:path';

import { RuleTester } from '@typescript-eslint/rule-tester';

import { preferRawTerminalOnSelect } from '../../src/rules/prefer-raw-terminal-on-select.js';

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
    select(_s: string | string[]): SelectQueryBuilder<T> { return this; }
    addSelect(_s: string | string[], _alias?: string): SelectQueryBuilder<T> { return this; }
    where(_c: string, _p?: Record<string, unknown>): SelectQueryBuilder<T> { return this; }
    andWhere(_c: string, _p?: Record<string, unknown>): SelectQueryBuilder<T> { return this; }
    leftJoinAndSelect(_a: string, _b: string): SelectQueryBuilder<T> { return this; }
    take(_n: number): SelectQueryBuilder<T> { return this; }
    skip(_n: number): SelectQueryBuilder<T> { return this; }
    clone(): SelectQueryBuilder<T> { return this; }
    getOne(): Promise<T | null> { return null as any; }
    getMany(): Promise<T[]> { return null as any; }
    getOneOrFail(): Promise<T> { return null as any; }
    getManyAndCount(): Promise<[T[], number]> { return null as any; }
    getCount(): Promise<number> { return null as any; }
    getExists(): Promise<boolean> { return null as any; }
    getRawOne<R = unknown>(): Promise<R | undefined> { return null as any; }
    getRawMany<R = unknown>(): Promise<R[]> { return null as any; }
    getRawAndEntities<R = unknown>(): Promise<{ entities: T[]; raw: R[] }> { return null as any; }
    execute(): Promise<unknown> { return null as any; }
    getQuery(): string { return ''; }
  }
  class Repository<E> {
    save(e: E): Promise<E> { return null as any; }
    createQueryBuilder(_alias: string): SelectQueryBuilder<E> { return null as any; }
  }
  class RestaurantSaveEntity { id!: string; restaurantId!: string; userId!: string; }
  class UserEntity { id!: string; email!: string; }
`;

ruleTester.run('prefer-raw-terminal-on-select', preferRawTerminalOnSelect, {
  valid: [
    {
      name: 'no .select in chain → getOne is allowed',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
          async run() {
            return this.restaurantSaveRepository.createQueryBuilder('rs').where('rs.id = :id', { id: 'x' }).getOne();
          }
        }
      `,
    },
    {
      name: '.select with getCount → allowed',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
          async run() {
            return this.restaurantSaveRepository.createQueryBuilder('rs').select(['rs.id']).getCount();
          }
        }
      `,
    },
    {
      name: '.select with getExists → allowed',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
          async run() {
            return this.restaurantSaveRepository.createQueryBuilder('rs').select(['rs.id']).getExists();
          }
        }
      `,
    },
    {
      name: '.select with getRawAndEntities → allowed (no generic enforcement)',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
          async run() {
            return this.restaurantSaveRepository.createQueryBuilder('rs').select(['rs.id']).getRawAndEntities();
          }
        }
      `,
    },
    {
      name: '.select with getRawOne<SomeType> → already correct (any generic is valid)',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
          async run() {
            return this.restaurantSaveRepository.createQueryBuilder('rs').select(['rs.id']).getRawOne<{ id: string }>();
          }
        }
      `,
    },
    {
      name: '.select with getRawMany<Row> → valid (any generic is accepted)',
      filename: testFilename,
      code: `${preamble}
        interface Row { id: string }
        class S {
          constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
          async run() {
            return this.restaurantSaveRepository.createQueryBuilder('rs').select(['rs.id']).getRawMany<Row>();
          }
        }
      `,
    },
    {
      name: '.select with execute() → allowed',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
          async run() {
            return this.restaurantSaveRepository.createQueryBuilder('rs').select(['rs.id']).execute();
          }
        }
      `,
    },
    {
      name: 'unrelated .getOne on a non-QB receiver',
      filename: testFilename,
      code: `${preamble}
        class Custom { select(_s: string[]) { return this; } getOne() { return null; } }
        const c = new Custom();
        const r = c.select(['x']).getOne();
      `,
    },
    {
      name: 'leftJoinAndSelect alone (no .select / .addSelect) → allowed',
      filename: testFilename,
      code: `${preamble}
        class S {
          constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
          async run() {
            return this.restaurantSaveRepository.createQueryBuilder('rs').leftJoinAndSelect('rs.user', 'user').getOne();
          }
        }
      `,
    },
  ],

  invalid: [
    {
      name: 'inline chain: getOne after .select → autofix to getRawOne<{}>',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
  async run() {
    return this.restaurantSaveRepository.createQueryBuilder('rs').select(['rs.restaurantId']).getOne();
  }
}
`,
      errors: [
        {
          messageId: 'useRawTerminal',
          data: {
            method: 'getOne',
            rawMethod: 'getRawOne',
          },
        },
      ],
      output: `${preamble}
class S {
  constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
  async run() {
    return this.restaurantSaveRepository.createQueryBuilder('rs').select(['rs.restaurantId']).getRawOne<{}>();
  }
}
`,
    },
    {
      name: 'inline chain: getMany after .select → autofix to getRawMany<{}>',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
  async run() {
    return this.restaurantSaveRepository.createQueryBuilder('rs').select(['rs.restaurantId', 'rs.userId']).getMany();
  }
}
`,
      errors: [
        {
          messageId: 'useRawTerminal',
          data: {
            method: 'getMany',
            rawMethod: 'getRawMany',
          },
        },
      ],
      output: `${preamble}
class S {
  constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
  async run() {
    return this.restaurantSaveRepository.createQueryBuilder('rs').select(['rs.restaurantId', 'rs.userId']).getRawMany<{}>();
  }
}
`,
    },
    {
      name: 'addSelect triggers the rule',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
  async run() {
    return this.restaurantSaveRepository.createQueryBuilder('rs').addSelect('COUNT(*)', 'cnt').getOne();
  }
}
`,
      errors: [
        {
          messageId: 'useRawTerminal',
          data: {
            method: 'getOne',
            rawMethod: 'getRawOne',
          },
        },
      ],
      output: `${preamble}
class S {
  constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
  async run() {
    return this.restaurantSaveRepository.createQueryBuilder('rs').addSelect('COUNT(*)', 'cnt').getRawOne<{}>();
  }
}
`,
    },
    {
      name: 'imports are not modified — only the method is rewritten',
      filename: testFilename,
      code: `import { Repository } from 'typeorm';
${preamble}
class S {
  constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
  async run() {
    return this.restaurantSaveRepository.createQueryBuilder('rs').select(['rs.id']).getOne();
  }
}
`,
      errors: [{ messageId: 'useRawTerminal' }],
      output: `import { Repository } from 'typeorm';
${preamble}
class S {
  constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
  async run() {
    return this.restaurantSaveRepository.createQueryBuilder('rs').select(['rs.id']).getRawOne<{}>();
  }
}
`,
    },
    {
      name: 'existing getRawOne missing generic → inject {}',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
  async run() {
    return this.restaurantSaveRepository.createQueryBuilder('rs').select(['rs.id']).getRawOne();
  }
}
`,
      errors: [
        {
          messageId: 'requireGeneric',
          data: { method: 'getRawOne' },
        },
      ],
      output: `${preamble}
class S {
  constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
  async run() {
    return this.restaurantSaveRepository.createQueryBuilder('rs').select(['rs.id']).getRawOne<{}>();
  }
}
`,
    },
    {
      name: 'getOneOrFail after .select → suggest-only (no autofix)',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
  async run() {
    return this.restaurantSaveRepository.createQueryBuilder('rs').select(['rs.id']).getOneOrFail();
  }
}
`,
      errors: [
        {
          messageId: 'semanticTerminalNeedsManualRewrite',
          data: { method: 'getOneOrFail' },
        },
      ],
      output: null,
    },
    {
      name: 'getManyAndCount after .select → suggest-only',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
  async run() {
    return this.restaurantSaveRepository.createQueryBuilder('rs').select(['rs.id']).getManyAndCount();
  }
}
`,
      errors: [
        {
          messageId: 'semanticTerminalNeedsManualRewrite',
          data: { method: 'getManyAndCount' },
        },
      ],
      output: null,
    },
    {
      name: 'variable flow: qb.select(...) then qb.getOne()',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
  async run() {
    const qb = this.restaurantSaveRepository.createQueryBuilder('rs');
    qb.select(['rs.id']);
    return qb.getOne();
  }
}
`,
      errors: [
        {
          messageId: 'useRawTerminal',
          data: {
            method: 'getOne',
            rawMethod: 'getRawOne',
          },
        },
      ],
      output: `${preamble}
class S {
  constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
  async run() {
    const qb = this.restaurantSaveRepository.createQueryBuilder('rs');
    qb.select(['rs.id']);
    return qb.getRawOne<{}>();
  }
}
`,
    },
    {
      name: 'walks through .clone() in chain',
      filename: testFilename,
      code: `${preamble}
class S {
  constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
  async run() {
    return this.restaurantSaveRepository.createQueryBuilder('rs').select(['rs.id']).clone().getOne();
  }
}
`,
      errors: [
        {
          messageId: 'useRawTerminal',
          data: {
            method: 'getOne',
            rawMethod: 'getRawOne',
          },
        },
      ],
      output: `${preamble}
class S {
  constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
  async run() {
    return this.restaurantSaveRepository.createQueryBuilder('rs').select(['rs.id']).clone().getRawOne<{}>();
  }
}
`,
    },
    {
      name: 'getOne after .select with existing DeepPartial import — import left alone',
      filename: testFilename,
      code: `import { DeepPartial, Repository } from 'typeorm';
${preamble}
class S {
  constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
  async run() {
    return this.restaurantSaveRepository.createQueryBuilder('rs').select(['rs.id']).getOne();
  }
}
`,
      errors: [{ messageId: 'useRawTerminal' }],
      output: `import { DeepPartial, Repository } from 'typeorm';
${preamble}
class S {
  constructor(private readonly restaurantSaveRepository: Repository<RestaurantSaveEntity>) {}
  async run() {
    return this.restaurantSaveRepository.createQueryBuilder('rs').select(['rs.id']).getRawOne<{}>();
  }
}
`,
    },
  ],
});
