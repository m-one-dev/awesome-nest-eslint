import * as path from 'node:path';
import { RuleTester } from '@typescript-eslint/rule-tester';

import { swaggerMatchesReturnType } from '../../src/rules/swagger-matches-return-type.js';

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
  function ApiOkResponse(_opts?: unknown): MethodDecorator { return () => {}; }
  function ApiCreatedResponse(_opts?: unknown): MethodDecorator { return () => {}; }
  function ApiAcceptedResponse(_opts?: unknown): MethodDecorator { return () => {}; }
  function ApiNoContentResponse(_opts?: unknown): MethodDecorator { return () => {}; }
  function ApiDefaultResponse(_opts?: unknown): MethodDecorator { return () => {}; }
  function ApiPageResponse(_opts?: unknown): MethodDecorator { return () => {}; }
  function ApiResponse(_opts?: unknown): MethodDecorator { return () => {}; }
  function ApiNotFoundResponse(_opts?: unknown): MethodDecorator { return () => {}; }
  const HttpStatus = {
    OK: 200,
    CREATED: 201,
    ACCEPTED: 202,
    NO_CONTENT: 204,
    NOT_FOUND: 404,
  } as const;
  class FooDto { id!: string; }
  class BarDto { id!: string; }
  class ErrorDto { message!: string; }
  class PageDto<T> { results!: T[]; total!: number; }
`;

ruleTester.run('swagger-matches-return-type', swaggerMatchesReturnType, {
  valid: [
    {
      name: 'valid: single DTO return matches single DTO swagger',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOkResponse({ type: FooDto })
          get(): Promise<FooDto> { return null!; }
        }
      `,
    },
    {
      name: 'valid: array DTO return matches array literal swagger',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOkResponse({ type: [FooDto] })
          list(): Promise<FooDto[]> { return null!; }
        }
      `,
    },
    {
      name: 'valid: array DTO return matches isArray: true swagger',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOkResponse({ type: FooDto, isArray: true })
          list(): Promise<FooDto[]> { return null!; }
        }
      `,
    },
    {
      name: 'valid: PageDto return matches ApiPageResponse',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiPageResponse({ type: FooDto })
          list(): Promise<PageDto<FooDto>> { return null!; }
        }
      `,
    },
    {
      name: 'valid: PageDto return matches ApiOkResponse with PageDto<X> instantiation',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOkResponse({ type: PageDto<FooDto> })
          list(): Promise<PageDto<FooDto>> { return null!; }
        }
      `,
    },
    {
      name: 'valid: ApiCreatedResponse matches return type',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Post()
          @ApiCreatedResponse({ type: FooDto })
          create(): Promise<FooDto> { return null!; }
        }
      `,
    },
    {
      name: 'valid: non-2xx ApiResponse with different DTO is ignored',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOkResponse({ type: FooDto })
          @ApiResponse({ status: HttpStatus.NOT_FOUND, type: ErrorDto })
          get(): Promise<FooDto> { return null!; }
        }
      `,
    },
    {
      name: 'valid: ApiNotFoundResponse with different DTO is ignored',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOkResponse({ type: FooDto })
          @ApiNotFoundResponse({ type: ErrorDto })
          get(): Promise<FooDto> { return null!; }
        }
      `,
    },
    {
      name: 'valid: endpoint without any swagger decorator is skipped',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          get(): Promise<FooDto> { return null!; }
        }
      `,
    },
    {
      name: 'valid: endpoint without return-type annotation is skipped',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOkResponse({ type: FooDto })
          get() { return null!; }
        }
      `,
    },
    {
      name: 'valid: ApiResponse with numeric literal 200 matches return',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiResponse({ status: 200, type: FooDto })
          get(): Promise<FooDto> { return null!; }
        }
      `,
    },
    {
      name: 'valid: nullable return strips null and matches single',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOkResponse({ type: FooDto })
          get(): Promise<FooDto | null> { return null!; }
        }
      `,
    },
    {
      name: 'valid: decorator without type: arg (schema-only) is skipped',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOkResponse({ description: 'no type' })
          get(): Promise<FooDto> { return null!; }
        }
      `,
    },
  ],

  invalid: [
    {
      name: 'invalid: single DTO return drifts from swagger DTO',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOkResponse({ type: BarDto })
          get(): Promise<FooDto> { return null!; }
        }
      `,
      errors: [{ messageId: 'slotMismatch' }],
    },
    {
      name: 'invalid: array return but single swagger',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOkResponse({ type: FooDto })
          list(): Promise<FooDto[]> { return null!; }
        }
      `,
      errors: [{ messageId: 'slotMismatch' }],
    },
    {
      name: 'invalid: single return but ApiPageResponse wrapper',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiPageResponse({ type: FooDto })
          get(): Promise<FooDto> { return null!; }
        }
      `,
      errors: [{ messageId: 'slotMismatch' }],
    },
    {
      name: 'invalid: PageDto return but single swagger',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOkResponse({ type: FooDto })
          list(): Promise<PageDto<FooDto>> { return null!; }
        }
      `,
      errors: [{ messageId: 'slotMismatch' }],
    },
    {
      name: 'invalid: ApiResponse with HttpStatus.OK and wrong DTO',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiResponse({ status: HttpStatus.OK, type: BarDto })
          get(): Promise<FooDto> { return null!; }
        }
      `,
      errors: [{ messageId: 'slotMismatch' }],
    },
  ],
});
