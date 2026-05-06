import * as path from 'node:path';
import { RuleTester } from '@typescript-eslint/rule-tester';

import { noBuiltinExceptionInstantiation } from '../../src/rules/no-builtin-exception-instantiation.js';

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

ruleTester.run(
  'no-builtin-exception-instantiation',
  noBuiltinExceptionInstantiation,
  {
    valid: [
      {
        name: 'valid: extends a banned class with super() in subclass constructor',
        code: `
          declare class NotFoundException { constructor(msg?: string); }
          class PostNotFoundException extends NotFoundException {
            constructor() {
              super('Post not found');
            }
          }
        `,
      },
      {
        name: 'valid: extends a banned Rpc class without explicit constructor',
        code: `
          declare class RpcNotFoundException { constructor(msg?: string); }
          class PostNotFoundException extends RpcNotFoundException {}
        `,
      },
      {
        name: 'valid: throwing a custom domain exception',
        code: `
          declare class PostNotFoundException { constructor(); }
          throw new PostNotFoundException();
        `,
      },
      {
        name: 'valid: new on an unrelated class',
        code: `
          class Foo {}
          const f = new Foo();
        `,
      },
      {
        name: 'valid: new on a custom class whose name does not match',
        code: `
          class MyException { constructor(msg: string) {} }
          throw new MyException('boom');
        `,
      },
      {
        name: 'valid: re-export of a banned name without instantiation',
        code: `
          declare class NotFoundException {}
          export { NotFoundException };
        `,
      },
    ],

    invalid: [
      {
        name: 'invalid: throw new NotFoundException with literal string',
        code: `
          declare class NotFoundException { constructor(msg?: string); }
          throw new NotFoundException('Restaurant not found');
        `,
        errors: [
          {
            messageId: 'noBuiltinExceptionInstantiation',
            data: { name: 'NotFoundException' },
          },
        ],
      },
      {
        name: 'invalid: throw new NotFoundException with no args (zero-arg still banned)',
        code: `
          declare class NotFoundException { constructor(msg?: string); }
          throw new NotFoundException();
        `,
        errors: [
          {
            messageId: 'noBuiltinExceptionInstantiation',
            data: { name: 'NotFoundException' },
          },
        ],
      },
      {
        name: 'invalid: throw new NotFoundException with non-literal arg',
        code: `
          declare class NotFoundException { constructor(msg?: string); }
          declare const reason: string;
          throw new NotFoundException(reason);
        `,
        errors: [
          {
            messageId: 'noBuiltinExceptionInstantiation',
            data: { name: 'NotFoundException' },
          },
        ],
      },
      {
        name: 'invalid: throw new RpcConflictException',
        code: `
          declare class RpcConflictException { constructor(msg?: string); }
          declare const error: { message: string };
          throw new RpcConflictException(error.message);
        `,
        errors: [
          {
            messageId: 'noBuiltinExceptionInstantiation',
            data: { name: 'RpcConflictException' },
          },
        ],
      },
      {
        name: 'invalid: throw new HttpException base class',
        code: `
          declare class HttpException { constructor(msg: string, status: number); }
          throw new HttpException('boom', 500);
        `,
        errors: [
          {
            messageId: 'noBuiltinExceptionInstantiation',
            data: { name: 'HttpException' },
          },
        ],
      },
      {
        name: 'invalid: throw new RpcException base class',
        code: `
          declare class RpcException { constructor(err: any); }
          throw new RpcException({ code: 'X' });
        `,
        errors: [
          {
            messageId: 'noBuiltinExceptionInstantiation',
            data: { name: 'RpcException' },
          },
        ],
      },
      {
        name: 'invalid: assignment then throw still flagged',
        code: `
          declare class NotFoundException { constructor(msg?: string); }
          const e = new NotFoundException('x');
          throw e;
        `,
        errors: [
          {
            messageId: 'noBuiltinExceptionInstantiation',
            data: { name: 'NotFoundException' },
          },
        ],
      },
      {
        name: 'invalid: throw new BadRequestException',
        code: `
          declare class BadRequestException { constructor(msg?: string); }
          throw new BadRequestException('bad');
        `,
        errors: [
          {
            messageId: 'noBuiltinExceptionInstantiation',
            data: { name: 'BadRequestException' },
          },
        ],
      },
      {
        name: 'invalid: throw new UnauthorizedException',
        code: `
          declare class UnauthorizedException { constructor(msg?: string); }
          throw new UnauthorizedException('nope');
        `,
        errors: [
          {
            messageId: 'noBuiltinExceptionInstantiation',
            data: { name: 'UnauthorizedException' },
          },
        ],
      },
      {
        name: 'invalid: throw new ForbiddenException',
        code: `
          declare class ForbiddenException { constructor(msg?: string); }
          throw new ForbiddenException();
        `,
        errors: [
          {
            messageId: 'noBuiltinExceptionInstantiation',
            data: { name: 'ForbiddenException' },
          },
        ],
      },
      {
        name: 'invalid: throw new InternalServerErrorException',
        code: `
          declare class InternalServerErrorException { constructor(msg?: string); }
          throw new InternalServerErrorException('boom');
        `,
        errors: [
          {
            messageId: 'noBuiltinExceptionInstantiation',
            data: { name: 'InternalServerErrorException' },
          },
        ],
      },
      {
        name: 'invalid: throw new RpcUnprocessableEntityException',
        code: `
          declare class RpcUnprocessableEntityException { constructor(msg?: string); }
          throw new RpcUnprocessableEntityException('bad payload');
        `,
        errors: [
          {
            messageId: 'noBuiltinExceptionInstantiation',
            data: { name: 'RpcUnprocessableEntityException' },
          },
        ],
      },
    ],
  },
);
