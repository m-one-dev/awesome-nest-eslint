import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import * as ts from 'typescript';

import { createRule } from '../utils/create-rule.js';

type MessageIds =
  | 'uuidFieldMustEndWithId'
  | 'uuidArrayFieldMustEndWithIds'
  | 'idSuffixRequiresUuid'
  | 'idsSuffixRequiresUuidArray';

export interface Options {
  enforceReverse?: boolean;
  allowNonUuidNames?: string[];
}

const BRAND_PROPERTY = '_uuidBrand';

const SINGULAR_NAME_RE = /^id$|[a-z0-9]Id$/;
const PLURAL_NAME_RE = /^ids$|[a-z0-9]Ids$/;

const SKIPPED_TYPE_FLAGS =
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Null |
  ts.TypeFlags.Void |
  ts.TypeFlags.Never;

const OPAQUE_TYPE_FLAGS = ts.TypeFlags.Any | ts.TypeFlags.Unknown;

export const uuidFieldNaming = createRule<[Options], MessageIds>({
  name: 'uuid-field-naming',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Field-like declarations whose type is the `Uuid` brand must end with `Id`; arrays of `Uuid` must end with `Ids`. Optional reverse direction enforces the inverse.',
    },
    messages: {
      uuidFieldMustEndWithId:
        "Field '{{name}}' has type Uuid and must end with 'Id'.",
      uuidArrayFieldMustEndWithIds:
        "Field '{{name}}' has type Uuid[] and must end with 'Ids'.",
      idSuffixRequiresUuid:
        "Field '{{name}}' ends with 'Id' but its type is not Uuid.",
      idsSuffixRequiresUuidArray:
        "Field '{{name}}' ends with 'Ids' but its type is not Uuid[].",
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          enforceReverse: { type: 'boolean' },
          allowNonUuidNames: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
        },
      },
    ],
    defaultOptions: [{ enforceReverse: false, allowNonUuidNames: [] }],
  },
  create(context, [rawOptions]) {
    const enforceReverse = rawOptions.enforceReverse ?? false;
    const allowPatterns = (rawOptions.allowNonUuidNames ?? []).map(
      (p) => new RegExp(p),
    );
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    function isAllowedNonUuid(name: string): boolean {
      return allowPatterns.some((re) => re.test(name));
    }

    function nameIsSingularIdSuffix(name: string): boolean {
      return SINGULAR_NAME_RE.test(name);
    }

    function nameIsPluralIdsSuffix(name: string): boolean {
      return PLURAL_NAME_RE.test(name);
    }

    function isPromiseType(type: ts.Type): boolean {
      const symbol = type.aliasSymbol ?? type.getSymbol();
      return symbol?.getName() === 'Promise';
    }

    function isReadonlyWrapper(type: ts.Type): ts.Type | null {
      const aliasName = type.aliasSymbol?.getName();
      if (aliasName === 'Readonly' && type.aliasTypeArguments?.[0]) {
        return type.aliasTypeArguments[0];
      }
      return null;
    }

    function typeHasUuidBrand(type: ts.Type, depth = 0): boolean {
      if (depth > 6) return false;
      if (type.flags & SKIPPED_TYPE_FLAGS) return false;
      if (type.flags & OPAQUE_TYPE_FLAGS) return false;

      if (isPromiseType(type)) return false;

      const unwrappedReadonly = isReadonlyWrapper(type);
      if (unwrappedReadonly) {
        return typeHasUuidBrand(unwrappedReadonly, depth + 1);
      }

      if (type.isUnion()) {
        return type.types.some((t) => typeHasUuidBrand(t, depth + 1));
      }

      if (type.isIntersection()) {
        return type.types.some((t) => typeHasUuidBrand(t, depth + 1));
      }

      const apparent = checker.getApparentType(type);
      const brand = apparent.getProperty(BRAND_PROPERTY);
      return brand !== undefined;
    }

    function getArrayElementType(type: ts.Type): ts.Type | null {
      if (checker.isArrayType(type) || checker.isTupleType(type)) {
        const args = checker.getTypeArguments(type as ts.TypeReference);
        if (args.length === 0) return null;
        if (args.every((a) => a === args[0])) return args[0] ?? null;
        // Heterogeneous tuple — only fold to a single type if all branches are Uuid
        return args.every((a) => typeHasUuidBrand(a)) ? args[0] ?? null : null;
      }
      const aliasName = type.aliasSymbol?.getName();
      if (aliasName === 'ReadonlyArray' && type.aliasTypeArguments?.[0]) {
        return type.aliasTypeArguments[0];
      }
      return null;
    }

    /**
     * Classifies a type as 'uuid' (single Uuid), 'uuid-array' (Uuid[] or
     * homogeneous Uuid tuple/ReadonlyArray), or 'other'. Walks unions so
     * `Uuid | undefined` stays 'uuid', and skips Promise wrappers.
     */
    function classifyType(
      type: ts.Type,
    ): 'uuid' | 'uuid-array' | 'opaque' | 'other' {
      if (type.flags & OPAQUE_TYPE_FLAGS) return 'opaque';
      if (isPromiseType(type)) return 'other';

      // Strip nullable union members for classification purposes.
      const meaningful = type.isUnion()
        ? type.types.filter((t) => !(t.flags & SKIPPED_TYPE_FLAGS))
        : [type];

      if (meaningful.length === 0) return 'other';

      if (meaningful.some((t) => t.flags & OPAQUE_TYPE_FLAGS)) return 'opaque';

      const anyUuid = meaningful.some((t) => typeHasUuidBrand(t));
      if (anyUuid) return 'uuid';

      const allArrays = meaningful.every((t) => getArrayElementType(t) !== null);
      if (allArrays) {
        const anyUuidArray = meaningful.some((t) => {
          const el = getArrayElementType(t);
          return el !== null && typeHasUuidBrand(el);
        });
        if (anyUuidArray) return 'uuid-array';
      }

      return 'other';
    }

    function reportNode(
      node: TSESTree.Node,
      messageId: MessageIds,
      name: string,
    ): void {
      context.report({ node, messageId, data: { name } });
    }

    function checkNameForType(
      reportTarget: TSESTree.Node,
      name: string,
      type: ts.Type,
      reverseExempt: boolean,
    ): void {
      const kind = classifyType(type);
      if (kind === 'opaque') return;

      // Forward direction
      if (kind === 'uuid' && !nameIsSingularIdSuffix(name)) {
        reportNode(reportTarget, 'uuidFieldMustEndWithId', name);
        return;
      }
      if (kind === 'uuid-array' && !nameIsPluralIdsSuffix(name)) {
        reportNode(reportTarget, 'uuidArrayFieldMustEndWithIds', name);
        return;
      }

      // Reverse direction
      if (!enforceReverse || reverseExempt) return;
      if (isAllowedNonUuid(name)) return;

      if (kind !== 'uuid' && nameIsSingularIdSuffix(name)) {
        // Don't double-flag when the plural pattern also matches (it can't:
        // singular regex requires final 'Id', plural requires final 'Ids').
        reportNode(reportTarget, 'idSuffixRequiresUuid', name);
        return;
      }
      if (kind !== 'uuid-array' && nameIsPluralIdsSuffix(name)) {
        reportNode(reportTarget, 'idsSuffixRequiresUuidArray', name);
      }
    }

    function getKeyName(
      key: TSESTree.PropertyDefinition['key'] | TSESTree.TSPropertySignature['key'],
      computed: boolean,
    ): { name: string; literalKey: boolean } | null {
      if (computed) return null;
      if (key.type === AST_NODE_TYPES.Identifier) {
        return { name: key.name, literalKey: false };
      }
      if (key.type === AST_NODE_TYPES.PrivateIdentifier) {
        return { name: key.name, literalKey: false };
      }
      if (
        key.type === AST_NODE_TYPES.Literal &&
        typeof key.value === 'string'
      ) {
        return { name: key.value, literalKey: true };
      }
      return null;
    }

    function typeOfTSNode(esNode: TSESTree.Node): ts.Type {
      const tsNode = services.esTreeNodeToTSNodeMap.get(esNode);
      return checker.getTypeAtLocation(tsNode);
    }

    function checkPropertyDefinition(node: TSESTree.PropertyDefinition): void {
      const keyInfo = getKeyName(node.key, node.computed);
      if (!keyInfo) return;
      const tsNode = services.esTreeNodeToTSNodeMap.get(node);
      const type = checker.getTypeAtLocation(tsNode);
      if (keyInfo.literalKey) {
        // String-literal keys (e.g. 'user-id') get flagged when the type is Uuid.
        const kind = classifyType(type);
        if (kind === 'uuid') {
          reportNode(node.key, 'uuidFieldMustEndWithId', keyInfo.name);
        } else if (kind === 'uuid-array') {
          reportNode(node.key, 'uuidArrayFieldMustEndWithIds', keyInfo.name);
        }
        return;
      }
      checkNameForType(node.key, keyInfo.name, type, false);
    }

    function checkTSPropertySignature(node: TSESTree.TSPropertySignature): void {
      const keyInfo = getKeyName(node.key, node.computed);
      if (!keyInfo) return;
      if (!node.typeAnnotation) return;
      const type = typeOfTSNode(node.typeAnnotation.typeAnnotation);
      if (keyInfo.literalKey) {
        const kind = classifyType(type);
        if (kind === 'uuid') {
          reportNode(node.key, 'uuidFieldMustEndWithId', keyInfo.name);
        } else if (kind === 'uuid-array') {
          reportNode(node.key, 'uuidArrayFieldMustEndWithIds', keyInfo.name);
        }
        return;
      }
      checkNameForType(node.key, keyInfo.name, type, false);
    }

    function checkParameter(param: TSESTree.Parameter): void {
      // Unwrap parameter-property modifiers (`private readonly userId: Uuid`).
      const unwrapped =
        param.type === AST_NODE_TYPES.TSParameterProperty
          ? param.parameter
          : param;
      // Unwrap default-value pattern.
      const inner =
        unwrapped.type === AST_NODE_TYPES.AssignmentPattern
          ? unwrapped.left
          : unwrapped;

      if (inner.type === AST_NODE_TYPES.Identifier) {
        const tsNode = services.esTreeNodeToTSNodeMap.get(inner);
        const type = checker.getTypeAtLocation(tsNode);
        checkNameForType(inner, inner.name, type, false);
        return;
      }
      if (inner.type === AST_NODE_TYPES.RestElement) {
        const arg = inner.argument;
        if (arg.type === AST_NODE_TYPES.Identifier) {
          const tsNode = services.esTreeNodeToTSNodeMap.get(arg);
          const type = checker.getTypeAtLocation(tsNode);
          checkNameForType(arg, arg.name, type, false);
        } else if (arg.type === AST_NODE_TYPES.ObjectPattern) {
          checkObjectPattern(arg);
        } else if (arg.type === AST_NODE_TYPES.ArrayPattern) {
          checkArrayPattern(arg);
        }
        return;
      }
      if (inner.type === AST_NODE_TYPES.ObjectPattern) {
        checkObjectPattern(inner);
        return;
      }
      if (inner.type === AST_NODE_TYPES.ArrayPattern) {
        checkArrayPattern(inner);
      }
    }

    function checkObjectPattern(pattern: TSESTree.ObjectPattern): void {
      for (const prop of pattern.properties) {
        if (prop.type !== AST_NODE_TYPES.Property) continue;
        const value =
          prop.value.type === AST_NODE_TYPES.AssignmentPattern
            ? prop.value.left
            : prop.value;
        if (value.type === AST_NODE_TYPES.Identifier) {
          const tsNode = services.esTreeNodeToTSNodeMap.get(value);
          const type = checker.getTypeAtLocation(tsNode);
          checkNameForType(value, value.name, type, false);
        } else if (value.type === AST_NODE_TYPES.ObjectPattern) {
          checkObjectPattern(value);
        } else if (value.type === AST_NODE_TYPES.ArrayPattern) {
          checkArrayPattern(value);
        }
      }
    }

    function checkArrayPattern(pattern: TSESTree.ArrayPattern): void {
      for (const element of pattern.elements) {
        if (!element) continue;
        const inner =
          element.type === AST_NODE_TYPES.AssignmentPattern
            ? element.left
            : element;
        if (inner.type === AST_NODE_TYPES.Identifier) {
          const tsNode = services.esTreeNodeToTSNodeMap.get(inner);
          const type = checker.getTypeAtLocation(tsNode);
          checkNameForType(inner, inner.name, type, false);
        } else if (inner.type === AST_NODE_TYPES.ObjectPattern) {
          checkObjectPattern(inner);
        } else if (inner.type === AST_NODE_TYPES.ArrayPattern) {
          checkArrayPattern(inner);
        } else if (inner.type === AST_NODE_TYPES.RestElement) {
          const arg = inner.argument;
          if (arg.type === AST_NODE_TYPES.Identifier) {
            const tsNode = services.esTreeNodeToTSNodeMap.get(arg);
            const type = checker.getTypeAtLocation(tsNode);
            checkNameForType(arg, arg.name, type, false);
          }
        }
      }
    }

    function checkVariableDeclarator(node: TSESTree.VariableDeclarator): void {
      const id = node.id;
      if (id.type === AST_NODE_TYPES.Identifier) {
        const tsNode = services.esTreeNodeToTSNodeMap.get(id);
        const type = checker.getTypeAtLocation(tsNode);
        checkNameForType(id, id.name, type, false);
      } else if (id.type === AST_NODE_TYPES.ObjectPattern) {
        checkObjectPattern(id);
      } else if (id.type === AST_NODE_TYPES.ArrayPattern) {
        checkArrayPattern(id);
      }
    }

    function checkObjectExpressionProperty(
      prop: TSESTree.Property,
      objectExpr: TSESTree.ObjectExpression,
    ): void {
      if (prop.computed) return;
      const keyInfo = getKeyName(
        prop.key as TSESTree.PropertyDefinition['key'],
        false,
      );
      if (!keyInfo) return;

      const objTsNode = services.esTreeNodeToTSNodeMap.get(objectExpr);
      const contextual = checker.getContextualType(
        objTsNode as ts.Expression,
      );
      if (!contextual) return;
      const propSymbol = contextual.getProperty(keyInfo.name);
      if (!propSymbol) return;
      const declaration = propSymbol.valueDeclaration ?? propSymbol.declarations?.[0];
      if (!declaration) return;
      const propType = checker.getTypeOfSymbolAtLocation(propSymbol, declaration);

      const kind = classifyType(propType);
      if (kind === 'opaque') return;

      // Only forward-direction checks fire on contextually-typed object literals;
      // reverse direction over-fires here (every literal property named `userId`
      // would demand the contextual prop be Uuid even when the contract uses string).
      if (kind === 'uuid' && !nameIsSingularIdSuffix(keyInfo.name)) {
        reportNode(prop.key, 'uuidFieldMustEndWithId', keyInfo.name);
      } else if (
        kind === 'uuid-array' &&
        !nameIsPluralIdsSuffix(keyInfo.name)
      ) {
        reportNode(prop.key, 'uuidArrayFieldMustEndWithIds', keyInfo.name);
      }
    }

    return {
      PropertyDefinition: checkPropertyDefinition,
      TSPropertySignature: checkTSPropertySignature,

      'FunctionDeclaration, FunctionExpression, ArrowFunctionExpression, TSEmptyBodyFunctionExpression, TSDeclareFunction, TSFunctionType, TSMethodSignature'(
        node: TSESTree.FunctionLike | TSESTree.TSMethodSignature,
      ): void {
        for (const param of node.params) {
          checkParameter(param);
        }
      },

      VariableDeclarator: checkVariableDeclarator,

      CatchClause(node: TSESTree.CatchClause): void {
        if (!node.param) return;
        if (node.param.type === AST_NODE_TYPES.Identifier) {
          const tsNode = services.esTreeNodeToTSNodeMap.get(node.param);
          const type = checker.getTypeAtLocation(tsNode);
          checkNameForType(node.param, node.param.name, type, false);
        } else if (node.param.type === AST_NODE_TYPES.ObjectPattern) {
          checkObjectPattern(node.param);
        } else if (node.param.type === AST_NODE_TYPES.ArrayPattern) {
          checkArrayPattern(node.param);
        }
      },

      'ForOfStatement, ForInStatement'(
        node: TSESTree.ForOfStatement | TSESTree.ForInStatement,
      ): void {
        const left = node.left;
        if (left.type === AST_NODE_TYPES.VariableDeclaration) {
          for (const decl of left.declarations) {
            checkVariableDeclarator(decl);
          }
        }
      },

      ObjectExpression(node: TSESTree.ObjectExpression): void {
        for (const prop of node.properties) {
          if (prop.type !== AST_NODE_TYPES.Property) continue;
          checkObjectExpressionProperty(prop, node);
        }
      },
    };
  },
});
