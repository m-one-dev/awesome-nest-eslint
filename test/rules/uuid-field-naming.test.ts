import * as path from 'node:path';
import { RuleTester } from '@typescript-eslint/rule-tester';

import { uuidFieldNaming } from '../../src/rules/uuid-field-naming.js';

const fixturesDir = path.resolve(import.meta.dirname, '..', 'fixtures');

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: {
        allowDefaultProject: ['*.ts', '*.tsx'],
        defaultProject: 'tsconfig.json',
      },
      tsconfigRootDir: fixturesDir,
    },
  },
});

const preamble = `
  type Uuid = string & { _uuidBrand: undefined };
  type UserId = Uuid;
  type StripeId = string;
`;

ruleTester.run('uuid-field-naming', uuidFieldNaming, {
  valid: [
    {
      name: 'class field: Uuid named userId',
      code: `${preamble}
        class FooDto { userId!: Uuid; }
      `,
    },
    {
      name: 'class field: Uuid[] named userIds',
      code: `${preamble}
        class FooDto { userIds!: Uuid[]; }
      `,
    },
    {
      name: 'class field: bare id of type Uuid',
      code: `${preamble}
        class FooDto { id!: Uuid; }
      `,
    },
    {
      name: 'class field: bare ids of type Uuid[]',
      code: `${preamble}
        class FooDto { ids!: Uuid[]; }
      `,
    },
    {
      name: 'optional Uuid field still passes when name ends with Id',
      code: `${preamble}
        class FooDto { userId?: Uuid; }
      `,
    },
    {
      name: 'Uuid | undefined union still passes',
      code: `${preamble}
        class FooDto { userId!: Uuid | undefined; }
      `,
    },
    {
      name: 'aliased UserId resolves structurally and userId passes',
      code: `${preamble}
        class FooDto { userId!: UserId; }
      `,
    },
    {
      name: 'interface member named projectId',
      code: `${preamble}
        interface IFoo { projectId: Uuid; }
      `,
    },
    {
      name: 'type literal member named projectIds',
      code: `${preamble}
        type Foo = { projectIds: Uuid[] };
      `,
    },
    {
      name: 'constructor parameter property userId: Uuid',
      code: `${preamble}
        class FooService {
          constructor(private readonly userId: Uuid) {}
        }
      `,
    },
    {
      name: 'function parameter named id',
      code: `${preamble}
        function findOne(id: Uuid) { return id; }
      `,
    },
    {
      name: 'rest parameter ids: Uuid[]',
      code: `${preamble}
        function findMany(...ids: Uuid[]) { return ids; }
      `,
    },
    {
      name: 'ReadonlyArray<Uuid> with name userIds',
      code: `${preamble}
        class FooDto { userIds!: ReadonlyArray<Uuid>; }
      `,
    },
    {
      name: 'readonly Uuid[] with name userIds',
      code: `${preamble}
        class FooDto { userIds!: readonly Uuid[]; }
      `,
    },
    {
      name: 'unrelated string field',
      code: `${preamble}
        class FooDto { name!: string; }
      `,
    },
    {
      name: 'paid: boolean is not flagged (regex excludes)',
      code: `${preamble}
        class FooDto { paid!: boolean; }
      `,
    },
    {
      name: 'valid: boolean is not flagged',
      code: `${preamble}
        class FooDto { valid!: boolean; }
      `,
    },
    {
      name: 'idempotencyKey: string is not flagged',
      code: `${preamble}
        class FooDto { idempotencyKey!: string; }
      `,
    },
    {
      name: 'Promise<Uuid> field is skipped',
      code: `${preamble}
        class FooDto { pending!: Promise<Uuid>; }
      `,
    },
    {
      name: 'Record<string, Uuid> with non-id name is skipped',
      code: `${preamble}
        class FooDto { lookup!: Record<string, Uuid>; }
      `,
    },
    {
      name: 'inferred local: const userId = uuid()',
      code: `${preamble}
        declare function genUuid(): Uuid;
        const userId = genUuid();
      `,
    },
    {
      name: 'destructuring: { userId } from { userId: Uuid }',
      code: `${preamble}
        declare const obj: { userId: Uuid };
        const { userId } = obj;
      `,
    },
    {
      name: 'reverse off by default: userId: string allowed',
      code: `${preamble}
        class FooDto { userId!: string; }
      `,
    },
    {
      name: 'reverse on with allowNonUuidNames exempt',
      code: `${preamble}
        class FooDto { stripeCustomerId!: string; }
      `,
      options: [
        {
          enforceReverse: true,
          allowNonUuidNames: ['^stripe.*Id$'],
        },
      ],
    },
    {
      name: 'reverse on: userId: Uuid still passes',
      code: `${preamble}
        class FooDto { userId!: Uuid; }
      `,
      options: [{ enforceReverse: true }],
    },
    {
      name: 'reverse on: userIds: Uuid[] still passes',
      code: `${preamble}
        class FooDto { userIds!: Uuid[]; }
      `,
      options: [{ enforceReverse: true }],
    },
    {
      name: 'object literal under contextual type with correct names',
      code: `${preamble}
        interface IPayload { userId: Uuid; userIds: Uuid[] }
        declare const someId: Uuid;
        declare const someIds: Uuid[];
        const p: IPayload = { userId: someId, userIds: someIds };
      `,
    },
    {
      name: 'inline object literal without contextual type is skipped',
      code: `${preamble}
        declare const someId: Uuid;
        const o = { foo: someId };
      `,
    },
    {
      name: 'function return type does not affect function name',
      code: `${preamble}
        function getUuid(): Uuid { return null as unknown as Uuid; }
      `,
    },
    {
      name: 'private identifier field #userId',
      code: `${preamble}
        class FooService { #userId!: Uuid; }
      `,
    },
    {
      name: 'computed key with Uuid type is skipped',
      code: `${preamble}
        const KEY = 'foo';
        class FooDto { [KEY]!: Uuid; }
      `,
    },
    {
      name: 'any-typed userId is skipped',
      code: `${preamble}
        class FooDto { userId!: any; }
      `,
      options: [{ enforceReverse: true }],
    },
    {
      name: 'unknown-typed userId is skipped',
      code: `${preamble}
        class FooDto { userId!: unknown; }
      `,
      options: [{ enforceReverse: true }],
    },
  ],

  invalid: [
    {
      name: 'class field: Uuid named user',
      code: `${preamble}
        class FooDto { user!: Uuid; }
      `,
      errors: [{ messageId: 'uuidFieldMustEndWithId' }],
    },
    {
      name: 'class field: Uuid[] named users',
      code: `${preamble}
        class FooDto { users!: Uuid[]; }
      `,
      errors: [{ messageId: 'uuidArrayFieldMustEndWithIds' }],
    },
    {
      name: 'class field: Uuid[] mistakenly named userId',
      code: `${preamble}
        class FooDto { userId!: Uuid[]; }
      `,
      errors: [{ messageId: 'uuidArrayFieldMustEndWithIds' }],
    },
    {
      name: 'class field: aliased UserId named user',
      code: `${preamble}
        class FooDto { user!: UserId; }
      `,
      errors: [{ messageId: 'uuidFieldMustEndWithId' }],
    },
    {
      name: 'optional Uuid with bad name',
      code: `${preamble}
        class FooDto { user?: Uuid; }
      `,
      errors: [{ messageId: 'uuidFieldMustEndWithId' }],
    },
    {
      name: 'mixed union Uuid | string with bad name',
      code: `${preamble}
        class FooDto { user!: Uuid | string; }
      `,
      errors: [{ messageId: 'uuidFieldMustEndWithId' }],
    },
    {
      name: 'interface member with bad name',
      code: `${preamble}
        interface IFoo { project: Uuid; }
      `,
      errors: [{ messageId: 'uuidFieldMustEndWithId' }],
    },
    {
      name: 'type literal member with bad name',
      code: `${preamble}
        type Foo = { project: Uuid };
      `,
      errors: [{ messageId: 'uuidFieldMustEndWithId' }],
    },
    {
      name: 'constructor parameter property with bad name',
      code: `${preamble}
        class FooService {
          constructor(private readonly user: Uuid) {}
        }
      `,
      errors: [{ messageId: 'uuidFieldMustEndWithId' }],
    },
    {
      name: 'rest parameter Uuid[] with singular name',
      code: `${preamble}
        function findMany(...id: Uuid[]) { return id; }
      `,
      errors: [{ messageId: 'uuidArrayFieldMustEndWithIds' }],
    },
    {
      name: 'destructuring binding with bad name (renamed)',
      code: `${preamble}
        declare const obj: { userId: Uuid };
        const { userId: user } = obj;
      `,
      errors: [{ messageId: 'uuidFieldMustEndWithId' }],
    },
    {
      name: 'function parameter local Uuid with bad name',
      code: `${preamble}
        function foo(user: Uuid) { return user; }
      `,
      errors: [{ messageId: 'uuidFieldMustEndWithId' }],
    },
    {
      name: 'inferred local Uuid with bad name',
      code: `${preamble}
        declare function genUuid(): Uuid;
        const user = genUuid();
      `,
      errors: [{ messageId: 'uuidFieldMustEndWithId' }],
    },
    {
      name: 'string-literal property key with Uuid type',
      code: `${preamble}
        type Foo = { 'user-id': Uuid };
      `,
      errors: [{ messageId: 'uuidFieldMustEndWithId' }],
    },
    {
      name: 'reverse on: userId: string flagged',
      code: `${preamble}
        class FooDto { userId!: string; }
      `,
      options: [{ enforceReverse: true }],
      errors: [{ messageId: 'idSuffixRequiresUuid' }],
    },
    {
      name: 'reverse on: userIds: string[] flagged',
      code: `${preamble}
        class FooDto { userIds!: string[]; }
      `,
      options: [{ enforceReverse: true }],
      errors: [{ messageId: 'idsSuffixRequiresUuidArray' }],
    },
    {
      name: 'reverse on: bare id: string flagged',
      code: `${preamble}
        class FooDto { id!: string; }
      `,
      options: [{ enforceReverse: true }],
      errors: [{ messageId: 'idSuffixRequiresUuid' }],
    },
    {
      name: 'reverse on: numeric userId: number flagged',
      code: `${preamble}
        class FooDto { userId!: number; }
      `,
      options: [{ enforceReverse: true }],
      errors: [{ messageId: 'idSuffixRequiresUuid' }],
    },
    {
      name: 'reverse on: alias-of-string StripeId flagged',
      code: `${preamble}
        class FooDto { customerId!: StripeId; }
      `,
      options: [{ enforceReverse: true }],
      errors: [{ messageId: 'idSuffixRequiresUuid' }],
    },
    {
      name: 'reverse on: allowNonUuidNames does not exempt forward direction',
      code: `${preamble}
        class FooDto { stripeUser!: Uuid; }
      `,
      options: [
        { enforceReverse: true, allowNonUuidNames: ['^stripe.*$'] },
      ],
      errors: [{ messageId: 'uuidFieldMustEndWithId' }],
    },
  ],
});
