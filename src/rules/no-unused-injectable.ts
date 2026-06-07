import * as fs from 'node:fs';
import * as path from 'node:path';
import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import * as ts from 'typescript';

import { createRule } from '../utils/create-rule.js';

type MessageIds = 'unusedInjectable';

export interface Options {
  exemptDecorators?: string[];
  exemptInterfaces?: string[];
  workspaceTsconfigPath?: string;
}

const INJECTABLE_DECORATOR = 'Injectable';
const MODULE_DECORATOR = 'Module';
const DEFAULT_WORKSPACE_TSCONFIG = 'tsconfig.eslint.json';
const TINY_PROGRAM_THRESHOLD = 5;

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

interface WorkspaceProgram {
  program: ts.Program;
  checker: ts.TypeChecker;
  sourceFileLookup: Map<string, ts.SourceFile>;
  reverseIndex: Map<ts.Symbol, ReverseIndexEntry>;
  fileCount: number;
}

const workspaceProgramCache = new Map<string, WorkspaceProgram | null>();
const warnedConditions = new Set<string>();

const reverseIndexCache = new WeakMap<
  ts.Program,
  Map<ts.Symbol, ReverseIndexEntry>
>();

function debug(message: string): void {
  if (process.env.DEBUG?.includes('awesome-nest')) {
    process.stderr.write(`[awesome-nest/no-unused-injectable] ${message}\n`);
  }
}

function warnOnce(key: string, message: string): void {
  if (warnedConditions.has(key)) {
    return;
  }
  warnedConditions.add(key);
  process.stderr.write(`[awesome-nest/no-unused-injectable] ${message}\n`);
}

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, '/');
}

function tryRealpath(p: string): string | null {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return null;
  }
}

function buildSourceFileLookup(
  program: ts.Program,
): Map<string, ts.SourceFile> {
  const map = new Map<string, ts.SourceFile>();
  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) {
      continue;
    }
    const fileName = sourceFile.fileName;
    map.set(fileName, sourceFile);
    map.set(normalizeSlashes(fileName), sourceFile);
    const real = tryRealpath(fileName);
    if (real) {
      map.set(real, sourceFile);
      map.set(normalizeSlashes(real), sourceFile);
    }
  }
  return map;
}

function lookupSourceFile(
  lookup: Map<string, ts.SourceFile>,
  filename: string,
): ts.SourceFile | undefined {
  const direct = lookup.get(filename) ?? lookup.get(normalizeSlashes(filename));
  if (direct) {
    return direct;
  }
  const real = tryRealpath(filename);
  if (!real) {
    return undefined;
  }
  return lookup.get(real) ?? lookup.get(normalizeSlashes(real));
}

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
          const target =
            symbol.flags & ts.SymbolFlags.Alias
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

function loadWorkspaceProgram(tsconfigPath: string): WorkspaceProgram | null {
  if (workspaceProgramCache.has(tsconfigPath)) {
    return workspaceProgramCache.get(tsconfigPath) ?? null;
  }

  if (!fs.existsSync(tsconfigPath)) {
    debug(`workspace tsconfig not found at ${tsconfigPath}; falling back`);
    workspaceProgramCache.set(tsconfigPath, null);
    return null;
  }

  const parseHost: ts.ParseConfigFileHost = {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (): void => {
      // intentionally swallow; we surface failures via warnOnce below
    },
  };

  const parsed = ts.getParsedCommandLineOfConfigFile(
    tsconfigPath,
    undefined,
    parseHost,
  );
  if (!parsed) {
    warnOnce(
      `parse-failed:${tsconfigPath}`,
      `failed to parse tsconfig at ${tsconfigPath}; cross-project detection disabled.`,
    );
    workspaceProgramCache.set(tsconfigPath, null);
    return null;
  }

  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
  });
  const checker = program.getTypeChecker();
  const sourceFileLookup = buildSourceFileLookup(program);
  const reverseIndex = buildReverseIndex(program, checker);
  const fileCount = program
    .getSourceFiles()
    .filter((f) => !f.isDeclarationFile).length;

  if (fileCount < TINY_PROGRAM_THRESHOLD) {
    warnOnce(
      `tiny-program:${tsconfigPath}`,
      `workspace program at ${tsconfigPath} contains only ${fileCount} non-declaration file(s); cross-project detection may misfire. Check the workspaceTsconfigPath option.`,
    );
  }
  debug(
    `loaded workspace program from ${tsconfigPath}: ${fileCount} files, ${reverseIndex.size} indexed symbols`,
  );

  const result: WorkspaceProgram = {
    program,
    checker,
    sourceFileLookup,
    reverseIndex,
    fileCount,
  };
  workspaceProgramCache.set(tsconfigPath, result);
  return result;
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

function findClassDeclaration(
  sourceFile: ts.SourceFile,
  className: string,
  startOffset: number,
): ts.ClassDeclaration | undefined {
  let result: ts.ClassDeclaration | undefined;
  const visit = (node: ts.Node): void => {
    if (result) {
      return;
    }
    if (
      ts.isClassDeclaration(node) &&
      node.name?.text === className &&
      node.name.getStart(sourceFile) === startOffset
    ) {
      result = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return result;
}

function hasRealUsage(identifiers: readonly ts.Identifier[]): boolean {
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
    return true;
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
          workspaceTsconfigPath: {
            type: 'string',
            minLength: 1,
          },
        },
      },
    ],
    defaultOptions: [{ exemptDecorators: [], exemptInterfaces: [] }],
  },
  create(context, [rawOptions]) {
    const exemptDecorators = new Set(rawOptions.exemptDecorators ?? []);
    const exemptInterfaces = new Set(rawOptions.exemptInterfaces ?? []);
    const workspaceTsconfigOption =
      rawOptions.workspaceTsconfigPath ?? DEFAULT_WORKSPACE_TSCONFIG;

    const cwd = context.cwd ?? process.cwd();
    const resolvedWorkspaceTsconfig = path.isAbsolute(workspaceTsconfigOption)
      ? workspaceTsconfigOption
      : path.resolve(cwd, workspaceTsconfigOption);

    const services = ESLintUtils.getParserServices(context, true);

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

        const workspace = loadWorkspaceProgram(resolvedWorkspaceTsconfig);

        if (workspace) {
          const sourceFile = lookupSourceFile(
            workspace.sourceFileLookup,
            context.filename,
          );
          if (!sourceFile) {
            warnOnce(
              `file-not-in-program:${context.filename}`,
              `file ${context.filename} is not in the workspace program at ${resolvedWorkspaceTsconfig}; skipping. Make sure the tsconfig include patterns cover this file.`,
            );
            return;
          }

          const tsClass = findClassDeclaration(
            sourceFile,
            node.id.name,
            node.id.range[0],
          );
          if (!tsClass?.name) {
            return;
          }

          const classSymbol = workspace.checker.getSymbolAtLocation(
            tsClass.name,
          );
          if (!classSymbol) {
            return;
          }

          const target =
            classSymbol.flags & ts.SymbolFlags.Alias
              ? workspace.checker.getAliasedSymbol(classSymbol)
              : classSymbol;
          const entry = workspace.reverseIndex.get(target);
          const identifiers = entry?.identifiers ?? [];

          if (hasRealUsage(identifiers)) {
            return;
          }

          context.report({
            node: injectableDecorator,
            messageId: 'unusedInjectable',
            data: { className: node.id.name },
          });
          return;
        }

        // Fallback: workspace tsconfig not configured/found. Use the per-file
        // program from parserServices. Correct for single-tsconfig repos;
        // may false-positive in monorepos with per-package tsconfigs (set the
        // workspaceTsconfigPath option to fix).
        if (!services.program) {
          return;
        }
        const fallbackProgram = services.program;
        const fallbackChecker = fallbackProgram.getTypeChecker();

        const tsClassNode = services.esTreeNodeToTSNodeMap.get(node);
        if (!tsClassNode) {
          return;
        }
        const classSymbol = fallbackChecker.getSymbolAtLocation(
          (tsClassNode as ts.ClassDeclaration).name ?? tsClassNode,
        );
        if (!classSymbol) {
          return;
        }

        const index = buildReverseIndex(fallbackProgram, fallbackChecker);
        const target =
          classSymbol.flags & ts.SymbolFlags.Alias
            ? fallbackChecker.getAliasedSymbol(classSymbol)
            : classSymbol;
        const entry = index.get(target);
        const identifiers = entry?.identifiers ?? [];

        if (hasRealUsage(identifiers)) {
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
