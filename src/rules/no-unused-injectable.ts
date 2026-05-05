import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import * as ts from 'typescript';

import { createRule } from '../utils/create-rule.js';

type MessageIds = 'unusedInjectable';

export interface Options {
  exemptDecorators?: string[];
  exemptInterfaces?: string[];
}

const INJECTABLE_DECORATOR = 'Injectable';
const MODULE_DECORATOR = 'Module';

const BUILTIN_EXEMPT_METHOD_DECORATORS = new Set<string>([
  'MessagePattern',
  'EventPattern',
  'SubscribeMessage',
  'Cron',
  'Interval',
  'Timeout',
  'Sse',
  'Get',
  'Post',
  'Put',
  'Patch',
  'Delete',
]);

const BUILTIN_EXEMPT_CLASS_DECORATORS = new Set<string>([
  'Catch',
  'WebSocketGateway',
]);

const BUILTIN_EXEMPT_INTERFACES = new Set<string>([
  'OnModuleInit',
  'OnModuleDestroy',
  'OnApplicationBootstrap',
  'OnApplicationShutdown',
  'BeforeApplicationShutdown',
]);

const BUILTIN_EXEMPT_BASE_CLASSES = new Set<string>([
  'PassportStrategy',
  'BaseExceptionFilter',
  'WebSocketGateway',
]);

interface ReverseIndexEntry {
  identifiers: ts.Identifier[];
}

const reverseIndexCache = new WeakMap<
  ts.Program,
  Map<ts.Symbol, ReverseIndexEntry>
>();

function buildReverseIndex(
  program: ts.Program,
  checker: ts.TypeChecker,
): Map<ts.Symbol, ReverseIndexEntry> {
  const cached = reverseIndexCache.get(program);
  if (cached) {
    return cached;
  }
  const index = new Map<ts.Symbol, ReverseIndexEntry>();
  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) {
      continue;
    }
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node)) {
        const symbol = checker.getSymbolAtLocation(node);
        if (symbol) {
          const target = symbol.flags & ts.SymbolFlags.Alias
            ? checker.getAliasedSymbol(symbol)
            : symbol;
          let entry = index.get(target);
          if (!entry) {
            entry = { identifiers: [] };
            index.set(target, entry);
          }
          entry.identifiers.push(node);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  reverseIndexCache.set(program, index);
  return index;
}

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

function classHasInjectableDecorator(
  node: TSESTree.ClassDeclaration,
): TSESTree.Decorator | null {
  for (const decorator of node.decorators ?? []) {
    if (getDecoratorName(decorator) === INJECTABLE_DECORATOR) {
      return decorator;
    }
  }
  return null;
}

function classIsExempt(
  node: TSESTree.ClassDeclaration,
  exemptDecorators: Set<string>,
  exemptInterfaces: Set<string>,
): boolean {
  for (const decorator of node.decorators ?? []) {
    const name = getDecoratorName(decorator);
    if (!name) {
      continue;
    }
    if (BUILTIN_EXEMPT_CLASS_DECORATORS.has(name)) {
      return true;
    }
    if (exemptDecorators.has(name)) {
      return true;
    }
  }

  if (node.superClass && node.superClass.type === AST_NODE_TYPES.Identifier) {
    if (BUILTIN_EXEMPT_BASE_CLASSES.has(node.superClass.name)) {
      return true;
    }
  }
  if (
    node.superClass &&
    node.superClass.type === AST_NODE_TYPES.CallExpression &&
    node.superClass.callee.type === AST_NODE_TYPES.Identifier &&
    BUILTIN_EXEMPT_BASE_CLASSES.has(node.superClass.callee.name)
  ) {
    return true;
  }

  for (const impl of node.implements ?? []) {
    const expr = impl.expression;
    if (expr.type === AST_NODE_TYPES.Identifier) {
      if (
        BUILTIN_EXEMPT_INTERFACES.has(expr.name) ||
        exemptInterfaces.has(expr.name)
      ) {
        return true;
      }
    }
  }

  for (const member of node.body.body) {
    if (
      member.type !== AST_NODE_TYPES.MethodDefinition &&
      member.type !== AST_NODE_TYPES.PropertyDefinition
    ) {
      continue;
    }
    for (const decorator of member.decorators ?? []) {
      const name = getDecoratorName(decorator);
      if (!name) {
        continue;
      }
      if (BUILTIN_EXEMPT_METHOD_DECORATORS.has(name)) {
        return true;
      }
      if (exemptDecorators.has(name)) {
        return true;
      }
    }
  }

  return false;
}

function isInsideModuleRegistrationArray(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isArrayLiteralExpression(current)) {
      return true;
    }
    if (
      ts.isCallExpression(current) &&
      ts.isIdentifier(current.expression) &&
      current.expression.text === MODULE_DECORATOR
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isImportSpecifierLike(identifier: ts.Identifier): boolean {
  const parent = identifier.parent;
  if (!parent) return false;
  return (
    ts.isImportSpecifier(parent) ||
    ts.isImportClause(parent) ||
    ts.isNamespaceImport(parent) ||
    ts.isExportSpecifier(parent)
  );
}

function isClassDeclarationName(identifier: ts.Identifier): boolean {
  const parent = identifier.parent;
  if (!parent) return false;
  if (ts.isClassDeclaration(parent) || ts.isClassExpression(parent)) {
    return parent.name === identifier;
  }
  return false;
}

export const noUnusedInjectable = createRule<[Options], MessageIds>({
  name: 'no-unused-injectable',
  meta: {
    type: 'problem',
    docs: {
      description:
        '@Injectable() services must be injected somewhere. Flags providers that are only registered in @Module() decorators (or nowhere) and never consumed.',
    },
    messages: {
      unusedInjectable:
        "@Injectable() class '{{className}}' is never injected anywhere. Remove the @Injectable() decorator, or inject it where it's used.",
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          exemptDecorators: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
          exemptInterfaces: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
        },
      },
    ],
    defaultOptions: [{ exemptDecorators: [], exemptInterfaces: [] }],
  },
  create(context, [rawOptions]) {
    const exemptDecorators = new Set(rawOptions.exemptDecorators ?? []);
    const exemptInterfaces = new Set(rawOptions.exemptInterfaces ?? []);

    const services = ESLintUtils.getParserServices(context, true);
    if (!services.program) {
      return {};
    }
    const program = services.program;
    const checker = program.getTypeChecker();

    return {
      ClassDeclaration(node): void {
        if (!node.id) {
          return;
        }
        const injectableDecorator = classHasInjectableDecorator(node);
        if (!injectableDecorator) {
          return;
        }
        if (classIsExempt(node, exemptDecorators, exemptInterfaces)) {
          return;
        }

        const tsClassNode = services.esTreeNodeToTSNodeMap.get(node);
        if (!tsClassNode) {
          return;
        }
        const classSymbol = checker.getSymbolAtLocation(
          (tsClassNode as ts.ClassDeclaration).name ?? tsClassNode,
        );
        if (!classSymbol) {
          return;
        }

        const index = buildReverseIndex(program, checker);
        const target =
          classSymbol.flags & ts.SymbolFlags.Alias
            ? checker.getAliasedSymbol(classSymbol)
            : classSymbol;
        const entry = index.get(target);
        const identifiers = entry?.identifiers ?? [];

        let hasUsage = false;
        for (const id of identifiers) {
          if (isClassDeclarationName(id)) {
            continue;
          }
          if (isImportSpecifierLike(id)) {
            continue;
          }
          if (isInsideModuleRegistrationArray(id)) {
            continue;
          }
          hasUsage = true;
          break;
        }

        if (hasUsage) {
          return;
        }

        context.report({
          node: injectableDecorator,
          messageId: 'unusedInjectable',
          data: { className: node.id.name },
        });
      },
    };
  },
});
