import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { createRule } from '../utils/create-rule.js';

type MessageIds =
  | 'noNewWithObjectLiteral'
  | 'noNewWithEntity'
  | 'noPlainToInstance';

const PLAIN_TO_INSTANCE = 'plainToInstance';

function endsWithDto(name: string): boolean {
  return name.endsWith('Dto');
}

function getNewExpressionTargetName(
  node: TSESTree.NewExpression,
): string | null {
  if (node.callee.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }
  const { name } = node.callee;
  return endsWithDto(name) ? name : null;
}

function getPlainToInstanceTarget(
  node: TSESTree.CallExpression,
): { dtoName: string; dtoNode: TSESTree.Identifier } | null {
  const { callee } = node;
  let isPlainToInstance = false;
  if (
    callee.type === AST_NODE_TYPES.Identifier &&
    callee.name === PLAIN_TO_INSTANCE
  ) {
    isPlainToInstance = true;
  } else if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === PLAIN_TO_INSTANCE &&
    !callee.computed
  ) {
    isPlainToInstance = true;
  }
  if (!isPlainToInstance) {
    return null;
  }
  const firstArg = node.arguments[0];
  if (!firstArg || firstArg.type !== AST_NODE_TYPES.Identifier) {
    return null;
  }
  if (!endsWithDto(firstArg.name)) {
    return null;
  }
  return { dtoName: firstArg.name, dtoNode: firstArg };
}

function findEnclosingStaticCreate(
  node: TSESTree.Node,
): { method: TSESTree.MethodDefinition; className: string | null } | null {
  let current: TSESTree.Node | undefined = node.parent;
  while (current) {
    if (
      current.type === AST_NODE_TYPES.MethodDefinition &&
      current.static &&
      current.key.type === AST_NODE_TYPES.Identifier &&
      current.key.name === 'create'
    ) {
      const classNode = current.parent?.parent;
      const className =
        classNode &&
        (classNode.type === AST_NODE_TYPES.ClassDeclaration ||
          classNode.type === AST_NODE_TYPES.ClassExpression) &&
        classNode.id
          ? classNode.id.name
          : null;
      return { method: current, className };
    }
    current = current.parent;
  }
  return null;
}

export const noDtoDirectInstantiation = createRule<[], MessageIds>({
  name: 'no-dto-direct-instantiation',
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: {
      description:
        "DTOs must be instantiated via 'SomeDto.create(...)' for input DTOs or 'entity.toDto()' / 'entity.toDtos()' for entity-backed DTOs. Direct 'new SomeDto(...)' and 'plainToInstance(SomeDto, ...)' bypass validation and the @UseDto contract.",
    },
    messages: {
      noNewWithObjectLiteral:
        "Do not instantiate '{{name}}' with 'new'. Use '{{name}}.create({...})' so validation runs.",
      noNewWithEntity:
        "Do not instantiate '{{name}}' with 'new'. Use 'entity.toDto()' / 'entity.toDtos()' for entity-backed DTOs, or '{{name}}.create({...})' for input DTOs.",
      noPlainToInstance:
        "Do not call 'plainToInstance({{name}}, ...)'. Use '{{name}}.create(...)' so validation runs.",
    },
    schema: [],
    defaultOptions: [],
  },
  create(context) {
    const sourceCode = context.sourceCode;

    function isInsideOwnStaticCreate(
      node: TSESTree.Node,
      targetName: string,
    ): boolean {
      const enclosing = findEnclosingStaticCreate(node);
      return enclosing !== null && enclosing.className === targetName;
    }

    return {
      NewExpression(node) {
        const name = getNewExpressionTargetName(node);
        if (!name) {
          return;
        }
        if (isInsideOwnStaticCreate(node, name)) {
          return;
        }

        const args = node.arguments;
        const firstArg = args[0];
        const onlyArgIsObjectLiteral =
          args.length === 1 &&
          firstArg !== undefined &&
          firstArg.type === AST_NODE_TYPES.ObjectExpression;

        if (onlyArgIsObjectLiteral) {
          context.report({
            node,
            messageId: 'noNewWithObjectLiteral',
            data: { name },
            fix(fixer): TSESLint.RuleFix {
              const argsText = sourceCode.getText(firstArg);
              return fixer.replaceText(node, `${name}.create(${argsText})`);
            },
          });
          return;
        }

        context.report({
          node,
          messageId: 'noNewWithEntity',
          data: { name },
        });
      },

      CallExpression(node) {
        const target = getPlainToInstanceTarget(node);
        if (!target) {
          return;
        }
        const { dtoName } = target;
        if (isInsideOwnStaticCreate(node, dtoName)) {
          return;
        }

        const args = node.arguments;
        const dataArg = args[1];
        const canFix =
          args.length === 2 &&
          dataArg !== undefined &&
          dataArg.type !== AST_NODE_TYPES.SpreadElement;

        context.report({
          node,
          messageId: 'noPlainToInstance',
          data: { name: dtoName },
          fix: canFix
            ? (fixer): TSESLint.RuleFix => {
                const dataText = sourceCode.getText(dataArg);
                return fixer.replaceText(node, `${dtoName}.create(${dataText})`);
              }
            : null,
        });
      },
    };
  },
});
