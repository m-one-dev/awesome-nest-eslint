import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { ASTUtils, AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import * as ts from 'typescript';

import { createRule } from '../utils/create-rule.js';

type MessageIds = 'tooManyJoins';

export type MaxTypeormJoinsOptions = { max?: number };

type Options = [MaxTypeormJoinsOptions];

const DEFAULT_MAX = 3;

const JOIN_METHODS: ReadonlySet<string> = new Set([
  'leftJoin',
  'innerJoin',
  'leftJoinAndSelect',
  'innerJoinAndSelect',
  'leftJoinAndMapOne',
  'leftJoinAndMapMany',
  'innerJoinAndMapOne',
  'innerJoinAndMapMany',
]);

const QUERY_BUILDER_TYPE_NAMES: ReadonlySet<string> = new Set([
  'SelectQueryBuilder',
  'QueryBuilder',
]);

const MAX_HERITAGE_DEPTH = 15;

export const maxTypeormJoins = createRule<Options, MessageIds>({
  name: 'max-typeorm-joins',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Limits the number of join methods on a single TypeORM QueryBuilder chain. See the typeorm-query skill.',
    },
    messages: {
      tooManyJoins:
        'TypeORM query exceeds the join limit ({{count}} > {{max}}). Reduce joins, split the query, or restructure. See the typeorm-query skill.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          max: { type: 'integer', minimum: 1 },
        },
        additionalProperties: false,
      },
    ],
  },
  defaultOptions: [{ max: DEFAULT_MAX }],
  create(context, [option]): TSESLint.RuleListener {
    const max = option?.max ?? DEFAULT_MAX;
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    function symbolIsFromTypeorm(symbol: ts.Symbol | undefined): boolean {
      if (!symbol) {
        return false;
      }
      const visited = new Set<ts.Symbol>();
      const stack: ts.Symbol[] = [symbol];
      while (stack.length > 0) {
        const current = stack.pop();
        if (!current || visited.has(current)) {
          continue;
        }
        visited.add(current);
        const decls = current.getDeclarations() ?? [];
        for (const decl of decls) {
          const fileName = decl.getSourceFile().fileName;
          if (fileName.includes('/typeorm/') || fileName.includes('\\typeorm\\')) {
            return true;
          }
        }
        if ((current.flags & ts.SymbolFlags.Alias) !== 0) {
          try {
            const aliased = checker.getAliasedSymbol(current);
            if (aliased && aliased !== current) {
              stack.push(aliased);
            }
          } catch {
            // ignore — getAliasedSymbol can throw on unresolved aliases
          }
        }
      }
      return false;
    }

    function isQueryBuilderType(type: ts.Type): boolean {
      const seen = new Set<ts.Type>();
      const stack: Array<{ type: ts.Type; depth: number }> = [
        { type, depth: 0 },
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
        if (current.type.isUnion() || current.type.isIntersection()) {
          for (const sub of current.type.types) {
            stack.push({ type: sub, depth: current.depth + 1 });
          }
          continue;
        }
        const symbol = current.type.getSymbol() ?? current.type.aliasSymbol;
        const name = symbol?.getName();
        if (
          name &&
          QUERY_BUILDER_TYPE_NAMES.has(name) &&
          symbolIsFromTypeorm(symbol)
        ) {
          return true;
        }
        const bases = current.type.getBaseTypes() ?? [];
        for (const base of bases) {
          stack.push({ type: base, depth: current.depth + 1 });
        }
      }
      return false;
    }

    const isQueryBuilderCache = new WeakMap<TSESTree.Node, boolean>();

    function exprIsQueryBuilder(node: TSESTree.Node): boolean {
      const cached = isQueryBuilderCache.get(node);
      if (cached !== undefined) {
        return cached;
      }
      const tsNode = services.esTreeNodeToTSNodeMap.get(node);
      const result = tsNode
        ? isQueryBuilderType(checker.getTypeAtLocation(tsNode))
        : false;
      isQueryBuilderCache.set(node, result);
      return result;
    }

    function unwrapChain(node: TSESTree.Node): TSESTree.Node {
      if (node.type === AST_NODE_TYPES.ChainExpression) {
        return node.expression;
      }
      return node;
    }

    function isCreateQueryBuilderCall(node: TSESTree.Node): boolean {
      if (node.type !== AST_NODE_TYPES.CallExpression) {
        return false;
      }
      const callee = node.callee;
      if (callee.type !== AST_NODE_TYPES.MemberExpression) {
        return false;
      }
      if (
        callee.property.type !== AST_NODE_TYPES.Identifier ||
        callee.property.name !== 'createQueryBuilder'
      ) {
        return false;
      }
      return true;
    }

    const originCache = new WeakMap<
      TSESTree.Node,
      TSESTree.CallExpression | null
    >();

    // .subQuery() opens a nested builder scope; stop the inward walk there so
    // joins inside subqueries aren't attributed to the outer createQueryBuilder.
    function findCreateQueryBuilderOrigin(
      exprRaw: TSESTree.Node,
    ): TSESTree.CallExpression | null {
      const cached = originCache.get(exprRaw);
      if (cached !== undefined) {
        return cached;
      }
      let current: TSESTree.Node = unwrapChain(exprRaw);
      let result: TSESTree.CallExpression | null = null;
      while (true) {
        if (current.type === AST_NODE_TYPES.CallExpression) {
          if (isCreateQueryBuilderCall(current)) {
            result = current;
            break;
          }
          const callee = current.callee;
          if (
            callee.type === AST_NODE_TYPES.MemberExpression &&
            callee.property.type === AST_NODE_TYPES.Identifier &&
            callee.property.name === 'subQuery'
          ) {
            break;
          }
          if (callee.type === AST_NODE_TYPES.MemberExpression) {
            current = unwrapChain(callee.object);
            continue;
          }
          break;
        }
        if (current.type === AST_NODE_TYPES.MemberExpression) {
          current = unwrapChain(current.object);
          continue;
        }
        break;
      }
      originCache.set(exprRaw, result);
      return result;
    }

    function findOriginForIdentifier(
      node: TSESTree.Identifier,
    ): TSESTree.CallExpression | null {
      const scope = context.sourceCode.getScope(node);
      const variable = ASTUtils.findVariable(scope, node.name);
      if (!variable) {
        return null;
      }
      const def = variable.defs[0];
      if (!def) {
        return null;
      }
      if (def.node.type !== AST_NODE_TYPES.VariableDeclarator) {
        return null;
      }
      const init = def.node.init;
      if (!init) {
        return null;
      }
      return findCreateQueryBuilderOrigin(init);
    }

    function findReceiverOrigin(
      receiver: TSESTree.Node,
    ): TSESTree.CallExpression | null {
      const unwrapped = unwrapChain(receiver);
      const chainOrigin = findCreateQueryBuilderOrigin(unwrapped);
      if (chainOrigin) {
        return chainOrigin;
      }
      if (unwrapped.type === AST_NODE_TYPES.Identifier) {
        return findOriginForIdentifier(unwrapped);
      }
      return null;
    }

    const joinCounts = new Map<TSESTree.CallExpression, number>();

    function recordJoin(
      origin: TSESTree.CallExpression,
      reportNode: TSESTree.Node,
    ): void {
      const count = (joinCounts.get(origin) ?? 0) + 1;
      joinCounts.set(origin, count);
      if (count === max + 1) {
        context.report({
          node: reportNode,
          messageId: 'tooManyJoins',
          data: { count, max },
        });
      }
    }

    return {
      'CallExpression:exit'(node: TSESTree.CallExpression): void {
        const callee = node.callee;
        if (
          callee.type !== AST_NODE_TYPES.MemberExpression ||
          callee.computed ||
          callee.property.type !== AST_NODE_TYPES.Identifier
        ) {
          return;
        }
        if (!JOIN_METHODS.has(callee.property.name)) {
          return;
        }
        const origin = findReceiverOrigin(callee.object);
        if (!origin) {
          return;
        }
        if (!exprIsQueryBuilder(callee.object)) {
          return;
        }
        recordJoin(origin, callee.property);
      },
    };
  },
});
