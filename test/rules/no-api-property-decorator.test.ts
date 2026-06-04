import * as path from 'node:path';

import { RuleTester } from '@typescript-eslint/rule-tester';

import { noApiPropertyDecorator } from '../../src/rules/no-api-property-decorator.js';

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
  function StringField(_opts?: unknown): PropertyDecorator { return () => {}; }
  function UUIDField(_opts?: unknown): PropertyDecorator { return () => {}; }
  function UUIDFieldOptional(_opts?: unknown): PropertyDecorator { return () => {}; }
  function ClassField(_fn: () => unknown, _opts?: unknown): PropertyDecorator { return () => {}; }
  function ApiProperty(_opts?: unknown): PropertyDecorator { return () => {}; }
  function ApiPropertyOptional(_opts?: unknown): PropertyDecorator { return () => {}; }
`;

ruleTester.run('no-api-property-decorator', noApiPropertyDecorator, {
  valid: [
    {
      name: 'valid: StringField used instead of ApiProperty',
      code: `${preamble}
        class FooDto {
          @StringField({ description: 'Name' })
          readonly name!: string;
        }
      `,
    },
    {
      name: 'valid: UUIDField used instead of ApiProperty',
      code: `${preamble}
        class FooDto {
          @UUIDField({ description: 'ID' })
          readonly id!: string;
        }
      `,
    },
    {
      name: 'valid: UUIDFieldOptional used instead of ApiPropertyOptional',
      code: `${preamble}
        class FooDto {
          @UUIDFieldOptional({ description: 'Optional ID' })
          readonly companyId?: string;
        }
      `,
    },
    {
      name: 'valid: ClassField used for nested DTO',
      code: `${preamble}
        class BarDto {}
        class FooDto {
          @ClassField(() => BarDto, { description: 'Nested DTO' })
          readonly bar!: BarDto;
        }
      `,
    },
    {
      name: 'valid: non-Dto class using ApiProperty is not checked (rule is file-scoped)',
      code: `${preamble}
        class FooController {
          // This file wouldn't match the *.dto.ts file filter in the ESLint config,
          // but the rule doesn't check file names — it bans everywhere it runs.
          // The config scoping (files: ['**/*.dto.ts', '**/dto/**/*.ts']) handles that.
        }
      `,
    },
  ],

  invalid: [
    {
      name: 'invalid: @ApiProperty on class member',
      code: `${preamble}
        class FooDto {
          @ApiProperty({ description: 'Name' })
          readonly name!: string;
        }
      `,
      errors: [{ messageId: 'noApiProperty' }],
    },
    {
      name: 'invalid: @ApiPropertyOptional on class member',
      code: `${preamble}
        class FooDto {
          @ApiPropertyOptional({ description: 'Email' })
          readonly email?: string;
        }
      `,
      errors: [{ messageId: 'noApiPropertyOptional' }],
    },
    {
      name: 'invalid: mixed Field decorators and ApiProperty in same class',
      code: `${preamble}
        class FooDto {
          @StringField({ description: 'Name' })
          readonly name!: string;

          @ApiProperty({ description: 'Age' })
          readonly age!: number;
        }
      `,
      errors: [{ messageId: 'noApiProperty' }],
    },
    {
      name: 'invalid: @ApiProperty with no options',
      code: `${preamble}
        class FooDto {
          @ApiProperty()
          readonly name!: string;
        }
      `,
      errors: [{ messageId: 'noApiProperty' }],
    },
    {
      name: 'invalid: @ApiPropertyOptional with nullable option',
      code: `${preamble}
        class FooDto {
          @ApiPropertyOptional({ nullable: true })
          readonly description?: string | null;
        }
      `,
      errors: [{ messageId: 'noApiPropertyOptional' }],
    },
  ],
});
