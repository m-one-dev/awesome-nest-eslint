import * as path from 'node:path';
import { RuleTester } from '@typescript-eslint/rule-tester';

import { requireUseDtoDecorator } from '../../src/rules/require-use-dto-decorator.js';

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
  abstract class AbstractEntity {}
  abstract class AbstractTranslationEntity extends AbstractEntity {}
  declare function UseDto(cls: any): ClassDecorator;
`;

ruleTester.run('require-use-dto-decorator', requireUseDtoDecorator, {
  valid: [
    {
      name: 'valid: entity with @UseDto decorator',
      code: `${preamble}
        class UserDto {}
        @UseDto(UserDto)
        class UserEntity extends AbstractEntity {}
      `,
    },
    {
      name: 'valid: AbstractEntity itself is allowlisted',
      code: `
        abstract class AbstractEntity {}
      `,
    },
    {
      name: 'valid: AbstractTranslationEntity itself is allowlisted',
      code: `
        abstract class AbstractEntity {}
        abstract class AbstractTranslationEntity extends AbstractEntity {}
      `,
    },
    {
      name: 'valid: abstract concrete-named entity is skipped',
      code: `${preamble}
        abstract class BaseUserEntity extends AbstractEntity {}
      `,
    },
    {
      name: 'valid: class not extending AbstractEntity',
      code: `${preamble}
        class SomethingService {}
        class UnrelatedEntity {}
      `,
    },
    {
      name: 'valid: transitive @UseDto via inheritance is irrelevant — direct decorator required, but transitive AbstractEntity inheritance with own decorator is fine',
      code: `${preamble}
        class FooDto {}
        @UseDto(FooDto)
        class FooEntity extends AbstractTranslationEntity {}
      `,
    },
  ],

  invalid: [
    {
      name: 'invalid: missing @UseDto on entity → autofix derives UserDto from UserEntity',
      code: `${preamble}
        class UserEntity extends AbstractEntity {}
      `,
      errors: [
        {
          messageId: 'missingUseDto',
          data: { name: 'UserEntity', dto: 'UserDto' },
        },
      ],
      output: `${preamble}
        @UseDto(UserDto)
        class UserEntity extends AbstractEntity {}
      `,
    },
    {
      name: 'invalid: missing @UseDto on transitive entity → autofix derives SkillTranslationDto',
      code: `${preamble}
        class SkillTranslationEntity extends AbstractTranslationEntity {}
      `,
      errors: [
        {
          messageId: 'missingUseDto',
          data: {
            name: 'SkillTranslationEntity',
            dto: 'SkillTranslationDto',
          },
        },
      ],
      output: `${preamble}
        @UseDto(SkillTranslationDto)
        class SkillTranslationEntity extends AbstractTranslationEntity {}
      `,
    },
    {
      name: 'invalid: missing @UseDto on entity-without-Entity-suffix → derives FooDto',
      code: `${preamble}
        class Foo extends AbstractEntity {}
      `,
      errors: [
        { messageId: 'missingUseDto', data: { name: 'Foo', dto: 'FooDto' } },
      ],
      output: `${preamble}
        @UseDto(FooDto)
        class Foo extends AbstractEntity {}
      `,
    },
    {
      name: 'invalid: entity with non-UseDto decorators → inserts before existing decorators',
      code: `${preamble}
        declare function Entity(): ClassDecorator;
        @Entity()
        class UserEntity extends AbstractEntity {}
      `,
      errors: [
        {
          messageId: 'missingUseDto',
          data: { name: 'UserEntity', dto: 'UserDto' },
        },
      ],
      output: `${preamble}
        declare function Entity(): ClassDecorator;
        @UseDto(UserDto)
        @Entity()
        class UserEntity extends AbstractEntity {}
      `,
    },
  ],
});
