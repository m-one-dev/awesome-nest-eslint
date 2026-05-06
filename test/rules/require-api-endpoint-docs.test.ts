import * as path from 'node:path';
import { RuleTester } from '@typescript-eslint/rule-tester';

import { requireApiEndpointDocs } from '../../src/rules/require-api-endpoint-docs.js';

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
  function Patch(_path?: string): MethodDecorator { return () => {}; }
  function Put(_path?: string): MethodDecorator { return () => {}; }
  function Delete(_path?: string): MethodDecorator { return () => {}; }
  function MessagePattern(_p?: unknown): MethodDecorator { return () => {}; }
  function Injectable(): ClassDecorator { return () => {}; }
  function ApiOperation(_opts?: unknown): MethodDecorator { return () => {}; }
  function ApiOkResponse(_opts?: unknown): MethodDecorator { return () => {}; }
  function ApiCreatedResponse(_opts?: unknown): MethodDecorator { return () => {}; }
  function ApiAcceptedResponse(_opts?: unknown): MethodDecorator { return () => {}; }
  function ApiNoContentResponse(_opts?: unknown): MethodDecorator { return () => {}; }
  function ApiDefaultResponse(_opts?: unknown): MethodDecorator { return () => {}; }
  function ApiPageResponse(_opts?: unknown): MethodDecorator { return () => {}; }
  function ApiCursorPageResponse(_opts?: unknown): MethodDecorator { return () => {}; }
  function ApiResponse(_opts?: unknown): MethodDecorator { return () => {}; }
  function ApiBadRequestResponse(_opts?: unknown): MethodDecorator { return () => {}; }
  class FooDto { id!: string; }
  const SHARED_DESCRIPTION = 'shared';
`;

ruleTester.run('require-api-endpoint-docs', requireApiEndpointDocs, {
  valid: [
    {
      name: 'endpoint with @ApiOperation + @ApiOkResponse, both literal descriptions',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOperation({ description: 'List all foos' })
          @ApiOkResponse({ type: FooDto, description: 'The list of foos' })
          list() { return []; }
        }
      `,
    },
    {
      name: 'endpoint with @ApiPageResponse satisfies success-response requirement',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOperation({ description: 'Paginated foos' })
          @ApiPageResponse({ type: FooDto, description: 'Page of foos' })
          list() { return []; }
        }
      `,
    },
    {
      name: 'endpoint with @ApiCursorPageResponse satisfies success-response requirement',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOperation({ description: 'Cursor foos' })
          @ApiCursorPageResponse({ type: FooDto, description: 'Cursor page of foos' })
          list() { return []; }
        }
      `,
    },
    {
      name: 'template literal description without expressions is allowed',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Post()
          @ApiOperation({ description: \`Creates a foo\` })
          @ApiCreatedResponse({ type: FooDto, description: \`Created foo\` })
          create() { return new FooDto(); }
        }
      `,
    },
    {
      name: 'NATS controller (MessagePattern) is ignored',
      code: `${preamble}
        @Controller()
        class FooNatsController {
          @MessagePattern('foo.create')
          handleCreate() { return null; }
        }
      `,
    },
    {
      name: 'class without @Controller is ignored',
      code: `${preamble}
        @Injectable()
        class FooService {
          @Get()
          doStuff() { return null; }
        }
      `,
    },
    {
      name: 'method without HTTP decorator is ignored',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          private helper() { return 1; }

          @Get()
          @ApiOperation({ description: 'Get foo' })
          @ApiOkResponse({ type: FooDto, description: 'Foo' })
          get() { return new FooDto(); }
        }
      `,
    },
    {
      name: 'multiple success-response decorators each with description',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Post()
          @ApiOperation({ description: 'Create foo' })
          @ApiCreatedResponse({ type: FooDto, description: 'Created' })
          @ApiAcceptedResponse({ type: FooDto, description: 'Accepted async' })
          create() { return new FooDto(); }
        }
      `,
    },
    {
      name: 'requireOperationSummary on with summary present',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOperation({ summary: 'List foos', description: 'List all foos' })
          @ApiOkResponse({ type: FooDto, description: 'Foos' })
          list() { return []; }
        }
      `,
      options: [{ requireOperationSummary: true }],
    },
    {
      name: 'custom successResponseDecorators option',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOperation({ description: 'List' })
          @ApiResponse({ status: 200, description: 'List of foos' })
          list() { return []; }
        }
      `,
      options: [{ successResponseDecorators: ['ApiResponse'] }],
    },
    {
      name: 'success-response decorator without description is allowed',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOperation({ description: 'List foos' })
          @ApiOkResponse({ type: FooDto })
          list() { return []; }
        }
      `,
    },
    {
      name: 'success-response decorator with no options at all is allowed',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOperation({ description: 'List foos' })
          @ApiOkResponse()
          list() { return []; }
        }
      `,
    },
    {
      name: 'multiple success-response decorators, none with description, are allowed',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Post()
          @ApiOperation({ description: 'Create foo' })
          @ApiCreatedResponse({ type: FooDto })
          @ApiAcceptedResponse({ type: FooDto })
          create() { return new FooDto(); }
        }
      `,
    },
  ],

  invalid: [
    {
      name: 'missing @ApiOperation',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOkResponse({ type: FooDto, description: 'Foo' })
          list() { return []; }
        }
      `,
      errors: [{ messageId: 'missingApiOperation' }],
    },
    {
      name: 'missing success-response decorator',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOperation({ description: 'List foos' })
          list() { return []; }
        }
      `,
      errors: [{ messageId: 'missingSuccessResponse' }],
    },
    {
      name: 'generic @ApiResponse does not satisfy by default',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOperation({ description: 'List foos' })
          @ApiResponse({ status: 200, description: 'List' })
          list() { return []; }
        }
      `,
      errors: [{ messageId: 'missingSuccessResponse' }],
    },
    {
      name: 'error-only response does not satisfy success requirement',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOperation({ description: 'List foos' })
          @ApiBadRequestResponse({ description: 'Bad request' })
          list() { return []; }
        }
      `,
      errors: [{ messageId: 'missingSuccessResponse' }],
    },
    {
      name: '@ApiOperation missing description property',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOperation({ summary: 'List' })
          @ApiOkResponse({ type: FooDto, description: 'Foos' })
          list() { return []; }
        }
      `,
      errors: [{ messageId: 'missingDescription' }],
    },
    {
      name: '@ApiOperation called with no options at all',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOperation()
          @ApiOkResponse({ type: FooDto, description: 'Foos' })
          list() { return []; }
        }
      `,
      errors: [{ messageId: 'missingDescription' }],
    },
    {
      name: 'description is empty string',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOperation({ description: '' })
          @ApiOkResponse({ type: FooDto, description: 'Foos' })
          list() { return []; }
        }
      `,
      errors: [{ messageId: 'missingDescription' }],
    },
    {
      name: 'description is whitespace only',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOperation({ description: '   ' })
          @ApiOkResponse({ type: FooDto, description: 'Foos' })
          list() { return []; }
        }
      `,
      errors: [{ messageId: 'missingDescription' }],
    },
    {
      name: 'description is identifier (non-literal)',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOperation({ description: SHARED_DESCRIPTION })
          @ApiOkResponse({ type: FooDto, description: 'Foos' })
          list() { return []; }
        }
      `,
      errors: [{ messageId: 'nonLiteralDescription' }],
    },
    {
      name: 'description is template literal with expression',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOperation({ description: \`hello \${SHARED_DESCRIPTION}\` })
          @ApiOkResponse({ type: FooDto, description: 'Foos' })
          list() { return []; }
        }
      `,
      errors: [{ messageId: 'nonLiteralDescription' }],
    },
    {
      name: 'missing both @ApiOperation and success response — two reports',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          list() { return []; }
        }
      `,
      errors: [
        { messageId: 'missingApiOperation' },
        { messageId: 'missingSuccessResponse' },
      ],
    },
    {
      name: 'requireOperationSummary on but summary missing',
      code: `${preamble}
        @Controller('foo')
        class FooController {
          @Get()
          @ApiOperation({ description: 'List all foos' })
          @ApiOkResponse({ type: FooDto, description: 'Foos' })
          list() { return []; }
        }
      `,
      options: [{ requireOperationSummary: true }],
      errors: [{ messageId: 'missingDescription' }],
    },
  ],
});
