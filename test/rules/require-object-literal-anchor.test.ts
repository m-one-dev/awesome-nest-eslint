import * as path from 'node:path';
import { RuleTester } from '@typescript-eslint/rule-tester';

import { requireObjectLiteralAnchor } from '../../src/rules/require-object-literal-anchor.js';

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
  interface UserDto { id: number; name: string; }
  interface EventDto { id: number; title: string; }
  declare function take(dto: UserDto): void;
  declare function takeLoose(value: any): void;
`;

ruleTester.run(
  'require-object-literal-anchor',
  requireObjectLiteralAnchor,
  {
    valid: [
      {
        name: 'valid: contextual type from variable annotation',
        code: `${preamble}
          const u: UserDto = { id: 1, name: 'a' };
        `,
      },
      {
        name: 'valid: contextual type from function parameter',
        code: `${preamble}
          take({ id: 1, name: 'a' });
        `,
      },
      {
        name: 'valid: satisfies anchor',
        code: `${preamble}
          const u = { id: 1, name: 'a' } satisfies UserDto;
        `,
      },
      {
        name: 'valid: satisfies on short-circuit literal',
        code: `${preamble}
          const flag = true;
          const e = flag && ({ id: 1, title: 't' } satisfies EventDto);
        `,
      },
      {
        name: 'valid: as const',
        code: `
          const COLOURS = { primary: '#000', secondary: '#fff' } as const;
        `,
      },
      {
        name: 'valid: as const satisfies T',
        code: `
          const COLOURS = { primary: '#000', secondary: '#fff' } as const satisfies Record<string, string>;
        `,
      },
      {
        name: 'valid: function return-type provides contextual type',
        code: `${preamble}
          function build(): UserDto {
            return { id: 1, name: 'a' };
          }
        `,
      },
      {
        name: 'valid: arg passed to any-typed function still has contextual type (any)',
        code: `${preamble}
          takeLoose({ id: 1, name: 'a' });
        `,
      },
      {
        name: 'valid: array of literals contextually typed via annotation',
        code: `${preamble}
          const users: UserDto[] = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }];
        `,
      },
    ],

    invalid: [
      {
        name: 'invalid: untyped const initializer',
        code: `
          const cfg = { retries: 3, timeoutMs: 1000 };
        `,
        errors: [{ messageId: 'requireAnchor' }],
      },
      {
        name: 'invalid: short-circuit produces anonymous shape',
        code: `${preamble}
          const flag = true;
          const e = flag && ({ id: 1, title: 't' });
        `,
        errors: [{ messageId: 'requireAnchor' }],
      },
      {
        name: 'invalid: arrow return without annotation',
        code: `
          const build = () => ({ foo: 1, bar: 'x' });
        `,
        errors: [{ messageId: 'requireAnchor' }],
      },
      {
        name: 'invalid: function return without annotation',
        code: `
          function build() {
            return { foo: 1, bar: 'x' };
          }
        `,
        errors: [{ messageId: 'requireAnchor' }],
      },
      {
        name: 'invalid: as T is rejected in favour of satisfies',
        code: `${preamble}
          const u = { id: 1, name: 'a' } as UserDto;
        `,
        errors: [{ messageId: 'asInsteadOfSatisfies' }],
      },
      {
        name: 'invalid: as unknown is rejected',
        code: `
          const v = { id: 1, name: 'a' } as unknown;
        `,
        errors: [{ messageId: 'asInsteadOfSatisfies' }],
      },
    ],
  },
);
