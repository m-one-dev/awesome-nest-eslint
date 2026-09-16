import * as path from 'node:path';
import { RuleTester } from '@typescript-eslint/rule-tester';

import { baseDtoPropertyMustExpose } from '../../src/rules/base-dto-property-must-expose.js';

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
  declare function Expose(options?: object): PropertyDecorator;
  declare function StringField(options?: object): PropertyDecorator;
  declare function StringFieldOptional(options?: object): PropertyDecorator;
  declare function ClassField(getClass: () => unknown, options?: object): PropertyDecorator;
  declare function ApiProperty(options?: object): PropertyDecorator;
  declare function IsEnum(entity: object): PropertyDecorator;
  declare function IsFile(): PropertyDecorator;
  declare function Transform(fn: unknown): PropertyDecorator;
  enum StatusEnum { ON = 'ON' }
  abstract class TranslatableDto {}
  abstract class BaseDto {}
  abstract class AbstractDto extends TranslatableDto {}
`;

ruleTester.run('base-dto-property-must-expose', baseDtoPropertyMustExpose, {
  valid: [
    {
      name: 'valid: *Field decorator',
      code: `${preamble}
        class FooDto extends BaseDto {
          @StringField({ description: 'Name.' })
          name!: string;
        }
      `,
    },
    {
      name: 'valid: *FieldOptional decorator',
      code: `${preamble}
        class FooDto extends BaseDto {
          @StringFieldOptional()
          name?: string;
        }
      `,
    },
    {
      name: 'valid: ClassField decorator',
      code: `${preamble}
        class BarDto extends BaseDto {}
        class FooDto extends BaseDto {
          @ClassField(() => BarDto)
          bar!: BarDto;
        }
      `,
    },
    {
      name: 'valid: bare @Expose()',
      code: `${preamble}
        class FooDto extends BaseDto {
          @Expose()
          payload!: Record<string, unknown>;
        }
      `,
    },
    {
      name: 'valid: @Expose() alongside other decorators',
      code: `${preamble}
        class FooDto extends BaseDto {
          @Transform(() => 1)
          @Expose()
          count!: number;
        }
      `,
    },
    {
      name: 'valid: transitive subclass with exposed property',
      code: `${preamble}
        class BarDto extends BaseDto {}
        class FooDto extends BarDto {
          @Expose()
          value!: string;
        }
      `,
    },
    {
      name: 'valid: AbstractDto subclasses are built with new, never create()',
      code: `${preamble}
        class FooDto extends AbstractDto {
          name!: string;
        }
      `,
    },
    {
      name: 'valid: class outside the BaseDto hierarchy',
      code: `${preamble}
        class Foo {
          name!: string;
        }
      `,
    },
    {
      name: 'valid: static property is not an instance field',
      code: `${preamble}
        class FooDto extends BaseDto {
          static readonly KIND = 'foo';
        }
      `,
    },
    {
      name: 'valid: methods and accessors are not fields',
      code: `${preamble}
        class FooDto extends BaseDto {
          @StringField()
          name!: string;

          get label(): string {
            return this.name;
          }

          describe(): string {
            return this.name;
          }
        }
      `,
    },
  ],
  invalid: [
    {
      name: 'invalid: undecorated property',
      code: `${preamble}
        interface IChanges { title?: string }
        class JobPostUpdatedN8nDto extends BaseDto {
          changedFields!: IChanges;
        }
      `,
      errors: [
        {
          messageId: 'mustExpose',
          data: {
            property: 'changedFields',
            className: 'JobPostUpdatedN8nDto',
          },
        },
      ],
    },
    {
      name: 'invalid: class-validator decorator does not expose',
      code: `${preamble}
        class UpdateStatusPayloadDto extends BaseDto {
          @IsEnum(StatusEnum)
          status!: StatusEnum;
        }
      `,
      errors: [
        {
          messageId: 'mustExpose',
          data: { property: 'status', className: 'UpdateStatusPayloadDto' },
        },
      ],
    },
    {
      name: 'invalid: @ApiProperty() documents but does not expose',
      code: `${preamble}
        class FooDto extends BaseDto {
          @ApiProperty()
          name!: string;
        }
      `,
      errors: [
        {
          messageId: 'mustExpose',
          data: { property: 'name', className: 'FooDto' },
        },
      ],
    },
    {
      name: 'invalid: uncalled @Expose is not the decorator factory',
      code: `${preamble}
        class FooDto extends BaseDto {
          // @ts-expect-error -- Expose is a factory; used bare it decorates nothing
          @Expose
          name!: string;
        }
      `,
      errors: [
        {
          messageId: 'mustExpose',
          data: { property: 'name', className: 'FooDto' },
        },
      ],
    },
    {
      name: 'invalid: transitive subclass with undecorated property',
      code: `${preamble}
        class BarDto extends BaseDto {}
        class FooDto extends BarDto {
          @IsFile()
          file!: unknown;
        }
      `,
      errors: [
        {
          messageId: 'mustExpose',
          data: { property: 'file', className: 'FooDto' },
        },
      ],
    },
    {
      name: 'invalid: class expression extending BaseDto',
      code: `${preamble}
        const FooDto = class extends BaseDto {
          name!: string;
        };
      `,
      errors: [
        {
          messageId: 'mustExpose',
          data: { property: 'name', className: 'FooDto' },
        },
      ],
    },
  ],
});
