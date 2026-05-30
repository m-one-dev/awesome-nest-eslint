import * as path from 'node:path';
import { RuleTester } from '@typescript-eslint/rule-tester';

import { dtoDecoratorOptionalityMustMatchType } from '../../src/rules/dto-decorator-optionality-must-match-type.js';

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
  type Nullable<T> = T | null;
  function StringField(_opts?: { nullable?: boolean; description?: string }): PropertyDecorator { return () => {}; }
  function StringFieldOptional(_opts?: { nullable?: boolean; description?: string }): PropertyDecorator { return () => {}; }
  function UUIDField(_opts?: { nullable?: boolean }): PropertyDecorator { return () => {}; }
  function UUIDFieldOptional(_opts?: { nullable?: boolean }): PropertyDecorator { return () => {}; }
  function NumberField(_opts?: { nullable?: boolean }): PropertyDecorator { return () => {}; }
  function NumberFieldOptional(_opts?: { nullable?: boolean }): PropertyDecorator { return () => {}; }
  function BooleanProperty(_opts?: { nullable?: boolean }): PropertyDecorator { return () => {}; }
  function BooleanPropertyOptional(_opts?: { nullable?: boolean }): PropertyDecorator { return () => {}; }
  function ApiPropertyOptional(_opts?: { nullable?: boolean }): PropertyDecorator { return () => {}; }
  function Transform(_fn: any): PropertyDecorator { return () => {}; }
  function IsOptional(): PropertyDecorator { return () => {}; }
`;

ruleTester.run(
  'dto-decorator-optionality-must-match-type',
  dtoDecoratorOptionalityMustMatchType,
  {
    valid: [
      {
        name: 'required decorator + required non-nullable property',
        code: `${preamble}
          class FooDto { @StringField() readonly name!: string; }
        `,
      },
      {
        name: 'optional decorator + optional non-nullable property',
        code: `${preamble}
          class FooDto { @StringFieldOptional() readonly name?: string; }
        `,
      },
      {
        name: 'required decorator with nullable:true + required nullable property',
        code: `${preamble}
          class FooDto { @StringField({ nullable: true }) readonly name!: string | null; }
        `,
      },
      {
        name: 'optional decorator with nullable:true + optional nullable property',
        code: `${preamble}
          class FooDto { @StringFieldOptional({ nullable: true }) readonly name?: string | null; }
        `,
      },
      {
        name: 'explicit nullable:false equals absent',
        code: `${preamble}
          class FooDto { @StringField({ nullable: false }) readonly name!: string; }
        `,
      },
      {
        name: 'nullable via type alias is detected by type checker',
        code: `${preamble}
          class FooDto { @StringField({ nullable: true }) readonly name!: Nullable<string>; }
        `,
      },
      {
        name: 'non-Dto class is out of scope',
        code: `${preamble}
          class FooHelper { @StringFieldOptional() readonly x!: string; }
        `,
      },
      {
        name: 'property without any decorator is skipped',
        code: `${preamble}
          class FooDto { readonly name?: string; }
        `,
      },
      {
        name: 'property with only non-field-shape decorators is skipped',
        code: `${preamble}
          class FooDto {
            @Transform(({ value }: any) => value)
            @IsOptional()
            readonly name?: string;
          }
        `,
      },
      {
        name: 'static property is skipped',
        code: `${preamble}
          class FooDto { @StringFieldOptional() static readonly name: string = 'x'; }
        `,
      },
      {
        name: 'private property is skipped',
        code: `${preamble}
          class FooDto { @StringFieldOptional() private readonly name!: string; }
        `,
      },
      {
        name: 'spread options skip nullable check (Optional axis still checked and passes)',
        code: `${preamble}
          const defaults = { nullable: true } as const;
          class FooDto { @StringField({ ...defaults }) readonly name!: string; }
        `,
      },
      {
        name: 'non-literal nullable value skips nullable check',
        code: `${preamble}
          const flag: boolean = true;
          class FooDto { @StringField({ nullable: flag }) readonly name!: string; }
        `,
      },
      {
        name: 'PropertyOptional family (BooleanPropertyOptional) recognized',
        code: `${preamble}
          class FooDto { @BooleanPropertyOptional() readonly flag?: boolean; }
        `,
      },
      {
        name: 'ApiPropertyOptional recognized as optional variant',
        code: `${preamble}
          class FooDto { @ApiPropertyOptional() readonly note?: string; }
        `,
      },
      {
        name: 'multiple field-shape decorators that agree are valid',
        code: `${preamble}
          class FooDto {
            @StringFieldOptional({ nullable: true })
            @ApiPropertyOptional({ nullable: true })
            readonly name?: string | null;
          }
        `,
      },
      {
        name: 'optional decorator on property with default value (no ?)',
        code: `${preamble}
          class FooDto { @NumberFieldOptional() readonly limit: number = 10; }
        `,
      },
      {
        name: 'optional decorator on property with enum default (no ?)',
        code: `${preamble}
          enum OrderEnum { ASC, DESC }
          class FooDto { @StringFieldOptional() readonly order: OrderEnum = OrderEnum.DESC; }
        `,
      },
      {
        name: 'optional decorator on property with boolean default (no ?)',
        code: `${preamble}
          class FooDto { @StringFieldOptional() readonly enabled: boolean = false; }
        `,
      },
    ],

    invalid: [
      {
        name: 'optional decorator on required property',
        code: `${preamble}
          class FooDto { @StringFieldOptional() readonly name!: string; }
        `,
        errors: [
          {
            messageId: 'optionalDecoratorRequiresOptionalProperty',
            data: { decorator: 'StringFieldOptional', property: 'name' },
          },
        ],
      },
      {
        name: 'required decorator on optional property',
        code: `${preamble}
          class FooDto { @StringField() readonly name?: string; }
        `,
        errors: [
          {
            messageId: 'optionalPropertyRequiresOptionalDecorator',
            data: { decorator: 'StringField', property: 'name' },
          },
        ],
      },
      {
        name: 'nullable type without nullable:true option',
        code: `${preamble}
          class FooDto { @StringField() readonly name!: string | null; }
        `,
        errors: [
          {
            messageId: 'nullableTypeRequiresNullableOption',
            data: { decorator: 'StringField', property: 'name' },
          },
        ],
      },
      {
        name: 'nullable:true option without nullable type',
        code: `${preamble}
          class FooDto { @StringField({ nullable: true }) readonly name!: string; }
        `,
        errors: [
          {
            messageId: 'nullableOptionRequiresNullableType',
            data: { decorator: 'StringField', property: 'name' },
          },
        ],
      },
      {
        name: 'real-world pattern: Optional decorator + nullable type, no ?',
        code: `${preamble}
          class CustomerDto {
            @StringFieldOptional({ nullable: true })
            readonly country!: string | null;
          }
        `,
        errors: [
          {
            messageId: 'optionalDecoratorRequiresOptionalProperty',
            data: { decorator: 'StringFieldOptional', property: 'country' },
          },
        ],
      },
      {
        name: 'nullable via type alias without nullable:true',
        code: `${preamble}
          class FooDto { @StringField() readonly name!: Nullable<string>; }
        `,
        errors: [
          {
            messageId: 'nullableTypeRequiresNullableOption',
            data: { decorator: 'StringField', property: 'name' },
          },
        ],
      },
      {
        name: 'both axes wrong on same property — two errors',
        code: `${preamble}
          class FooDto { @StringFieldOptional({ nullable: true }) readonly name!: string; }
        `,
        errors: [
          { messageId: 'optionalDecoratorRequiresOptionalProperty' },
          { messageId: 'nullableOptionRequiresNullableType' },
        ],
      },
      {
        name: 'multiple field-shape decorators disagreeing — each reported',
        code: `${preamble}
          class FooDto {
            @StringField()
            @ApiPropertyOptional()
            readonly name?: string;
          }
        `,
        errors: [
          {
            messageId: 'optionalPropertyRequiresOptionalDecorator',
            data: { decorator: 'StringField', property: 'name' },
          },
        ],
      },
      {
        name: 'multiple decorators both wrong on nullable axis',
        code: `${preamble}
          class FooDto {
            @StringField({ nullable: true })
            @ApiPropertyOptional({ nullable: true })
            readonly name?: string;
          }
        `,
        errors: [
          { messageId: 'optionalPropertyRequiresOptionalDecorator' },
          { messageId: 'nullableOptionRequiresNullableType' },
          { messageId: 'nullableOptionRequiresNullableType' },
        ],
      },
      {
        name: 'optional decorator on property with = undefined initializer (not a real default)',
        code: `${preamble}
          class FooDto { @StringFieldOptional() readonly name: string = undefined; }
        `,
        errors: [
          {
            messageId: 'optionalDecoratorRequiresOptionalProperty',
            data: { decorator: 'StringFieldOptional', property: 'name' },
          },
        ],
      },
      {
        name: 'optional decorator on property with = void 0 initializer (not a real default)',
        code: `${preamble}
          class FooDto { @StringFieldOptional() readonly name: string = void 0; }
        `,
        errors: [
          {
            messageId: 'optionalDecoratorRequiresOptionalProperty',
            data: { decorator: 'StringFieldOptional', property: 'name' },
          },
        ],
      },
    ],
  },
);
