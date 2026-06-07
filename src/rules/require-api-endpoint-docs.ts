import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { createRule } from '../utils/create-rule.js';

type MessageIds =
  | 'missingApiOperation'
  | 'missingSuccessResponse'
  | 'missingDescription'
  | 'nonLiteralDescription';

export interface Options {
  successResponseDecorators?: string[];
  requireOperationSummary?: boolean;
}

const DEFAULT_SUCCESS_RESPONSE_DECORATORS: readonly string[] = [
  'ApiOkResponse',
  'ApiCreatedResponse',
  'ApiAcceptedResponse',
  'ApiNoContentResponse',
  'ApiDefaultResponse',
  'ApiPageResponse',
  'ApiCursorPageResponse',
];

const HTTP_METHOD_DECORATORS: ReadonlySet<string> = new Set([
  'Get',
  'Post',
  'Put',
  'Patch',
  'Delete',
  'Options',
  'Head',
  'All',
]);

const CONTROLLER_DECORATOR = 'Controller';
const API_OPERATION_DECORATOR = 'ApiOperation';

interface DecoratorCallInfo {
  decoratorNode: TSESTree.Decorator;
  callee: TSESTree.Identifier;
  name: string;
  optionsArg: TSESTree.ObjectExpression | undefined;
}

function getDecoratorCallInfo(
  decorator: TSESTree.Decorator,
): DecoratorCallInfo | undefined {
  const expression = decorator.expression;

  if (expression.type !== AST_NODE_TYPES.CallExpression) {
    return undefined;
  }

  if (expression.callee.type !== AST_NODE_TYPES.Identifier) {
    return undefined;
  }

  const firstArg = expression.arguments[0];
  const optionsArg =
    firstArg && firstArg.type === AST_NODE_TYPES.ObjectExpression
      ? firstArg
      : undefined;

  return {
    decoratorNode: decorator,
    callee: expression.callee,
    name: expression.callee.name,
    optionsArg,
  };
}

function findProperty(
  obj: TSESTree.ObjectExpression,
  key: string,
): TSESTree.Property | undefined {
  for (const prop of obj.properties) {
    if (prop.type !== AST_NODE_TYPES.Property || prop.computed) {
      continue;
    }

    const propKey = prop.key;
    const propKeyName =
      propKey.type === AST_NODE_TYPES.Identifier
        ? propKey.name
        : propKey.type === AST_NODE_TYPES.Literal &&
            typeof propKey.value === 'string'
          ? propKey.value
          : undefined;

    if (propKeyName === key) {
      return prop;
    }
  }

  return undefined;
}

type LiteralStringResult =
  | { kind: 'literal'; value: string }
  | { kind: 'non-literal'; description: string };

function evaluateStringValue(
  value: TSESTree.Node,
): LiteralStringResult | undefined {
  if (
    value.type === AST_NODE_TYPES.Literal &&
    typeof value.value === 'string'
  ) {
    return { kind: 'literal', value: value.value };
  }

  if (value.type === AST_NODE_TYPES.TemplateLiteral) {
    if (value.expressions.length === 0 && value.quasis.length === 1) {
      return { kind: 'literal', value: value.quasis[0]!.value.cooked ?? '' };
    }

    return {
      kind: 'non-literal',
      description: 'template literal with expressions',
    };
  }

  if (value.type === AST_NODE_TYPES.Identifier) {
    return { kind: 'non-literal', description: `identifier '${value.name}'` };
  }

  if (
    value.type === AST_NODE_TYPES.MemberExpression ||
    value.type === AST_NODE_TYPES.CallExpression ||
    value.type === AST_NODE_TYPES.ConditionalExpression ||
    value.type === AST_NODE_TYPES.BinaryExpression ||
    value.type === AST_NODE_TYPES.LogicalExpression
  ) {
    return { kind: 'non-literal', description: 'computed expression' };
  }

  return undefined;
}

function isClassController(node: TSESTree.ClassDeclaration): boolean {
  if (!node.decorators) {
    return false;
  }

  return node.decorators.some((d) => {
    const info = getDecoratorCallInfo(d);
    return info?.name === CONTROLLER_DECORATOR;
  });
}

function methodHttpDecorator(
  node: TSESTree.MethodDefinition,
): DecoratorCallInfo | undefined {
  if (!node.decorators) {
    return undefined;
  }

  for (const d of node.decorators) {
    const info = getDecoratorCallInfo(d);

    if (info && HTTP_METHOD_DECORATORS.has(info.name)) {
      return info;
    }
  }

  return undefined;
}

function getMethodName(node: TSESTree.MethodDefinition): string {
  const key = node.key;

  if (key.type === AST_NODE_TYPES.Identifier) {
    return key.name;
  }

  if (key.type === AST_NODE_TYPES.Literal) {
    return String(key.value);
  }

  return '<computed>';
}

function getControllerName(node: TSESTree.ClassDeclaration): string {
  return node.id?.name ?? '<anonymous>';
}

export const requireApiEndpointDocs = createRule<[Options], MessageIds>({
  name: 'require-api-endpoint-docs',
  meta: {
    type: 'problem',
    docs: {
      description:
        'HTTP endpoint methods on NestJS controllers must declare @ApiOperation (with a non-empty literal description) and at least one success-response decorator (e.g. @ApiOkResponse, @ApiPageResponse). Success-response decorators must exist but are not required to declare a description.',
    },
    messages: {
      missingApiOperation:
        "Endpoint '{{controller}}.{{method}}' is missing @ApiOperation.",
      missingSuccessResponse:
        "Endpoint '{{controller}}.{{method}}' must declare a success response with one of: {{allowed}}.",
      missingDescription:
        "@{{decorator}} on '{{controller}}.{{method}}' must include a non-empty '{{property}}' string.",
      nonLiteralDescription:
        "'{{property}}' on @{{decorator}} must be a string literal — got {{kind}}.",
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          successResponseDecorators: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
            minItems: 1,
          },
          requireOperationSummary: { type: 'boolean' },
        },
      },
    ],
    defaultOptions: [
      {
        successResponseDecorators: [...DEFAULT_SUCCESS_RESPONSE_DECORATORS],
        requireOperationSummary: false,
      },
    ],
  },
  create(context, [rawOptions]) {
    const successResponseDecorators = new Set(
      rawOptions.successResponseDecorators &&
        rawOptions.successResponseDecorators.length > 0
        ? rawOptions.successResponseDecorators
        : DEFAULT_SUCCESS_RESPONSE_DECORATORS,
    );
    const requireOperationSummary = rawOptions.requireOperationSummary ?? false;
    const allowedList = [...successResponseDecorators].join(', ');

    function checkLiteralProperty(
      info: DecoratorCallInfo,
      property: string,
      controllerName: string,
      methodName: string,
    ): void {
      const optionsArg = info.optionsArg;

      if (!optionsArg) {
        context.report({
          node: info.decoratorNode,
          messageId: 'missingDescription',
          data: {
            decorator: info.name,
            controller: controllerName,
            method: methodName,
            property,
          },
        });
        return;
      }

      const prop = findProperty(optionsArg, property);

      if (!prop) {
        context.report({
          node: info.decoratorNode,
          messageId: 'missingDescription',
          data: {
            decorator: info.name,
            controller: controllerName,
            method: methodName,
            property,
          },
        });
        return;
      }

      const evaluated = evaluateStringValue(prop.value);

      if (!evaluated) {
        context.report({
          node: prop.value,
          messageId: 'nonLiteralDescription',
          data: {
            decorator: info.name,
            property,
            kind: 'non-string expression',
          },
        });
        return;
      }

      if (evaluated.kind === 'non-literal') {
        context.report({
          node: prop.value,
          messageId: 'nonLiteralDescription',
          data: {
            decorator: info.name,
            property,
            kind: evaluated.description,
          },
        });
        return;
      }

      if (evaluated.value.trim().length === 0) {
        context.report({
          node: prop.value,
          messageId: 'missingDescription',
          data: {
            decorator: info.name,
            controller: controllerName,
            method: methodName,
            property,
          },
        });
      }
    }

    function checkMethod(
      method: TSESTree.MethodDefinition,
      controllerName: string,
    ): void {
      const httpDecorator = methodHttpDecorator(method);

      if (!httpDecorator) {
        return;
      }

      const methodName = getMethodName(method);
      const decorators = method.decorators ?? [];

      let apiOperation: DecoratorCallInfo | undefined;
      const successResponses: DecoratorCallInfo[] = [];

      for (const d of decorators) {
        const info = getDecoratorCallInfo(d);

        if (!info) {
          continue;
        }

        if (info.name === API_OPERATION_DECORATOR) {
          apiOperation = info;
          continue;
        }

        if (successResponseDecorators.has(info.name)) {
          successResponses.push(info);
        }
      }

      if (apiOperation) {
        checkLiteralProperty(
          apiOperation,
          'description',
          controllerName,
          methodName,
        );

        if (requireOperationSummary) {
          checkLiteralProperty(
            apiOperation,
            'summary',
            controllerName,
            methodName,
          );
        }
      } else {
        context.report({
          node: method.key,
          messageId: 'missingApiOperation',
          data: { controller: controllerName, method: methodName },
        });
      }

      if (successResponses.length === 0) {
        context.report({
          node: method.key,
          messageId: 'missingSuccessResponse',
          data: {
            controller: controllerName,
            method: methodName,
            allowed: allowedList,
          },
        });
      }
    }

    return {
      ClassDeclaration(node) {
        if (!isClassController(node)) {
          return;
        }

        const controllerName = getControllerName(node);

        for (const member of node.body.body) {
          if (member.type !== AST_NODE_TYPES.MethodDefinition) {
            continue;
          }

          checkMethod(member, controllerName);
        }
      },
    };
  },
});
