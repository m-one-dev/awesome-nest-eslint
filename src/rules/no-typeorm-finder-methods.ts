import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import * as ts from 'typescript';

import { createRule } from '../utils/create-rule.js';

type MessageIds = 'bannedMethod';

// ---------------------------------------------------------------------------
// method classification
// ---------------------------------------------------------------------------

type Terminal = 'getOne' | 'getMany' | 'getManyAndCount' | 'getCount' | 'getExists';

const TERMINAL_BY_METHOD: ReadonlyMap<string, Terminal> = new Map([
  ['find', 'getMany'],
  ['findBy', 'getMany'],
  ['findOne', 'getOne'],
  ['findOneBy', 'getOne'],
  ['findAndCount', 'getManyAndCount'],
  ['findAndCountBy', 'getManyAndCount'],
  ['count', 'getCount'],
  ['countBy', 'getCount'],
  ['exist', 'getExists'],
  ['exists', 'getExists'],
]);

const BY_METHODS: ReadonlySet<string> = new Set([
  'findBy',
  'findOneBy',
  'findAndCountBy',
  'countBy',
]);

const ERROR_ONLY_METHODS: ReadonlySet<string> = new Set([
  'findOneOrFail',
  'findOneByOrFail',
  'sum',
  'average',
  'minimum',
  'maximum',
]);

const BANNED_METHODS: ReadonlySet<string> = new Set<string>([
  ...TERMINAL_BY_METHOD.keys(),
  ...ERROR_ONLY_METHODS,
]);

const TYPEORM_RECEIVER_NAMES: ReadonlySet<string> = new Set([
  'Repository',
  'EntityManager',
  'DataSource',
  'TreeRepository',
  'MongoRepository',
]);

const ENTITY_MANAGER_RECEIVERS: ReadonlySet<string> = new Set([
  'EntityManager',
  'DataSource',
]);

const MAX_HERITAGE_DEPTH = 15;

const RECOGNIZED_OPTION_KEYS: ReadonlySet<string> = new Set([
  'where',
  'relations',
  'select',
  'order',
  'take',
  'skip',
  'withDeleted',
  'cache',
  'lock',
]);

// ---------------------------------------------------------------------------
// operator metadata
// ---------------------------------------------------------------------------

type OperatorArgKind = 'value' | 'array';

interface OperatorBuildArgs {
  qualifiedField: string;
  paramNames: string[];
  inverted: boolean;
}

interface OperatorSpec {
  arity: number;
  argKinds: OperatorArgKind[];
  invertible: boolean;
  // Param-name suffixes (per arg). For 1-arg ops: ['']. For Between: ['Start','End'].
  paramSuffixes: string[];
  build: (a: OperatorBuildArgs) => string;
}

const OPERATORS: ReadonlyMap<string, OperatorSpec> = new Map<string, OperatorSpec>([
  [
    'Equal',
    {
      arity: 1,
      argKinds: ['value'],
      invertible: true,
      paramSuffixes: [''],
      build: ({ qualifiedField, paramNames, inverted }) =>
        `${qualifiedField} ${inverted ? '!=' : '='} :${paramNames[0]}`,
    },
  ],
  [
    'IsNull',
    {
      arity: 0,
      argKinds: [],
      invertible: true,
      paramSuffixes: [],
      build: ({ qualifiedField, inverted }) =>
        `${qualifiedField} IS ${inverted ? 'NOT ' : ''}NULL`,
    },
  ],
  [
    'LessThan',
    {
      arity: 1,
      argKinds: ['value'],
      invertible: true,
      paramSuffixes: [''],
      build: ({ qualifiedField, paramNames, inverted }) =>
        `${qualifiedField} ${inverted ? '>=' : '<'} :${paramNames[0]}`,
    },
  ],
  [
    'LessThanOrEqual',
    {
      arity: 1,
      argKinds: ['value'],
      invertible: true,
      paramSuffixes: [''],
      build: ({ qualifiedField, paramNames, inverted }) =>
        `${qualifiedField} ${inverted ? '>' : '<='} :${paramNames[0]}`,
    },
  ],
  [
    'MoreThan',
    {
      arity: 1,
      argKinds: ['value'],
      invertible: true,
      paramSuffixes: [''],
      build: ({ qualifiedField, paramNames, inverted }) =>
        `${qualifiedField} ${inverted ? '<=' : '>'} :${paramNames[0]}`,
    },
  ],
  [
    'MoreThanOrEqual',
    {
      arity: 1,
      argKinds: ['value'],
      invertible: true,
      paramSuffixes: [''],
      build: ({ qualifiedField, paramNames, inverted }) =>
        `${qualifiedField} ${inverted ? '<' : '>='} :${paramNames[0]}`,
    },
  ],
  [
    'In',
    {
      arity: 1,
      argKinds: ['array'],
      invertible: true,
      paramSuffixes: [''],
      build: ({ qualifiedField, paramNames, inverted }) =>
        `${qualifiedField} ${inverted ? 'NOT IN' : 'IN'} (:...${paramNames[0]})`,
    },
  ],
  [
    'Between',
    {
      arity: 2,
      argKinds: ['value', 'value'],
      invertible: true,
      paramSuffixes: ['Start', 'End'],
      build: ({ qualifiedField, paramNames, inverted }) =>
        `${qualifiedField} ${inverted ? 'NOT BETWEEN' : 'BETWEEN'} :${paramNames[0]} AND :${paramNames[1]}`,
    },
  ],
  [
    'Like',
    {
      arity: 1,
      argKinds: ['value'],
      invertible: true,
      paramSuffixes: [''],
      build: ({ qualifiedField, paramNames, inverted }) =>
        `${qualifiedField} ${inverted ? 'NOT LIKE' : 'LIKE'} :${paramNames[0]}`,
    },
  ],
  [
    'ILike',
    {
      arity: 1,
      argKinds: ['value'],
      invertible: true,
      paramSuffixes: [''],
      build: ({ qualifiedField, paramNames, inverted }) =>
        `${qualifiedField} ${inverted ? 'NOT ILIKE' : 'ILIKE'} :${paramNames[0]}`,
    },
  ],
  [
    'Any',
    {
      arity: 1,
      argKinds: ['array'],
      invertible: true,
      paramSuffixes: [''],
      build: ({ qualifiedField, paramNames, inverted }) => {
        const base = `${qualifiedField} = ANY(:${paramNames[0]})`;
        return inverted ? `NOT (${base})` : base;
      },
    },
  ],
  [
    'ArrayContains',
    {
      arity: 1,
      argKinds: ['array'],
      invertible: true,
      paramSuffixes: [''],
      build: ({ qualifiedField, paramNames, inverted }) => {
        const base = `${qualifiedField} @> :${paramNames[0]}`;
        return inverted ? `NOT (${base})` : base;
      },
    },
  ],
  [
    'ArrayContainedBy',
    {
      arity: 1,
      argKinds: ['array'],
      invertible: true,
      paramSuffixes: [''],
      build: ({ qualifiedField, paramNames, inverted }) => {
        const base = `${qualifiedField} <@ :${paramNames[0]}`;
        return inverted ? `NOT (${base})` : base;
      },
    },
  ],
  [
    'ArrayOverlap',
    {
      arity: 1,
      argKinds: ['array'],
      invertible: true,
      paramSuffixes: [''],
      build: ({ qualifiedField, paramNames, inverted }) => {
        const base = `${qualifiedField} && :${paramNames[0]}`;
        return inverted ? `NOT (${base})` : base;
      },
    },
  ],
]);

// ---------------------------------------------------------------------------
// rule
// ---------------------------------------------------------------------------

export const noTypeormFinderMethods = createRule<[], MessageIds>({
  name: 'no-typeorm-finder-methods',
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: {
      description:
        'Bans TypeORM Repository/EntityManager/DataSource finder methods (find, findOne, count, exist, sum, etc.) in favor of createQueryBuilder. See the typeorm-query skill.',
    },
    messages: {
      bannedMethod:
        "'{{method}}' on a TypeORM {{receiver}} is banned. Use createQueryBuilder(...) instead. See the typeorm-query skill.",
    },
    schema: [],
    defaultOptions: [],
  },
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    // -----------------------------------------------------------------------
    // typeorm symbol resolution
    // -----------------------------------------------------------------------

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
        const declarations = current.getDeclarations() ?? [];
        for (const decl of declarations) {
          const fileName = decl.getSourceFile().fileName;
          if (fileName.includes('/typeorm/') || fileName.includes('\\typeorm\\')) {
            return true;
          }
        }
        // Follow aliases (import bindings, re-exports) to the original symbol.
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

    function resolveReceiverName(type: ts.Type): string | null {
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
          TYPEORM_RECEIVER_NAMES.has(name) &&
          symbolIsFromTypeorm(symbol)
        ) {
          return name;
        }
        const bases = current.type.getBaseTypes() ?? [];
        for (const base of bases) {
          stack.push({ type: base, depth: current.depth + 1 });
        }
      }
      return null;
    }

    function callExpressionIsTypeormOperator(
      node: TSESTree.CallExpression,
    ): string | null {
      if (node.callee.type !== AST_NODE_TYPES.Identifier) {
        return null;
      }
      const name = node.callee.name;
      if (!OPERATORS.has(name) && name !== 'Not' && name !== 'Raw' && name !== 'Or') {
        return null;
      }
      const tsNode = services.esTreeNodeToTSNodeMap.get(node.callee);
      const symbol = checker.getSymbolAtLocation(tsNode);
      if (!symbolIsFromTypeorm(symbol)) {
        return null;
      }
      return name;
    }

    // -----------------------------------------------------------------------
    // alias derivation
    // -----------------------------------------------------------------------

    function deriveAliasFromRepoReceiver(receiver: TSESTree.Expression): string {
      let raw: string | null = null;
      if (receiver.type === AST_NODE_TYPES.Identifier) {
        raw = receiver.name;
      } else if (
        receiver.type === AST_NODE_TYPES.MemberExpression &&
        receiver.property.type === AST_NODE_TYPES.Identifier
      ) {
        raw = receiver.property.name;
      }
      if (!raw) {
        return 'entity';
      }
      const stripped = raw
        .replace(/Repository$/, '')
        .replace(/Repo$/, '')
        .replace(/Manager$/, '')
        .replace(/^_+/, '');
      const base = stripped.length > 0 ? stripped : 'entity';
      return camelCase(base);
    }

    function deriveAliasFromEntityName(name: string): string {
      return camelCase(name);
    }

    function camelCase(s: string): string {
      const first = s[0];
      if (!first) {
        return 'entity';
      }
      return first.toLowerCase() + s.slice(1);
    }

    // -----------------------------------------------------------------------
    // value safety
    // -----------------------------------------------------------------------

    function isSafeValue(node: TSESTree.Node): boolean {
      switch (node.type) {
        case AST_NODE_TYPES.Literal:
          return true;
        case AST_NODE_TYPES.Identifier:
          return true;
        case AST_NODE_TYPES.MemberExpression: {
          if (!node.computed) {
            return isSafeValue(node.object);
          }
          if (node.property.type === AST_NODE_TYPES.Literal) {
            return isSafeValue(node.object);
          }
          return false;
        }
        case AST_NODE_TYPES.TemplateLiteral:
          return node.expressions.every(isSafeValue);
        default:
          return false;
      }
    }

    function isSafeArrayValue(node: TSESTree.Node): boolean {
      if (node.type === AST_NODE_TYPES.Identifier) {
        return true;
      }
      if (node.type === AST_NODE_TYPES.MemberExpression) {
        return isSafeValue(node);
      }
      if (node.type === AST_NODE_TYPES.ArrayExpression) {
        for (const el of node.elements) {
          if (el === null) {
            return false;
          }
          if (el.type === AST_NODE_TYPES.SpreadElement) {
            return false;
          }
          if (!isSafeValue(el)) {
            return false;
          }
        }
        return true;
      }
      return false;
    }

    // -----------------------------------------------------------------------
    // shared state for a single fix
    // -----------------------------------------------------------------------

    interface JoinedRel {
      alias: string;
      parentAlias: string;
      property: string;
      pathFromRoot: string;
    }

    interface ParamBinding {
      name: string;
      valueText: string;
      isShorthand: boolean;
    }

    interface WhereBranch {
      fragments: string[];
      bindings: ParamBinding[];
    }

    class ParamAllocator {
      private used = new Set<string>();

      alloc(preferred: string): string {
        if (!this.used.has(preferred)) {
          this.used.add(preferred);
          return preferred;
        }
        let i = 2;
        while (this.used.has(`${preferred}_${i}`)) {
          i += 1;
        }
        const name = `${preferred}_${i}`;
        this.used.add(name);
        return name;
      }
    }

    function paramObjectText(bindings: ParamBinding[]): string {
      if (bindings.length === 0) {
        return '';
      }
      const parts = bindings.map((b) =>
        b.isShorthand && b.valueText === b.name
          ? b.name
          : `${b.name}: ${b.valueText}`,
      );
      return `{ ${parts.join(', ')} }`;
    }

    // -----------------------------------------------------------------------
    // relations translation
    // -----------------------------------------------------------------------

    interface RelationsResult {
      joins: JoinedRel[];
      byPath: Map<string, JoinedRel>;
      aliasSet: Set<string>;
    }

    function translateRelations(
      astRaw: TSESTree.Node,
      rootAlias: string,
    ): RelationsResult | null {
      const ast = unwrap(astRaw);
      const joins: JoinedRel[] = [];
      const byPath = new Map<string, JoinedRel>();
      const aliasSet = new Set<string>();

      const claimAlias = (alias: string): boolean => {
        if (alias === rootAlias || aliasSet.has(alias)) {
          return false;
        }
        aliasSet.add(alias);
        return true;
      };

      const validIdent = (s: string): boolean => /^[A-Za-z_]\w*$/.test(s);

      const walk = (
        nodeRaw: TSESTree.Node,
        parentAlias: string,
        pathPrefix: string,
      ): boolean => {
        const node = unwrap(nodeRaw);
        if (node.type === AST_NODE_TYPES.ArrayExpression) {
          for (const el of node.elements) {
            if (el === null) {
              return false;
            }
            if (
              el.type !== AST_NODE_TYPES.Literal ||
              typeof el.value !== 'string'
            ) {
              return false;
            }
            const property = el.value;
            if (property.includes('.')) {
              return false;
            }
            if (!validIdent(property)) {
              return false;
            }
            if (!claimAlias(property)) {
              return false;
            }
            const path = pathPrefix ? `${pathPrefix}.${property}` : property;
            const join: JoinedRel = {
              alias: property,
              parentAlias,
              property,
              pathFromRoot: path,
            };
            joins.push(join);
            byPath.set(path, join);
          }
          return true;
        }
        if (node.type === AST_NODE_TYPES.ObjectExpression) {
          for (const prop of node.properties) {
            if (
              prop.type !== AST_NODE_TYPES.Property ||
              prop.computed ||
              prop.kind !== 'init'
            ) {
              return false;
            }
            const key = readPropertyKey(prop);
            if (!key || !validIdent(key)) {
              return false;
            }
            if (!claimAlias(key)) {
              return false;
            }
            const path = pathPrefix ? `${pathPrefix}.${key}` : key;
            const join: JoinedRel = {
              alias: key,
              parentAlias,
              property: key,
              pathFromRoot: path,
            };
            joins.push(join);
            byPath.set(path, join);
            const v = unwrap(prop.value);
            if (v.type === AST_NODE_TYPES.Literal && v.value === true) {
              continue;
            }
            if (v.type === AST_NODE_TYPES.ObjectExpression) {
              if (!walk(v, key, path)) {
                return false;
              }
              continue;
            }
            return false;
          }
          return true;
        }
        return false;
      };

      if (!walk(ast, rootAlias, '')) {
        return null;
      }
      return { joins, byPath, aliasSet };
    }

    function unwrap(node: TSESTree.Node): TSESTree.Node {
      let current = node;
      while (
        current.type === AST_NODE_TYPES.TSAsExpression ||
        current.type === AST_NODE_TYPES.TSSatisfiesExpression ||
        current.type === AST_NODE_TYPES.TSNonNullExpression ||
        current.type === AST_NODE_TYPES.TSTypeAssertion
      ) {
        current = current.expression;
      }
      return current;
    }

    function readPropertyKey(prop: TSESTree.Property): string | null {
      if (prop.key.type === AST_NODE_TYPES.Identifier) {
        return prop.key.name;
      }
      if (
        prop.key.type === AST_NODE_TYPES.Literal &&
        typeof prop.key.value === 'string'
      ) {
        return prop.key.value;
      }
      return null;
    }

    // -----------------------------------------------------------------------
    // where translation
    // -----------------------------------------------------------------------

    function translateWhere(
      astRaw: TSESTree.Node,
      rootAlias: string,
      relsByPath: Map<string, JoinedRel>,
      params: ParamAllocator,
    ): WhereBranch[] | null {
      const ast = unwrap(astRaw);
      let branchObjects: TSESTree.ObjectExpression[];
      if (ast.type === AST_NODE_TYPES.ObjectExpression) {
        branchObjects = [ast];
      } else if (ast.type === AST_NODE_TYPES.ArrayExpression) {
        branchObjects = [];
        for (const elRaw of ast.elements) {
          if (!elRaw) {
            return null;
          }
          const el = unwrap(elRaw);
          if (el.type !== AST_NODE_TYPES.ObjectExpression) {
            return null;
          }
          branchObjects.push(el);
        }
        if (branchObjects.length === 0) {
          return null;
        }
      } else {
        return null;
      }

      const branches: WhereBranch[] = [];
      for (const obj of branchObjects) {
        const branch: WhereBranch = { fragments: [], bindings: [] };
        if (
          !translateAndGroup(obj, rootAlias, '', relsByPath, params, branch)
        ) {
          return null;
        }
        if (branch.fragments.length === 0) {
          return null;
        }
        branches.push(branch);
      }
      return branches;
    }

    function translateAndGroup(
      obj: TSESTree.ObjectExpression,
      currentAlias: string,
      pathPrefix: string,
      relsByPath: Map<string, JoinedRel>,
      params: ParamAllocator,
      branch: WhereBranch,
    ): boolean {
      for (const prop of obj.properties) {
        if (
          prop.type !== AST_NODE_TYPES.Property ||
          prop.computed ||
          prop.kind !== 'init'
        ) {
          return false;
        }
        const key = readPropertyKey(prop);
        if (!key || !/^[A-Za-z_]\w*$/.test(key)) {
          return false;
        }
        if (prop.value.type === AST_NODE_TYPES.AssignmentPattern) {
          return false;
        }
        const value = unwrap(prop.value);

        // Nested-relation where: value is ObjectExpression — relation must be joined.
        if (value.type === AST_NODE_TYPES.ObjectExpression) {
          const path = pathPrefix ? `${pathPrefix}.${key}` : key;
          const rel = relsByPath.get(path);
          if (!rel) {
            return false;
          }
          if (
            !translateAndGroup(value, rel.alias, path, relsByPath, params, branch)
          ) {
            return false;
          }
          continue;
        }

        // Operator value (CallExpression to a TypeORM operator).
        if (value.type === AST_NODE_TYPES.CallExpression) {
          if (
            !translateOperatorClause(
              value,
              `${currentAlias}.${key}`,
              key,
              params,
              branch,
              false,
            )
          ) {
            return false;
          }
          continue;
        }

        // Plain scalar: equality.
        if (!isSafeValue(value)) {
          return false;
        }
        const paramName = params.alloc(key);
        const valueText = context.sourceCode.getText(value);
        branch.fragments.push(`${currentAlias}.${key} = :${paramName}`);
        branch.bindings.push({
          name: paramName,
          valueText,
          isShorthand:
            value.type === AST_NODE_TYPES.Identifier && value.name === paramName,
        });
      }
      return true;
    }

    function translateOperatorClause(
      call: TSESTree.CallExpression,
      qualifiedField: string,
      preferredParamBase: string,
      params: ParamAllocator,
      branch: WhereBranch,
      inverted: boolean,
    ): boolean {
      const opName = callExpressionIsTypeormOperator(call);
      if (!opName) {
        return false;
      }
      if (opName === 'Raw' || opName === 'Or') {
        return false;
      }
      if (opName === 'Not') {
        if (call.arguments.length !== 1) {
          return false;
        }
        const innerRaw = call.arguments[0];
        if (!innerRaw) {
          return false;
        }
        if (innerRaw.type === AST_NODE_TYPES.SpreadElement) {
          return false;
        }
        const inner = unwrap(innerRaw);
        if (inner.type === AST_NODE_TYPES.CallExpression) {
          return translateOperatorClause(
            inner,
            qualifiedField,
            preferredParamBase,
            params,
            branch,
            !inverted,
          );
        }
        if (!isSafeValue(inner)) {
          return false;
        }
        const paramName = params.alloc(preferredParamBase);
        const valueText = context.sourceCode.getText(inner);
        branch.fragments.push(
          `${qualifiedField} ${inverted ? '=' : '!='} :${paramName}`,
        );
        branch.bindings.push({
          name: paramName,
          valueText,
          isShorthand:
            inner.type === AST_NODE_TYPES.Identifier && inner.name === paramName,
        });
        return true;
      }

      const spec = OPERATORS.get(opName);
      if (!spec) {
        return false;
      }
      if (inverted && !spec.invertible) {
        return false;
      }
      if (call.arguments.length !== spec.arity) {
        return false;
      }

      const paramNames: string[] = [];
      const argBindings: ParamBinding[] = [];
      for (let i = 0; i < spec.arity; i++) {
        const argRaw = call.arguments[i];
        if (!argRaw) {
          return false;
        }
        if (argRaw.type === AST_NODE_TYPES.SpreadElement) {
          return false;
        }
        const arg = unwrap(argRaw);
        const kind = spec.argKinds[i];
        if (kind === 'value') {
          if (!isSafeValue(arg)) {
            return false;
          }
        } else if (kind === 'array') {
          if (!isSafeArrayValue(arg)) {
            return false;
          }
        }
        const suffix = spec.paramSuffixes[i] ?? '';
        const preferred = `${preferredParamBase}${suffix}`;
        const paramName = params.alloc(preferred);
        paramNames.push(paramName);
        const valueText = context.sourceCode.getText(arg);
        argBindings.push({
          name: paramName,
          valueText,
          isShorthand:
            arg.type === AST_NODE_TYPES.Identifier && arg.name === paramName,
        });
      }

      branch.fragments.push(
        spec.build({ qualifiedField, paramNames, inverted }),
      );
      branch.bindings.push(...argBindings);
      return true;
    }

    // -----------------------------------------------------------------------
    // select translation
    // -----------------------------------------------------------------------

    function translateSelect(
      astRaw: TSESTree.Node,
      rootAlias: string,
      relsByPath: Map<string, JoinedRel>,
    ): string[] | null {
      const ast = unwrap(astRaw);
      const result: string[] = [];

      const validIdent = (s: string): boolean => /^[A-Za-z_]\w*$/.test(s);

      if (ast.type === AST_NODE_TYPES.ArrayExpression) {
        for (const el of ast.elements) {
          if (
            !el ||
            el.type !== AST_NODE_TYPES.Literal ||
            typeof el.value !== 'string'
          ) {
            return null;
          }
          if (el.value.includes('.') || !validIdent(el.value)) {
            return null;
          }
          result.push(`${rootAlias}.${el.value}`);
        }
        return result;
      }

      if (ast.type !== AST_NODE_TYPES.ObjectExpression) {
        return null;
      }

      const walk = (
        node: TSESTree.ObjectExpression,
        currentAlias: string,
        pathPrefix: string,
      ): boolean => {
        for (const prop of node.properties) {
          if (
            prop.type !== AST_NODE_TYPES.Property ||
            prop.computed ||
            prop.kind !== 'init'
          ) {
            return false;
          }
          const key = readPropertyKey(prop);
          if (!key || !validIdent(key)) {
            return false;
          }
          const v = unwrap(prop.value);
          if (v.type === AST_NODE_TYPES.Literal && v.value === true) {
            result.push(`${currentAlias}.${key}`);
            continue;
          }
          if (v.type === AST_NODE_TYPES.Literal && v.value === false) {
            // false means "do not select" — bail (column omission semantics need explicit handling)
            return false;
          }
          if (v.type === AST_NODE_TYPES.ObjectExpression) {
            const path = pathPrefix ? `${pathPrefix}.${key}` : key;
            const rel = relsByPath.get(path);
            if (!rel) {
              return false;
            }
            if (!walk(v, rel.alias, path)) {
              return false;
            }
            continue;
          }
          return false;
        }
        return true;
      };

      if (!walk(ast, rootAlias, '')) {
        return null;
      }
      if (result.length === 0) {
        return null;
      }
      return result;
    }

    // -----------------------------------------------------------------------
    // order translation
    // -----------------------------------------------------------------------

    interface OrderEntry {
      column: string;
      direction: 'ASC' | 'DESC';
      nulls?: 'NULLS FIRST' | 'NULLS LAST';
    }

    function translateOrder(
      astRaw: TSESTree.Node,
      rootAlias: string,
      relsByPath: Map<string, JoinedRel>,
    ): OrderEntry[] | null {
      const ast = unwrap(astRaw);
      if (ast.type !== AST_NODE_TYPES.ObjectExpression) {
        return null;
      }
      const validIdent = (s: string): boolean => /^[A-Za-z_]\w*$/.test(s);
      const result: OrderEntry[] = [];

      const walk = (
        node: TSESTree.ObjectExpression,
        currentAlias: string,
        pathPrefix: string,
      ): boolean => {
        for (const prop of node.properties) {
          if (
            prop.type !== AST_NODE_TYPES.Property ||
            prop.computed ||
            prop.kind !== 'init'
          ) {
            return false;
          }
          const key = readPropertyKey(prop);
          if (!key || !validIdent(key)) {
            return false;
          }
          const v = unwrap(prop.value);

          if (v.type === AST_NODE_TYPES.Literal) {
            const dir = parseDirection(v.value);
            if (!dir) {
              return false;
            }
            result.push({ column: `${currentAlias}.${key}`, direction: dir });
            continue;
          }

          if (v.type === AST_NODE_TYPES.ObjectExpression) {
            // Either { direction, nulls } form OR nested-relation order.
            const direction = readObjectStringProp(v, 'direction');
            const nulls = readObjectStringProp(v, 'nulls');
            if (direction !== undefined || nulls !== undefined) {
              // Treat as direction/nulls form. Allow only `direction` and `nulls` keys.
              if (!objectHasOnlyKeys(v, new Set(['direction', 'nulls']))) {
                return false;
              }
              const dir = direction ? parseDirection(direction) : 'ASC';
              if (!dir) {
                return false;
              }
              const entry: OrderEntry = {
                column: `${currentAlias}.${key}`,
                direction: dir,
              };
              if (nulls) {
                const n = parseNulls(nulls);
                if (!n) {
                  return false;
                }
                entry.nulls = n;
              }
              result.push(entry);
              continue;
            }
            const path = pathPrefix ? `${pathPrefix}.${key}` : key;
            const rel = relsByPath.get(path);
            if (!rel) {
              return false;
            }
            if (!walk(v, rel.alias, path)) {
              return false;
            }
            continue;
          }

          return false;
        }
        return true;
      };

      if (!walk(ast, rootAlias, '')) {
        return null;
      }
      if (result.length === 0) {
        return null;
      }
      return result;
    }

    function parseDirection(v: unknown): 'ASC' | 'DESC' | null {
      if (typeof v !== 'string') {
        return null;
      }
      const upper = v.toUpperCase();
      if (upper === 'ASC' || upper === 'DESC') {
        return upper;
      }
      return null;
    }

    function parseNulls(v: string): 'NULLS FIRST' | 'NULLS LAST' | null {
      const upper = v.toUpperCase();
      if (upper === 'FIRST' || upper === 'NULLS FIRST') {
        return 'NULLS FIRST';
      }
      if (upper === 'LAST' || upper === 'NULLS LAST') {
        return 'NULLS LAST';
      }
      return null;
    }

    function readObjectStringProp(
      obj: TSESTree.ObjectExpression,
      key: string,
    ): string | undefined {
      for (const prop of obj.properties) {
        if (
          prop.type !== AST_NODE_TYPES.Property ||
          prop.computed ||
          prop.kind !== 'init'
        ) {
          continue;
        }
        const k = readPropertyKey(prop);
        if (k !== key) {
          continue;
        }
        if (
          prop.value.type === AST_NODE_TYPES.Literal &&
          typeof prop.value.value === 'string'
        ) {
          return prop.value.value;
        }
      }
      return undefined;
    }

    function objectHasOnlyKeys(
      obj: TSESTree.ObjectExpression,
      allowed: Set<string>,
    ): boolean {
      for (const prop of obj.properties) {
        if (prop.type !== AST_NODE_TYPES.Property) {
          return false;
        }
        const k = readPropertyKey(prop);
        if (!k || !allowed.has(k)) {
          return false;
        }
      }
      return true;
    }

    // -----------------------------------------------------------------------
    // simple-option translation (take/skip/withDeleted/cache/lock)
    // -----------------------------------------------------------------------

    function literalOrIdentText(node: TSESTree.Node): string | null {
      if (node.type === AST_NODE_TYPES.Literal) {
        return context.sourceCode.getText(node);
      }
      if (node.type === AST_NODE_TYPES.Identifier) {
        return node.name;
      }
      if (node.type === AST_NODE_TYPES.MemberExpression && !node.computed) {
        return context.sourceCode.getText(node);
      }
      return null;
    }

    function translateTakeSkip(nodeRaw: TSESTree.Node): string | null {
      return literalOrIdentText(unwrap(nodeRaw));
    }

    function translateWithDeleted(nodeRaw: TSESTree.Node): boolean {
      const node = unwrap(nodeRaw);
      return (
        node.type === AST_NODE_TYPES.Literal && node.value === true
      );
    }

    interface CacheCall {
      args: string[];
    }

    function translateCache(nodeRaw: TSESTree.Node): CacheCall | null {
      const node = unwrap(nodeRaw);
      if (node.type === AST_NODE_TYPES.Literal) {
        if (node.value === true) {
          return { args: ['true'] };
        }
        if (typeof node.value === 'number') {
          return { args: [String(node.value)] };
        }
        return null;
      }
      if (node.type === AST_NODE_TYPES.ObjectExpression) {
        let id: string | null = null;
        let ms: string | null = null;
        for (const prop of node.properties) {
          if (
            prop.type !== AST_NODE_TYPES.Property ||
            prop.computed ||
            prop.kind !== 'init'
          ) {
            return null;
          }
          const key = readPropertyKey(prop);
          if (key === 'id') {
            const t = literalOrIdentText(prop.value);
            if (!t) {
              return null;
            }
            id = t;
          } else if (key === 'milliseconds') {
            const t = literalOrIdentText(prop.value);
            if (!t) {
              return null;
            }
            ms = t;
          } else {
            return null;
          }
        }
        if (id === null || ms === null) {
          return null;
        }
        return { args: [id, ms] };
      }
      return null;
    }

    function translateLock(nodeRaw: TSESTree.Node): string | null {
      const node = unwrap(nodeRaw);
      if (node.type !== AST_NODE_TYPES.ObjectExpression) {
        return null;
      }
      let mode: string | null = null;
      for (const prop of node.properties) {
        if (
          prop.type !== AST_NODE_TYPES.Property ||
          prop.computed ||
          prop.kind !== 'init'
        ) {
          return null;
        }
        const key = readPropertyKey(prop);
        if (key !== 'mode') {
          return null;
        }
        if (
          prop.value.type !== AST_NODE_TYPES.Literal ||
          typeof prop.value.value !== 'string'
        ) {
          return null;
        }
        mode = prop.value.value;
      }
      return mode;
    }

    // -----------------------------------------------------------------------
    // option extraction
    // -----------------------------------------------------------------------

    interface ExtractedOptions {
      where?: TSESTree.Expression;
      relations?: TSESTree.Expression;
      select?: TSESTree.Expression;
      order?: TSESTree.Expression;
      take?: TSESTree.Expression;
      skip?: TSESTree.Expression;
      withDeleted?: TSESTree.Expression;
      cache?: TSESTree.Expression;
      lock?: TSESTree.Expression;
    }

    function extractOptions(
      argRaw: TSESTree.Expression,
      isByMethod: boolean,
    ): ExtractedOptions | null {
      const arg = unwrap(argRaw) as TSESTree.Expression;
      if (isByMethod) {
        return { where: arg };
      }
      if (arg.type !== AST_NODE_TYPES.ObjectExpression) {
        return null;
      }
      const out: ExtractedOptions = {};
      for (const prop of arg.properties) {
        if (
          prop.type !== AST_NODE_TYPES.Property ||
          prop.computed ||
          prop.kind !== 'init'
        ) {
          return null;
        }
        const key = readPropertyKey(prop);
        if (!key || !RECOGNIZED_OPTION_KEYS.has(key)) {
          return null;
        }
        if (prop.value.type === AST_NODE_TYPES.AssignmentPattern) {
          return null;
        }
        // `select`/`relations`/etc. are typed as Expression after AssignmentPattern check.
        const value = prop.value as TSESTree.Expression;
        switch (key) {
          case 'where':
            out.where = value;
            break;
          case 'relations':
            out.relations = value;
            break;
          case 'select':
            out.select = value;
            break;
          case 'order':
            out.order = value;
            break;
          case 'take':
            out.take = value;
            break;
          case 'skip':
            out.skip = value;
            break;
          case 'withDeleted':
            out.withDeleted = value;
            break;
          case 'cache':
            out.cache = value;
            break;
          case 'lock':
            out.lock = value;
            break;
        }
      }
      return out;
    }

    // -----------------------------------------------------------------------
    // build the replacement
    // -----------------------------------------------------------------------

    interface FixContext {
      receiverPrefix: string; // e.g., 'this.userRepository' or 'this.entityManager.getRepository(User)'
      rootAlias: string;
      terminal: Terminal;
      method: string;
    }

    function buildReplacement(
      ctx: FixContext,
      opts: ExtractedOptions,
    ): string | null {
      const params = new ParamAllocator();
      let relations: RelationsResult | null = null;
      if (opts.relations) {
        relations = translateRelations(opts.relations, ctx.rootAlias);
        if (!relations) {
          return null;
        }
      }
      const relsByPath = relations?.byPath ?? new Map<string, JoinedRel>();

      let whereBranches: WhereBranch[] | null = null;
      if (opts.where) {
        whereBranches = translateWhere(
          opts.where,
          ctx.rootAlias,
          relsByPath,
          params,
        );
        if (!whereBranches) {
          return null;
        }
      }

      const stripBecauseCountOrExists =
        ctx.terminal === 'getCount' || ctx.terminal === 'getExists';

      let selectColumns: string[] | null = null;
      if (opts.select && !stripBecauseCountOrExists) {
        selectColumns = translateSelect(opts.select, ctx.rootAlias, relsByPath);
        if (!selectColumns) {
          return null;
        }
      }

      let orderEntries: OrderEntry[] | null = null;
      if (opts.order && !stripBecauseCountOrExists) {
        orderEntries = translateOrder(opts.order, ctx.rootAlias, relsByPath);
        if (!orderEntries) {
          return null;
        }
      }

      let takeText: string | null = null;
      if (opts.take && !stripBecauseCountOrExists) {
        takeText = translateTakeSkip(opts.take);
        if (!takeText) {
          return null;
        }
      }
      let skipText: string | null = null;
      if (opts.skip && !stripBecauseCountOrExists) {
        skipText = translateTakeSkip(opts.skip);
        if (!skipText) {
          return null;
        }
      }

      let withDeleted = false;
      if (opts.withDeleted) {
        if (!translateWithDeleted(opts.withDeleted)) {
          return null;
        }
        withDeleted = true;
      }

      let cacheCall: CacheCall | null = null;
      if (opts.cache) {
        cacheCall = translateCache(opts.cache);
        if (!cacheCall) {
          return null;
        }
      }

      let lockMode: string | null = null;
      if (opts.lock) {
        lockMode = translateLock(opts.lock);
        if (!lockMode) {
          return null;
        }
      }

      const lines: string[] = [];
      lines.push(`${ctx.receiverPrefix}.createQueryBuilder('${ctx.rootAlias}')`);

      if (relations) {
        for (const j of relations.joins) {
          lines.push(
            `      .leftJoinAndSelect('${j.parentAlias}.${j.property}', '${j.alias}')`,
          );
        }
      }

      if (selectColumns) {
        const formatted = selectColumns.map((c) => `'${c}'`).join(', ');
        lines.push(`      .select([${formatted}])`);
      }

      if (whereBranches) {
        whereBranches.forEach((branch, idx) => {
          const isFirst = idx === 0;
          const isOr = whereBranches!.length > 1;
          const method = isFirst ? 'where' : isOr ? 'orWhere' : 'andWhere';
          if (!isOr && isFirst) {
            // single-branch case: emit each fragment as where/andWhere chain
            branch.fragments.forEach((frag, fIdx) => {
              const fMethod = fIdx === 0 ? 'where' : 'andWhere';
              const fragBindings = bindingsForFragment(branch, fIdx);
              const paramObj = paramObjectText(fragBindings);
              const argList = paramObj
                ? `'${frag}', ${paramObj}`
                : `'${frag}'`;
              lines.push(`      .${fMethod}(${argList})`);
            });
            return;
          }
          // OR branch: wrap fragments in parens, single call
          const combined = branch.fragments.length === 1
            ? branch.fragments[0]
            : `(${branch.fragments.join(' AND ')})`;
          const paramObj = paramObjectText(branch.bindings);
          const argList = paramObj ? `'${combined}', ${paramObj}` : `'${combined}'`;
          lines.push(`      .${method}(${argList})`);
        });
      }

      if (orderEntries) {
        orderEntries.forEach((entry, idx) => {
          const m = idx === 0 ? 'orderBy' : 'addOrderBy';
          const args: string[] = [`'${entry.column}'`, `'${entry.direction}'`];
          if (entry.nulls) {
            args.push(`'${entry.nulls}'`);
          }
          lines.push(`      .${m}(${args.join(', ')})`);
        });
      }

      if (takeText !== null) {
        lines.push(`      .take(${takeText})`);
      }
      if (skipText !== null) {
        lines.push(`      .skip(${skipText})`);
      }
      if (withDeleted) {
        lines.push(`      .withDeleted()`);
      }
      if (cacheCall) {
        lines.push(`      .cache(${cacheCall.args.join(', ')})`);
      }
      if (lockMode !== null) {
        lines.push(`      .setLock('${lockMode}')`);
      }
      lines.push(`      .${ctx.terminal}()`);
      return lines.join('\n');
    }

    function bindingsForFragment(
      branch: WhereBranch,
      fragmentIdx: number,
    ): ParamBinding[] {
      // Walk the fragments and bindings together in order; the bindings list is
      // populated in insertion order alongside fragments.
      // We need to know how many bindings each fragment introduced.
      // Re-derive by counting `:name` occurrences in the fragment string (since
      // each translateOperatorClause / scalar push appends bindings in order).
      const result: ParamBinding[] = [];
      let cursor = 0;
      for (let i = 0; i <= fragmentIdx; i++) {
        const frag = branch.fragments[i];
        if (frag === undefined) {
          break;
        }
        const matches = frag.match(/:\.\.\.[A-Za-z_]\w*|:[A-Za-z_]\w*/g) ?? [];
        const consumed = matches.length;
        if (i === fragmentIdx) {
          for (let k = 0; k < consumed; k++) {
            const b = branch.bindings[cursor + k];
            if (b) {
              result.push(b);
            }
          }
        }
        cursor += consumed;
      }
      return result;
    }

    // -----------------------------------------------------------------------
    // top-level fix planning
    // -----------------------------------------------------------------------

    function computeFix(
      node: TSESTree.CallExpression,
      callee: TSESTree.MemberExpression,
      method: string,
      receiverName: string,
    ): string | null {
      if (ERROR_ONLY_METHODS.has(method)) {
        return null;
      }
      const terminal = TERMINAL_BY_METHOD.get(method);
      if (!terminal) {
        return null;
      }

      const isEntityManager = ENTITY_MANAGER_RECEIVERS.has(receiverName);
      const isByMethod = BY_METHODS.has(method);
      const args = node.arguments;

      let receiverPrefix: string;
      let rootAlias: string;
      let optionsArg: TSESTree.Expression | undefined;

      if (isEntityManager) {
        // Signature: method(EntityClass, options?)
        const entityArg = args[0];
        if (!entityArg || entityArg.type !== AST_NODE_TYPES.Identifier) {
          return null;
        }
        if (args.length > 2) {
          return null;
        }
        const optArg = args[1];
        if (optArg) {
          if (optArg.type === AST_NODE_TYPES.SpreadElement) {
            return null;
          }
          optionsArg = optArg;
        }
        receiverPrefix = `${context.sourceCode.getText(callee.object)}.getRepository(${entityArg.name})`;
        rootAlias = deriveAliasFromEntityName(entityArg.name);
      } else {
        // Repository-style: method(options?)
        if (args.length > 1) {
          return null;
        }
        const optArg = args[0];
        if (optArg) {
          if (optArg.type === AST_NODE_TYPES.SpreadElement) {
            return null;
          }
          optionsArg = optArg;
        }
        receiverPrefix = context.sourceCode.getText(callee.object);
        rootAlias = deriveAliasFromRepoReceiver(callee.object);
      }

      let opts: ExtractedOptions;
      if (!optionsArg) {
        opts = {};
      } else {
        const extracted = extractOptions(optionsArg, isByMethod);
        if (!extracted) {
          return null;
        }
        opts = extracted;
      }

      return buildReplacement(
        { receiverPrefix, rootAlias, terminal, method },
        opts,
      );
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
        if (!BANNED_METHODS.has(method)) {
          return;
        }
        const receiverTsNode = services.esTreeNodeToTSNodeMap.get(callee.object);
        const receiverType = checker.getTypeAtLocation(receiverTsNode);
        const receiverName = resolveReceiverName(receiverType);
        if (!receiverName) {
          return;
        }

        const replacement = computeFix(node, callee, method, receiverName);

        context.report({
          node: callee.property,
          messageId: 'bannedMethod',
          data: { method, receiver: receiverName },
          ...(replacement === null
            ? {}
            : {
                fix: (fixer: TSESLint.RuleFixer): TSESLint.RuleFix =>
                  fixer.replaceText(node, replacement),
              }),
        });
      },
    };
  },
});
