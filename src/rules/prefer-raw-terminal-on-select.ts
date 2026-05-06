import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES, ASTUtils, ESLintUtils } from '@typescript-eslint/utils';
import * as ts from 'typescript';

import { createRule } from '../utils/create-rule.js';

type MessageIds =
  | 'useRawTerminal'
  | 'requireDeepPartialGeneric'
  | 'semanticTerminalNeedsManualRewrite';

const SAFE_REWRITE_MAP: ReadonlyMap<string, string> = new Map([
  ['getOne', 'getRawOne'],
  ['getMany', 'getRawMany'],
]);

const SUGGEST_ONLY_TERMINALS: ReadonlySet<string> = new Set([
  'getOneOrFail',
  'getManyAndCount',
]);

const RAW_TERMINALS: ReadonlySet<string> = new Set([
  'getRawOne',
  'getRawMany',
]);

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
  entityName: string | null;
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
        'When a TypeORM SelectQueryBuilder chain calls .select / .addSelect, force the terminal to be getRawOne / getRawMany typed as DeepPartial<Entity>. Hydrated terminals (getOne, getMany, ...) return mismatched shapes for projected rows.',
    },
    messages: {
      useRawTerminal:
        "'{{method}}' on a SelectQueryBuilder after .select / .addSelect is not allowed. Use '{{rawMethod}}<DeepPartial<{{entity}}>>()' instead.",
      requireDeepPartialGeneric:
        "'{{method}}' after .select / .addSelect must declare its row shape as 'DeepPartial<{{entity}}>'.",
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
          const ref = cur.type as ts.TypeReference;
          const args = checker.getTypeArguments(ref);
          const entType = args?.[0];
          if (!entType) return { isQb: true, entityName: null };
          if (
            (entType.flags &
              (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter)) !==
            0
          ) {
            return { isQb: true, entityName: null };
          }
          const entSymbol = entType.getSymbol() ?? entType.aliasSymbol;
          const entName = entSymbol?.getName();
          if (!entName || entName.startsWith('__') || !/^[A-Za-z_]\w*$/.test(entName)) {
            return { isQb: true, entityName: null };
          }
          return { isQb: true, entityName: entName };
        }
        for (const base of cur.type.getBaseTypes() ?? []) {
          stack.push({ type: base, depth: cur.depth + 1 });
        }
      }
      return { isQb: false, entityName: null };
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
        if (!parent || parent.type !== AST_NODE_TYPES.MemberExpression) continue;
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

    function findExistingTypeormImport(): TSESTree.ImportDeclaration | null {
      for (const stmt of sourceCode.ast.body) {
        if (
          stmt.type === AST_NODE_TYPES.ImportDeclaration &&
          stmt.source.value === 'typeorm'
        ) {
          return stmt;
        }
      }
      return null;
    }

    function buildImportFix(
      fixer: TSESLint.RuleFixer,
    ): TSESLint.RuleFix | null {
      const existing = findExistingTypeormImport();
      if (existing) {
        const named = existing.specifiers.filter(
          (s): s is TSESTree.ImportSpecifier =>
            s.type === AST_NODE_TYPES.ImportSpecifier,
        );
        const has = named.some(
          (s) =>
            s.imported.type === AST_NODE_TYPES.Identifier &&
            s.imported.name === 'DeepPartial',
        );
        if (has) return null;
        const lastNamed = named.at(-1);
        if (lastNamed) {
          return fixer.insertTextAfter(lastNamed, ', DeepPartial');
        }
        return fixer.insertTextAfter(
          existing,
          "\nimport { DeepPartial } from 'typeorm';",
        );
      }
      const imports = sourceCode.ast.body.filter(
        (n): n is TSESTree.ImportDeclaration =>
          n.type === AST_NODE_TYPES.ImportDeclaration,
      );
      const lastImport = imports.at(-1);
      if (lastImport) {
        return fixer.insertTextAfter(
          lastImport,
          "\nimport { DeepPartial } from 'typeorm';",
        );
      }
      return fixer.insertTextBeforeRange(
        [0, 0],
        "import { DeepPartial } from 'typeorm';\n\n",
      );
    }

    function genericText(entity: string): string {
      return `<DeepPartial<${entity}>>`;
    }

    function existingGenericIsDeepPartial(
      typeArgs: TSESTree.TSTypeParameterInstantiation,
    ): boolean {
      const params = typeArgs.params;
      const p = params[0];
      if (params.length !== 1 || !p) return false;
      if (p.type !== AST_NODE_TYPES.TSTypeReference) return false;
      const name = p.typeName;
      if (name.type !== AST_NODE_TYPES.Identifier) return false;
      return name.name === 'DeepPartial';
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

        const receiverTsNode = services.esTreeNodeToTSNodeMap.get(callee.object);
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

        const entity = qbInfo.entityName;

        if (RAW_TERMINALS.has(method)) {
          if (node.typeArguments) {
            if (existingGenericIsDeepPartial(node.typeArguments)) return;
            context.report({
              node: callee.property,
              messageId: 'requireDeepPartialGeneric',
              data: { method, entity: entity ?? 'Entity' },
            });
            return;
          }
          if (!entity) {
            context.report({
              node: callee.property,
              messageId: 'requireDeepPartialGeneric',
              data: { method, entity: 'Entity' },
            });
            return;
          }
          context.report({
            node: callee.property,
            messageId: 'requireDeepPartialGeneric',
            data: { method, entity },
            *fix(fixer) {
              yield fixer.insertTextAfter(callee.property, genericText(entity));
              const importFix = buildImportFix(fixer);
              if (importFix) yield importFix;
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
        if (!entity) {
          context.report({
            node: callee.property,
            messageId: 'useRawTerminal',
            data: { method, rawMethod, entity: 'Entity' },
          });
          return;
        }
        context.report({
          node: callee.property,
          messageId: 'useRawTerminal',
          data: { method, rawMethod, entity },
          *fix(fixer) {
            yield fixer.replaceText(
              callee.property,
              `${rawMethod}${genericText(entity)}`,
            );
            const importFix = buildImportFix(fixer);
            if (importFix) yield importFix;
          },
        });
      },
    };
  },
});
