import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { createRule } from '../utils/create-rule.js';

type MessageIds = 'noBuiltinExceptionInstantiation';

const BANNED_EXCEPTION_NAMES = new Set<string>([
  'HttpException',
  'BadRequestException',
  'UnauthorizedException',
  'NotFoundException',
  'ForbiddenException',
  'NotAcceptableException',
  'RequestTimeoutException',
  'ConflictException',
  'GoneException',
  'HttpVersionNotSupportedException',
  'PayloadTooLargeException',
  'UnsupportedMediaTypeException',
  'UnprocessableEntityException',
  'InternalServerErrorException',
  'NotImplementedException',
  'ImATeapotException',
  'MethodNotAllowedException',
  'BadGatewayException',
  'ServiceUnavailableException',
  'GatewayTimeoutException',
  'PreconditionFailedException',
  'MisdirectedException',
  'RpcException',
  'RpcBadRequestException',
  'RpcForbiddenException',
  'RpcUnprocessableEntityException',
  'RpcInternalServerErrorException',
  'RpcNotFoundException',
  'RpcUnauthorizedException',
  'RpcConflictException',
  'RpcInvalidTokenException',
]);

export const noBuiltinExceptionInstantiation = createRule<[], MessageIds>({
  name: 'no-builtin-exception-instantiation',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Built-in NestJS HTTP exceptions and the Rpc* family from common-module must not be thrown directly. Define a domain-named subclass and throw that instead so stack traces, log grouping, and Sentry buckets are meaningful per failure mode.',
    },
    messages: {
      noBuiltinExceptionInstantiation:
        'Do not throw `{{name}}` directly. Define a domain-named subclass (e.g. `class PostNotFoundException extends {{name}} {}`) and throw that instead.',
    },
    schema: [],
    defaultOptions: [],
  },
  create(context) {
    return {
      NewExpression(node: TSESTree.NewExpression): void {
        const { callee } = node;
        if (callee.type !== AST_NODE_TYPES.Identifier) {
          return;
        }
        const { name } = callee;
        if (!BANNED_EXCEPTION_NAMES.has(name)) {
          return;
        }
        context.report({
          node,
          messageId: 'noBuiltinExceptionInstantiation',
          data: { name },
        });
      },
    };
  },
});
