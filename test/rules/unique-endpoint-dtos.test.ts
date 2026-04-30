import * as path from 'node:path';
import { RuleTester } from '@typescript-eslint/rule-tester';

import { uniqueEndpointDtos } from '../../src/rules/unique-endpoint-dtos.js';

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
  function Controller(_path?: string): ClassDecorator { return () => {}; }
  function Get(_path?: string): MethodDecorator { return () => {}; }
  function Post(_path?: string): MethodDecorator { return () => {}; }
  function Put(_path?: string): MethodDecorator { return () => {}; }
  function Patch(_path?: string): MethodDecorator { return () => {}; }
  function Delete(_path?: string): MethodDecorator { return () => {}; }
  function Body(_field?: string): ParameterDecorator { return () => {}; }
  function Query(_field?: string): ParameterDecorator { return () => {}; }
  function ApiOkResponse(_opts?: unknown): MethodDecorator { return () => {}; }
  function ApiCreatedResponse(_opts?: unknown): MethodDecorator { return () => {}; }
  function ApiResponse(_opts?: unknown): MethodDecorator { return () => {}; }
  class CreateFooDto { a!: string; }
  class UpdateFooDto { b!: string; }
  class FooQueryDto { q!: string; }
  class BarQueryDto { q!: string; }
  class FooResponseDto { id!: string; }
  class ListFooResponseDto { items!: string[]; }
  class CreateBarDto { a!: string; }
  class BarResponseDto { id!: string; }
  class FooSchema { a!: string; }
  class BarSchema { b!: string; }
`;

ruleTester.run('unique-endpoint-dtos', uniqueEndpointDtos, {
  valid: [
    {
      name: 'valid: different DTOs in each slot',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Post() create(@Body() dto: CreateFooDto): FooResponseDto { return null!; }
          @Get()  list(@Query() q: FooQueryDto): ListFooResponseDto { return null!; }
          @Put()  update(@Body() dto: UpdateFooDto): BarResponseDto { return null!; }
        }
      `,
    },
    {
      name: 'valid: same DTO reused inside non-endpoint helper method is ignored',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Post() create(@Body() dto: CreateFooDto): FooResponseDto { return null!; }
          private helper(dto: CreateFooDto): CreateFooDto { return dto; }
        }
      `,
    },
    {
      name: 'valid: @Body("field") with primitive type is ignored',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Post() create(@Body('id') id: string, @Body() dto: CreateFooDto): FooResponseDto { return null!; }
        }
      `,
    },
    {
      name: 'valid: class without @Controller is ignored',
      code: `${preamble}
        class FooService {
          create(dto: CreateFooDto): CreateFooDto { return dto; }
          update(dto: CreateFooDto): CreateFooDto { return dto; }
        }
      `,
    },
    {
      name: 'valid: types not ending in Dto are ignored by default',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Post() create(@Body() x: FooSchema): BarSchema { return null!; }
          @Put()  update(@Body() y: FooSchema): BarSchema { return null!; }
        }
      `,
    },
    {
      name: 'valid: Promise<Dto> and Dto[] unwrap and remain unique',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Post() create(@Body() dto: CreateFooDto): Promise<FooResponseDto> { return null!; }
          @Get()  list(@Query() q: FooQueryDto): ListFooResponseDto[] { return []; }
        }
      `,
    },
    {
      name: 'valid: custom suffixes — *Schema matched, all unique',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Post() create(@Body() x: FooSchema): BarSchema { return null!; }
        }
      `,
      options: [{ suffixes: ['Schema'] }],
    },
    {
      name: 'valid: @ApiOkResponse type that is unique across endpoints',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Post()
          @ApiCreatedResponse({ type: FooResponseDto })
          create(@Body() dto: CreateFooDto) { return null!; }

          @Get()
          @ApiOkResponse({ type: ListFooResponseDto })
          list(@Query() q: FooQueryDto) { return null!; }
        }
      `,
    },
  ],

  invalid: [
    {
      name: 'invalid: same DTO used as @Body in two endpoints',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Post() create(@Body() dto: CreateFooDto): FooResponseDto { return null!; }
          @Put()  update(@Body() dto: CreateFooDto): BarResponseDto { return null!; }
        }
      `,
      errors: [{ messageId: 'duplicateDto' }],
    },
    {
      name: 'invalid: same DTO used as @Body and @Query',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Post() create(@Body() dto: FooQueryDto): FooResponseDto { return null!; }
          @Get()  list(@Query() q: FooQueryDto): ListFooResponseDto { return null!; }
        }
      `,
      errors: [{ messageId: 'duplicateDto' }],
    },
    {
      name: 'invalid: same DTO used as @Body and as response',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Post() create(@Body() dto: CreateFooDto): FooResponseDto { return null!; }
          @Get()  fetch(): CreateFooDto { return null!; }
        }
      `,
      errors: [{ messageId: 'duplicateDto' }],
    },
    {
      name: 'invalid: same DTO inside Promise<> as response duplicates @Body',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Post() create(@Body() dto: CreateFooDto): FooResponseDto { return null!; }
          @Get()  fetch(): Promise<CreateFooDto> { return null!; }
        }
      `,
      errors: [{ messageId: 'duplicateDto' }],
    },
    {
      name: 'invalid: array return type duplicates a @Body DTO',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Post() create(@Body() dto: CreateFooDto): FooResponseDto { return null!; }
          @Get()  list(): CreateFooDto[] { return []; }
        }
      `,
      errors: [{ messageId: 'duplicateDto' }],
    },
    {
      name: 'invalid: same DTO across two different controllers in one file',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Post() create(@Body() dto: CreateFooDto): FooResponseDto { return null!; }
        }
        @Controller('bar')
        class BarController {
          @Post() create(@Body() dto: CreateFooDto): BarResponseDto { return null!; }
        }
      `,
      errors: [{ messageId: 'duplicateDto' }],
    },
    {
      name: 'invalid: @ApiOkResponse type duplicates a @Body DTO',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Post()
          create(@Body() dto: CreateFooDto): FooResponseDto { return null!; }

          @Get()
          @ApiOkResponse({ type: CreateFooDto })
          fetch() { return null!; }
        }
      `,
      errors: [{ messageId: 'duplicateDto' }],
    },
    {
      name: 'invalid: @ApiOkResponse with type as array literal',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Post()
          create(@Body() dto: CreateFooDto): FooResponseDto { return null!; }

          @Get()
          @ApiOkResponse({ type: [CreateFooDto] })
          list() { return null!; }
        }
      `,
      errors: [{ messageId: 'duplicateDto' }],
    },
    {
      name: 'invalid: response type duplicated across two endpoints',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get('a') one(): FooResponseDto { return null!; }
          @Get('b') two(): FooResponseDto { return null!; }
        }
      `,
      errors: [{ messageId: 'duplicateDto' }],
    },
    {
      name: 'invalid: custom suffixes — *Schema duplicate caught',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Post() create(@Body() x: FooSchema): BarSchema { return null!; }
          @Put()  update(@Body() y: FooSchema): CreateFooDto { return null!; }
        }
      `,
      options: [{ suffixes: ['Schema'] }],
      errors: [{ messageId: 'duplicateDto' }],
    },
  ],
});
