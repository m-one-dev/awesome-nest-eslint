import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import * as ts from 'typescript';

import { createRule } from '../utils/create-rule.js';

type MessageIds = 'mustExpose';

const BASE_NAME = 'BaseDto';

/**
 * `Expose` itself, or a field decorator (`StringField`, `ClassFieldOptional`,
 * ...) — every one of which applies `Expose`. `ApiProperty` and class-validator
 * decorators are deliberately absent: they document or validate a property
 * without exposing it.
 */
const EXPOSING_DECORATOR_RE = /^(?:Expose|\w*Field(?:Optional)?)$/;

const MAX_HERITAGE_DEPTH = 10;

export const baseDtoPropertyMustExpose = createRule<[], MessageIds>({
  name: 'base-dto-property-must-expose',
  meta: {
    type: 'problem',
    docs: {
      description:
        "Instance properties of classes extending BaseDto must carry '@Expose()' or a field decorator, or BaseDto.create() silently drops them.",
    },
    messages: {
      mustExpose:
        "Property '{{property}}' of '{{className}}' has no field decorator or '@Expose()'. BaseDto.create() runs plainToInstance with excludeExtraneousValues, so it is silently dropped.",
    },
    schema: [],
    defaultOptions: [],
  },
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    function chainReachesBase(startType: ts.Type): boolean {
      const seen = new Set<ts.Type>();
      const stack: Array<{ type: ts.Type; depth: number }> = [
        { type: startType, depth: 0 },
      ];
      while (stack.length > 0) {
        const current = stack.pop();
        if (!current || seen.has(current.type)) {
          continue;
        }
        seen.add(current.type);
        if (current.depth > MAX_HERITAGE_DEPTH) {
          continue;
        }
        if (current.type.getSymbol()?.getName() === BASE_NAME) {
          return true;
        }
        for (const base of current.type.getBaseTypes() ?? []) {
          stack.push({ type: base, depth: current.depth + 1 });
        }
      }
      return false;
    }

    function extendsBaseDto(
      node: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
    ): boolean {
      const tsNode = services.esTreeNodeToTSNodeMap.get(
        node,
      ) as ts.ClassLikeDeclaration;
      const extendsClause = tsNode.heritageClauses?.find(
        (hc) => hc.token === ts.SyntaxKind.ExtendsKeyword,
      );
      return (extendsClause?.types ?? []).some((expr) => {
        const symbol = checker.getSymbolAtLocation(expr.expression);
        if (!symbol) {
          return false;
        }
        const aliased =
          symbol.flags & ts.SymbolFlags.Alias
            ? checker.getAliasedSymbol(symbol)
            : symbol;
        return chainReachesBase(checker.getDeclaredTypeOfSymbol(aliased));
      });
    }

    /** Only a called decorator applies anything; `@Expose` bare does not. */
    function decoratorFactoryName(
      decorator: TSESTree.Decorator,
    ): string | null {
      const expr = decorator.expression;
      if (expr.type !== AST_NODE_TYPES.CallExpression) {
        return null;
      }
      if (expr.callee.type === AST_NODE_TYPES.Identifier) {
        return expr.callee.name;
      }
      if (
        expr.callee.type === AST_NODE_TYPES.MemberExpression &&
        !expr.callee.computed &&
        expr.callee.property.type === AST_NODE_TYPES.Identifier
      ) {
        return expr.callee.property.name;
      }
      return null;
    }

    function className(
      node: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
    ): string {
      if (node.id) {
        return node.id.name;
      }
      const parent = node.parent;
      if (
        parent.type === AST_NODE_TYPES.VariableDeclarator &&
        parent.id.type === AST_NODE_TYPES.Identifier
      ) {
        return parent.id.name;
      }
      return '<anonymous>';
    }

    function check(
      node: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
    ): void {
      if (!node.superClass || !extendsBaseDto(node)) {
        return;
      }

      for (const member of node.body.body) {
        if (
          member.type !== AST_NODE_TYPES.PropertyDefinition ||
          member.static ||
          member.declare ||
          member.computed ||
          member.key.type !== AST_NODE_TYPES.Identifier
        ) {
          continue;
        }

        const exposed = member.decorators.some((decorator) => {
          const name = decoratorFactoryName(decorator);
          return name !== null && EXPOSING_DECORATOR_RE.test(name);
        });
        if (exposed) {
          continue;
        }

        context.report({
          node: member.key,
          messageId: 'mustExpose',
          data: { property: member.key.name, className: className(node) },
        });
      }
    }

    return {
      [AST_NODE_TYPES.ClassDeclaration]: check,
      [AST_NODE_TYPES.ClassExpression]: check,
    };
  },
});
