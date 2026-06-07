import type { TSESTree } from '@typescript-eslint/utils';
import {
  AST_NODE_TYPES,
  ASTUtils,
  ESLintUtils,
} from '@typescript-eslint/utils';
import * as ts from 'typescript';

import { createRule } from '../utils/create-rule.js';

type MessageIds =
  | 'useRawTerminal'
  | 'requireGeneric'
  | 'semanticTerminalNeedsManualRewrite';

const SAFE_REWRITE_MAP: ReadonlyMap<string, string> = new Map([
  ['getOne', 'getRawOne'],
  ['getMany', 'getRawMany'],
]);

const SUGGEST_ONLY_TERMINALS: ReadonlySet<string> = new Set([
  'getOneOrFail',
  'getManyAndCount',
]);

const RAW_TERMINALS: ReadonlySet<string> = new Set(['getRawOne', 'getRawMany']);

const ALL_FLAGGED_TERMINALS: ReadonlySet<string> = new Set<string>([
  ...SAFE_REWRITE_MAP.keys(),
  ...SUGGEST_ONLY_TERMINALS,
  ...RAW_TERMINALS,
]);

const QB_TYPE_NAMES: ReadonlySet<string> = new Set([
  'SelectQueryBuilder',
  'QueryBuilder',
]);

const MAX_HERITAGE_DEPTH = 15;

interface QbInfo {
  isQb: boolean;
}

interface ChainAnalysis {
  hasSelect: boolean;
  hasCreateQueryBuilder: boolean;
  rootIdentifier: TSESTree.Identifier | null;
}

export const preferRawTerminalOnSelect = createRule<[], MessageIds>({
  name: 'prefer-raw-terminal-on-select',
  meta: {
    type: 'problem',
    fixable: 'code',
    hasSuggestions: false,
    docs: {
      description:
        'When a TypeORM SelectQueryBuilder chain calls .select / .addSelect, force the terminal to be getRawOne / getRawMany with an explicit generic type argument. Hydrated terminals (getOne, getMany, ...) return mismatched shapes for projected rows.',
    },
    messages: {
      useRawTerminal:
        "'{{method}}' on a SelectQueryBuilder after .select / .addSelect is not allowed. Use '{{rawMethod}}<{}>()' instead.",
      requireGeneric:
        "'{{method}}' after .select / .addSelect requires an explicit generic type argument, e.g. '{{method}}<{}>()'.",
      semanticTerminalNeedsManualRewrite:
        "'{{method}}' after .select / .addSelect changes raw-row semantics; rewrite manually to getRawOne / getRawMany or getRawAndEntities.",
    },
    schema: [],
    defaultOptions: [],
  },
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();
    const sourceCode = context.sourceCode;

    function symbolIsFromTypeorm(symbol: ts.Symbol | undefined): boolean {
      if (!symbol) return false;
      const visited = new Set<ts.Symbol>();
      const stack: ts.Symbol[] = [symbol];
      while (stack.length > 0) {
        const cur = stack.pop();
        if (!cur || visited.has(cur)) continue;
        visited.add(cur);
        const declarations = cur.getDeclarations() ?? [];
        for (const decl of declarations) {
          const fileName = decl.getSourceFile().fileName;
          if (
            fileName.includes('/typeorm/') ||
            fileName.includes('\\typeorm\\')
          ) {
            return true;
          }
        }
        if ((cur.flags & ts.SymbolFlags.Alias) !== 0) {
          try {
            const aliased = checker.getAliasedSymbol(cur);
            if (aliased && aliased !== cur) stack.push(aliased);
          } catch {
            // ignore unresolved aliases
          }
        }
      }
      return false;
    }

    function analyzeReceiverType(type: ts.Type): QbInfo {
      const seen = new Set<ts.Type>();
      const stack: Array<{ type: ts.Type; depth: number }> = [
        { type, depth: 0 },
      ];
      while (stack.length > 0) {
        const cur = stack.pop();
        if (!cur || seen.has(cur.type)) continue;
        seen.add(cur.type);
        if (cur.depth > MAX_HERITAGE_DEPTH) continue;
        if (cur.type.isUnion() || cur.type.isIntersection()) {
          for (const t of cur.type.types) {
            stack.push({ type: t, depth: cur.depth + 1 });
          }
          continue;
        }
        const symbol = cur.type.getSymbol() ?? cur.type.aliasSymbol;
        const name = symbol?.getName();
        if (name && QB_TYPE_NAMES.has(name) && symbolIsFromTypeorm(symbol)) {
          return { isQb: true };
        }
        for (const base of cur.type.getBaseTypes() ?? []) {
          stack.push({ type: base, depth: cur.depth + 1 });
        }
      }
      return { isQb: false };
    }

    function unwrap(node: TSESTree.Node): TSESTree.Node {
      switch (node.type) {
        case AST_NODE_TYPES.ChainExpression:
          return unwrap(node.expression);
        case AST_NODE_TYPES.AwaitExpression:
          return unwrap(node.argument);
        case AST_NODE_TYPES.TSNonNullExpression:
          return unwrap(node.expression);
        case AST_NODE_TYPES.TSAsExpression:
          return unwrap(node.expression);
        case AST_NODE_TYPES.TSTypeAssertion:
          return unwrap(node.expression);
        default:
          return node;
      }
    }

    function analyzeChain(terminal: TSESTree.CallExpression): ChainAnalysis {
      const result: ChainAnalysis = {
        hasSelect: false,
        hasCreateQueryBuilder: false,
        rootIdentifier: null,
      };
      const callee = terminal.callee;
      if (callee.type !== AST_NODE_TYPES.MemberExpression) return result;
      let cur: TSESTree.Node = unwrap(callee.object);
      while (true) {
        if (cur.type === AST_NODE_TYPES.CallExpression) {
          const innerCallee = cur.callee;
          if (
            innerCallee.type === AST_NODE_TYPES.MemberExpression &&
            !innerCallee.computed &&
            innerCallee.property.type === AST_NODE_TYPES.Identifier
          ) {
            const name = innerCallee.property.name;
            if (name === 'select' || name === 'addSelect') {
              result.hasSelect = true;
            }
            if (name === 'createQueryBuilder') {
              result.hasCreateQueryBuilder = true;
              return result;
            }
            cur = unwrap(innerCallee.object);
            continue;
          }
          return result;
        }
        if (cur.type === AST_NODE_TYPES.Identifier) {
          result.rootIdentifier = cur;
          return result;
        }
        return result;
      }
    }

    function variableHasPriorSelect(
      identifier: TSESTree.Identifier,
      beforeStart: number,
    ): boolean {
      const scope = sourceCode.getScope(identifier);
      const variable = ASTUtils.findVariable(scope, identifier.name);
      if (!variable) return false;
      for (const ref of variable.references) {
        const refNode = ref.identifier as TSESTree.Identifier;
        if (refNode.range[0] >= beforeStart) continue;
        const parent = refNode.parent;
        if (!parent || parent.type !== AST_NODE_TYPES.MemberExpression)
          continue;
        if (parent.computed) continue;
        if (parent.object !== refNode) continue;
        if (parent.property.type !== AST_NODE_TYPES.Identifier) continue;
        const grand = parent.parent;
        if (!grand || grand.type !== AST_NODE_TYPES.CallExpression) continue;
        if (grand.callee !== parent) continue;
        const name = parent.property.name;
        if (name === 'select' || name === 'addSelect') return true;
      }
      return false;
    }

    return {
      CallExpression(node: TSESTree.CallExpression): void {
        const callee = node.callee;
        if (
          callee.type !== AST_NODE_TYPES.MemberExpression ||
          callee.computed ||
          callee.property.type !== AST_NODE_TYPES.Identifier
        ) {
          return;
        }
        const method = callee.property.name;
        if (!ALL_FLAGGED_TERMINALS.has(method)) return;

        const receiverTsNode = services.esTreeNodeToTSNodeMap.get(
          callee.object,
        );
        const receiverType = checker.getTypeAtLocation(receiverTsNode);
        const qbInfo = analyzeReceiverType(receiverType);

        const chain = analyzeChain(node);
        let hasSelect = chain.hasSelect;
        if (!hasSelect && chain.rootIdentifier) {
          hasSelect = variableHasPriorSelect(
            chain.rootIdentifier,
            node.range[0],
          );
        }

        const isQb = qbInfo.isQb || chain.hasCreateQueryBuilder;
        if (!isQb) return;
        if (!hasSelect) return;

        if (RAW_TERMINALS.has(method)) {
          if (node.typeArguments) return;
          context.report({
            node: callee.property,
            messageId: 'requireGeneric',
            data: { method },
            *fix(fixer) {
              yield fixer.insertTextAfter(callee.property, '<{}>');
            },
          });
          return;
        }

        if (SUGGEST_ONLY_TERMINALS.has(method)) {
          context.report({
            node: callee.property,
            messageId: 'semanticTerminalNeedsManualRewrite',
            data: { method },
          });
          return;
        }

        const rawMethod = SAFE_REWRITE_MAP.get(method);
        if (!rawMethod) return;
        context.report({
          node: callee.property,
          messageId: 'useRawTerminal',
          data: { method, rawMethod },
          *fix(fixer) {
            yield fixer.replaceText(callee.property, `${rawMethod}<{}>`);
          },
        });
      },
    };
  },
});
