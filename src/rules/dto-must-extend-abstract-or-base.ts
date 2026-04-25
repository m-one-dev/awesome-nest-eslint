import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import * as ts from 'typescript';

import { createRule } from '../utils/create-rule.js';

type MessageIds = 'mustExtend';

const BASE_NAMES: ReadonlySet<string> = new Set(['AbstractDto', 'BaseDto']);

const ALLOWLISTED_NAMES: ReadonlySet<string> = new Set([
  'AbstractDto',
  'BaseDto',
  'TranslatableDto',
  'AbstractTranslationDto',
]);

const MAX_HERITAGE_DEPTH = 10;

export const dtoMustExtendAbstractOrBase = createRule<[], MessageIds>({
  name: 'dto-must-extend-abstract-or-base',
  meta: {
    type: 'problem',
    docs: {
      description:
        "Classes with names ending in 'Dto' must transitively extend AbstractDto or BaseDto.",
    },
    messages: {
      mustExtend:
        "Class '{{name}}' ends with 'Dto' and must extend AbstractDto or BaseDto (directly or transitively).",
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
        const name = current.type.getSymbol()?.getName();
        if (name && BASE_NAMES.has(name)) {
          return true;
        }
        const bases = current.type.getBaseTypes() ?? [];
        for (const base of bases) {
          stack.push({ type: base, depth: current.depth + 1 });
        }
      }
      return false;
    }

    function resolveHeritageType(
      expr: ts.ExpressionWithTypeArguments,
    ): ts.Type | undefined {
      const symbol = checker.getSymbolAtLocation(expr.expression);
      if (!symbol) {
        return undefined;
      }
      const aliased =
        symbol.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(symbol)
          : symbol;
      return checker.getDeclaredTypeOfSymbol(aliased);
    }

    function check(
      node: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
    ): void {
      if (!node.id?.name.endsWith('Dto')) {
        return;
      }
      const className = node.id.name;
      if (ALLOWLISTED_NAMES.has(className)) {
        return;
      }

      const tsNode = services.esTreeNodeToTSNodeMap.get(
        node,
      ) as ts.ClassLikeDeclaration;
      const extendsClause = tsNode.heritageClauses?.find(
        (hc) => hc.token === ts.SyntaxKind.ExtendsKeyword,
      );
      const baseExpressions = extendsClause?.types ?? [];

      let matched = false;
      for (const baseExpr of baseExpressions) {
        const baseType = resolveHeritageType(baseExpr);
        if (baseType && chainReachesBase(baseType)) {
          matched = true;
          break;
        }
      }
      if (matched) {
        return;
      }

      context.report({
        node: node.id,
        messageId: 'mustExtend',
        data: { name: className },
      });
    }

    return {
      [AST_NODE_TYPES.ClassDeclaration]: check,
      [AST_NODE_TYPES.ClassExpression]: check,
    };
  },
});
