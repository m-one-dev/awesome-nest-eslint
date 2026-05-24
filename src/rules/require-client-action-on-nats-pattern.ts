import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { createRule } from '../utils/create-rule.js';

type MessageIds = 'notMemberExpression' | 'computedAccess' | 'wrongEnumSuffix';

const PATTERN_DECORATOR_NAMES = new Set<string>([
  'MessagePattern',
  'EventPattern',
]);
const CLIENT_METHOD_NAMES = new Set<string>(['send', 'emit']);
const ABSTRACT_CLIENT_SERVICE_NAME = 'AbstractClientService';
const CLIENT_SERVICE_SUFFIX = 'ClientService';
const CLIENT_ACTION_SUFFIX = 'ClientAction';

type SiteLabel =
  | '@MessagePattern'
  | '@EventPattern'
  | 'this.send(...)'
  | 'this.emit(...)';

function unwrap(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  while (
    current.type === AST_NODE_TYPES.TSAsExpression ||
    current.type === AST_NODE_TYPES.TSNonNullExpression ||
    current.type === AST_NODE_TYPES.TSSatisfiesExpression
  ) {
    current = current.expression;
  }
  return current;
}

function getEnumIdentifierName(
  member: TSESTree.MemberExpression,
): string | null {
  const { object } = member;
  if (object.type === AST_NODE_TYPES.Identifier) {
    return object.name;
  }
  if (
    object.type === AST_NODE_TYPES.MemberExpression &&
    !object.computed &&
    object.property.type === AST_NODE_TYPES.Identifier
  ) {
    return object.property.name;
  }
  return null;
}

function findEnclosingClassName(node: TSESTree.Node): string | null {
  let current: TSESTree.Node | undefined = node.parent;
  while (current) {
    if (
      current.type === AST_NODE_TYPES.ClassDeclaration ||
      current.type === AST_NODE_TYPES.ClassExpression
    ) {
      return current.id?.name ?? null;
    }
    current = current.parent;
  }
  return null;
}

function isThisOrSuper(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.ThisExpression ||
    node.type === AST_NODE_TYPES.Super
  );
}

interface ValidationFailure {
  messageId: MessageIds;
  data: Record<string, string>;
}

function validateFirstArg(
  arg: TSESTree.CallExpressionArgument,
  site: SiteLabel,
): ValidationFailure | null {
  if (arg.type === AST_NODE_TYPES.SpreadElement) {
    return {
      messageId: 'notMemberExpression',
      data: { site, nodeType: 'SpreadElement' },
    };
  }

  const unwrapped = unwrap(arg);

  if (unwrapped.type !== AST_NODE_TYPES.MemberExpression) {
    return {
      messageId: 'notMemberExpression',
      data: { site, nodeType: unwrapped.type },
    };
  }

  if (unwrapped.computed) {
    return { messageId: 'computedAccess', data: { site } };
  }

  const enumName = getEnumIdentifierName(unwrapped);
  if (enumName === null) {
    return {
      messageId: 'notMemberExpression',
      data: { site, nodeType: unwrapped.object.type },
    };
  }

  if (!enumName.endsWith(CLIENT_ACTION_SUFFIX)) {
    return {
      messageId: 'wrongEnumSuffix',
      data: { site, rootName: enumName },
    };
  }

  return null;
}

export const requireClientActionOnNatsPattern = createRule<[], MessageIds>({
  name: 'require-client-action-on-nats-pattern',
  meta: {
    type: 'problem',
    docs: {
      description:
        "NATS routing keys passed to '@MessagePattern', '@EventPattern', or 'this.send' / 'this.emit' inside a *ClientService class must be a non-computed member access on a *ClientAction enum (e.g. AuthClientAction.LOGIN). Literals, variable rebinds, function calls, computed access, and other shapes defeat symbol-grep, Sentry grouping, and rename-symbol safety.",
    },
    messages: {
      notMemberExpression:
        'First argument to {{site}} must be a member access on a *ClientAction enum (e.g. AuthClientAction.LOGIN). Got: {{nodeType}}.',
      computedAccess:
        "First argument to {{site}} must use dot-access on a *ClientAction enum. Computed access (e.g. AuthClientAction['LOGIN']) defeats grep-based tracing. Use AuthClientAction.LOGIN instead.",
      wrongEnumSuffix:
        "First argument to {{site}} must be a member access on an enum whose name ends in 'ClientAction'. Got root: '{{rootName}}'. Rename the enum or use an existing *ClientAction enum.",
    },
    schema: [],
    defaultOptions: [],
  },
  create(context) {
    return {
      Decorator(node: TSESTree.Decorator): void {
        const { expression } = node;
        if (expression.type !== AST_NODE_TYPES.CallExpression) {
          return;
        }
        const { callee } = expression;
        if (callee.type !== AST_NODE_TYPES.Identifier) {
          return;
        }
        if (!PATTERN_DECORATOR_NAMES.has(callee.name)) {
          return;
        }

        const site: SiteLabel =
          callee.name === 'MessagePattern'
            ? '@MessagePattern'
            : '@EventPattern';

        const firstArg = expression.arguments[0];
        if (!firstArg) {
          return;
        }

        const failure = validateFirstArg(firstArg, site);
        if (failure) {
          context.report({
            node: firstArg,
            messageId: failure.messageId,
            data: failure.data,
          });
        }
      },

      CallExpression(node: TSESTree.CallExpression): void {
        const { callee } = node;
        if (
          callee.type !== AST_NODE_TYPES.MemberExpression ||
          callee.computed
        ) {
          return;
        }
        if (!isThisOrSuper(callee.object)) {
          return;
        }
        if (callee.property.type !== AST_NODE_TYPES.Identifier) {
          return;
        }
        const methodName = callee.property.name;
        if (!CLIENT_METHOD_NAMES.has(methodName)) {
          return;
        }

        const className = findEnclosingClassName(node);
        if (className === null) {
          return;
        }
        if (!className.endsWith(CLIENT_SERVICE_SUFFIX)) {
          return;
        }
        if (className === ABSTRACT_CLIENT_SERVICE_NAME) {
          return;
        }

        const site: SiteLabel =
          methodName === 'send' ? 'this.send(...)' : 'this.emit(...)';

        const firstArg = node.arguments[0];
        if (!firstArg) {
          return;
        }

        const failure = validateFirstArg(firstArg, site);
        if (failure) {
          context.report({
            node: firstArg,
            messageId: failure.messageId,
            data: failure.data,
          });
        }
      },
    };
  },
});
