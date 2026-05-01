import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import * as ts from 'typescript';

import { createRule } from '../utils/create-rule.js';

type MessageIds = 'missingUseDto';

const ABSTRACT_ENTITY_NAMES: ReadonlySet<string> = new Set([
  'AbstractEntity',
  'AbstractTranslationEntity',
]);

const ALLOWLISTED_NAMES: ReadonlySet<string> = new Set([
  'AbstractEntity',
  'AbstractTranslationEntity',
]);

const MAX_HERITAGE_DEPTH = 10;

function getDecoratorName(decorator: TSESTree.Decorator): string | null {
  const expr = decorator.expression;
  if (expr.type === AST_NODE_TYPES.Identifier) {
    return expr.name;
  }
  if (
    expr.type === AST_NODE_TYPES.CallExpression &&
    expr.callee.type === AST_NODE_TYPES.Identifier
  ) {
    return expr.callee.name;
  }
  return null;
}

function deriveDtoName(entityClassName: string): string {
  if (entityClassName.endsWith('Entity')) {
    return `${entityClassName.slice(0, -'Entity'.length)}Dto`;
  }
  return `${entityClassName}Dto`;
}

export const requireUseDtoDecorator = createRule<[], MessageIds>({
  name: 'require-use-dto-decorator',
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: {
      description:
        "Concrete classes extending AbstractEntity must have a '@UseDto(...)' decorator so 'entity.toDto()' resolves at runtime.",
    },
    messages: {
      missingUseDto:
        "Entity class '{{name}}' must have a '@UseDto({{dto}})' decorator. Without it, '.toDto()' throws at runtime.",
    },
    schema: [],
    defaultOptions: [],
  },
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();
    const sourceCode = context.sourceCode;

    function chainReachesAbstractEntity(startType: ts.Type): boolean {
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
        if (name && ABSTRACT_ENTITY_NAMES.has(name)) {
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
      if (!node.id) {
        return;
      }
      const className = node.id.name;
      if (ALLOWLISTED_NAMES.has(className)) {
        return;
      }
      if (node.abstract) {
        return;
      }

      const tsNode = services.esTreeNodeToTSNodeMap.get(
        node,
      ) as ts.ClassLikeDeclaration;
      const extendsClause = tsNode.heritageClauses?.find(
        (hc) => hc.token === ts.SyntaxKind.ExtendsKeyword,
      );
      const baseExpressions = extendsClause?.types ?? [];

      let extendsAbstractEntity = false;
      for (const baseExpr of baseExpressions) {
        const baseType = resolveHeritageType(baseExpr);
        if (baseType && chainReachesAbstractEntity(baseType)) {
          extendsAbstractEntity = true;
          break;
        }
      }
      if (!extendsAbstractEntity) {
        return;
      }

      const decorators = node.decorators ?? [];
      const hasUseDto = decorators.some(
        (d) => getDecoratorName(d) === 'UseDto',
      );
      if (hasUseDto) {
        return;
      }

      const dtoName = deriveDtoName(className);

      context.report({
        node: node.id,
        messageId: 'missingUseDto',
        data: { name: className, dto: dtoName },
        fix(fixer): TSESLint.RuleFix {
          const insertionTarget = decorators[0] ?? node;
          const targetLine = sourceCode.lines[insertionTarget.loc.start.line - 1] ?? '';
          const indentMatch = /^\s*/.exec(targetLine);
          const indent = indentMatch ? indentMatch[0] : '';
          return fixer.insertTextBefore(
            insertionTarget,
            `@UseDto(${dtoName})\n${indent}`,
          );
        },
      });
    }

    return {
      [AST_NODE_TYPES.ClassDeclaration]: check,
      [AST_NODE_TYPES.ClassExpression]: check,
    };
  },
});
