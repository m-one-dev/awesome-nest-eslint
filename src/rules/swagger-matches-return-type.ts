import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import * as ts from 'typescript';

import { createRule } from '../utils/create-rule.js';

type MessageIds = 'slotMismatch';

type Kind = 'single' | 'array' | 'page';

export interface Options {
  suffixes?: string[];
  asyncWrappers?: string[];
  arrayWrappers?: string[];
  pageWrappers?: string[];
}

const DEFAULT_SUFFIXES: readonly string[] = ['Dto'];
const DEFAULT_ASYNC_WRAPPERS: readonly string[] = ['Promise', 'Observable'];
const DEFAULT_ARRAY_WRAPPERS: readonly string[] = ['Array', 'ReadonlyArray'];
const DEFAULT_PAGE_WRAPPERS: readonly string[] = ['PageDto', 'CursorPageDto'];

const HTTP_METHOD_DECORATORS: ReadonlySet<string> = new Set([
  'Get',
  'Post',
  'Put',
  'Patch',
  'Delete',
  'Options',
  'Head',
  'All',
]);

interface DecoratorMeta {
  isSuccess: boolean;
  forcedKind?: Kind;
}

const NAMED_DECORATOR_META: Readonly<Record<string, DecoratorMeta>> = {
  ApiOkResponse: { isSuccess: true },
  ApiCreatedResponse: { isSuccess: true },
  ApiAcceptedResponse: { isSuccess: true },
  ApiDefaultResponse: { isSuccess: true },
  ApiPageResponse: { isSuccess: true, forcedKind: 'page' },
  ApiCursorPageResponse: { isSuccess: true, forcedKind: 'page' },
};

const HTTP_STATUS_SUCCESS_NAMES: ReadonlySet<string> = new Set([
  'OK',
  'CREATED',
  'ACCEPTED',
  'NON_AUTHORITATIVE_INFORMATION',
  'RESET_CONTENT',
  'PARTIAL_CONTENT',
  'MULTI_STATUS',
  'ALREADY_REPORTED',
  'IM_USED',
]);

const SUCCESS_STATUS_NUMBERS: ReadonlySet<number> = new Set([
  200, 201, 202, 203, 205, 206, 207, 208, 226,
]);

const SKIPPED_TYPE_FLAGS =
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Null |
  ts.TypeFlags.Void |
  ts.TypeFlags.Never |
  ts.TypeFlags.Any |
  ts.TypeFlags.Unknown |
  ts.TypeFlags.String |
  ts.TypeFlags.Number |
  ts.TypeFlags.Boolean |
  ts.TypeFlags.BigInt |
  ts.TypeFlags.ESSymbol |
  ts.TypeFlags.StringLiteral |
  ts.TypeFlags.NumberLiteral |
  ts.TypeFlags.BooleanLiteral;

interface Shape {
  dtoName: string;
  kind: Kind;
}

function formatShape(shape: Shape): string {
  switch (shape.kind) {
    case 'array':
      return `${shape.dtoName}[]`;
    case 'page':
      return `Page<${shape.dtoName}>`;
    default:
      return shape.dtoName;
  }
}

export const swaggerMatchesReturnType = createRule<[Options], MessageIds>({
  name: 'swagger-matches-return-type',
  meta: {
    type: 'problem',
    docs: {
      description:
        'The Swagger response decorator on a NestJS endpoint must describe the same shape as the method return type.',
    },
    messages: {
      slotMismatch:
        "Swagger response declares '{{swaggerShape}}' but the return type is '{{returnShape}}'. They must describe the same response slot.",
    },
    schema: [
      {
        type: 'object',
        additionalProperties: false,
        properties: {
          suffixes: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
            minItems: 1,
          },
          asyncWrappers: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
          arrayWrappers: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
          pageWrappers: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
        },
      },
    ],
    defaultOptions: [
      {
        suffixes: [...DEFAULT_SUFFIXES],
        asyncWrappers: [...DEFAULT_ASYNC_WRAPPERS],
        arrayWrappers: [...DEFAULT_ARRAY_WRAPPERS],
        pageWrappers: [...DEFAULT_PAGE_WRAPPERS],
      },
    ],
  },
  create(context, [rawOptions]) {
    const suffixes =
      rawOptions.suffixes && rawOptions.suffixes.length > 0
        ? rawOptions.suffixes
        : [...DEFAULT_SUFFIXES];
    const asyncWrappers = new Set(
      rawOptions.asyncWrappers && rawOptions.asyncWrappers.length > 0
        ? rawOptions.asyncWrappers
        : [...DEFAULT_ASYNC_WRAPPERS],
    );
    const arrayWrappers = new Set(
      rawOptions.arrayWrappers && rawOptions.arrayWrappers.length > 0
        ? rawOptions.arrayWrappers
        : [...DEFAULT_ARRAY_WRAPPERS],
    );
    const pageWrappers = new Set(
      rawOptions.pageWrappers && rawOptions.pageWrappers.length > 0
        ? rawOptions.pageWrappers
        : [...DEFAULT_PAGE_WRAPPERS],
    );

    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    function matchesSuffix(name: string): boolean {
      return suffixes.some((suffix) => name.endsWith(suffix));
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

    function hasAnyDecorator(
      decorators: TSESTree.Decorator[] | undefined,
      names: ReadonlySet<string>,
    ): boolean {
      if (!decorators) {
        return false;
      }
      return decorators.some((d) => {
        const n = getDecoratorName(d);
        return n !== null && names.has(n);
      });
    }

    function isControllerClass(
      classNode: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
    ): boolean {
      if (!classNode.decorators) {
        return false;
      }
      return classNode.decorators.some(
        (d) => getDecoratorName(d) === 'Controller',
      );
    }

    function resolveSymbol(symbol: ts.Symbol): ts.Symbol {
      if (symbol.flags & ts.SymbolFlags.Alias) {
        return checker.getAliasedSymbol(symbol);
      }
      return symbol;
    }

    function stripNullish(type: ts.Type): ts.Type | null {
      if (!type.isUnion()) {
        return type;
      }
      const nonNullish = type.types.filter(
        (t) =>
          !(t.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)),
      );
      if (nonNullish.length === 0) {
        return null;
      }
      if (nonNullish.length === 1) {
        return nonNullish[0]!;
      }
      return null;
    }

    function getTypeWrapperName(type: ts.Type): string | null {
      const aliasName = type.aliasSymbol?.getName();
      if (aliasName) {
        return aliasName;
      }
      const typeRef = type as ts.TypeReference;
      const target = typeRef.target;
      if (target && target !== type) {
        return target.getSymbol()?.getName() ?? null;
      }
      return type.getSymbol()?.getName() ?? null;
    }

    function getTypeArgs(type: ts.Type): readonly ts.Type[] {
      if (type.aliasTypeArguments && type.aliasTypeArguments.length > 0) {
        return type.aliasTypeArguments;
      }
      const typeRef = type as ts.TypeReference;
      if (typeRef.target) {
        return checker.getTypeArguments(typeRef);
      }
      return [];
    }

    function classifyReturnType(type: ts.Type, depth = 0): Shape | null {
      if (depth > 8) {
        return null;
      }
      if (type.flags & SKIPPED_TYPE_FLAGS) {
        return null;
      }
      const stripped = stripNullish(type);
      if (!stripped) {
        return null;
      }
      if (stripped !== type) {
        return classifyReturnType(stripped, depth + 1);
      }
      const wrapperName = getTypeWrapperName(type);
      if (wrapperName && asyncWrappers.has(wrapperName)) {
        const args = getTypeArgs(type);
        if (args[0]) {
          return classifyReturnType(args[0], depth + 1);
        }
        return null;
      }
      if (wrapperName && pageWrappers.has(wrapperName)) {
        const args = getTypeArgs(type);
        const inner = args[0]
          ? extractInnerDtoName(args[0], depth + 1)
          : null;
        if (!inner) {
          return null;
        }
        return { dtoName: inner, kind: 'page' };
      }
      if (
        (wrapperName && arrayWrappers.has(wrapperName)) ||
        checker.isArrayType(type) ||
        checker.isTupleType(type)
      ) {
        const args = getTypeArgs(type);
        const inner = args[0]
          ? extractInnerDtoName(args[0], depth + 1)
          : null;
        if (!inner) {
          return null;
        }
        return { dtoName: inner, kind: 'array' };
      }
      const inner = extractInnerDtoName(type, depth + 1);
      if (!inner) {
        return null;
      }
      return { dtoName: inner, kind: 'single' };
    }

    function extractInnerDtoName(type: ts.Type, depth: number): string | null {
      if (depth > 8) {
        return null;
      }
      if (type.flags & SKIPPED_TYPE_FLAGS) {
        return null;
      }
      const stripped = stripNullish(type);
      if (!stripped) {
        return null;
      }
      if (stripped !== type) {
        return extractInnerDtoName(stripped, depth + 1);
      }
      const rawSymbol = type.aliasSymbol ?? type.getSymbol();
      if (!rawSymbol) {
        return null;
      }
      const symbol = resolveSymbol(rawSymbol);
      const name = symbol.getName();
      if (!name || !matchesSuffix(name)) {
        return null;
      }
      return name;
    }

    function getMemberPropertyName(
      node: TSESTree.MemberExpression,
    ): string | null {
      if (node.computed) {
        return null;
      }
      if (node.property.type !== AST_NODE_TYPES.Identifier) {
        return null;
      }
      return node.property.name;
    }

    function isSuccessApiResponseStatus(
      statusValue: TSESTree.Expression | TSESTree.PrivateIdentifier,
    ): boolean | null {
      if (
        statusValue.type === AST_NODE_TYPES.Literal &&
        typeof statusValue.value === 'number'
      ) {
        return SUCCESS_STATUS_NUMBERS.has(statusValue.value);
      }
      if (statusValue.type === AST_NODE_TYPES.MemberExpression) {
        const obj = statusValue.object;
        if (
          obj.type === AST_NODE_TYPES.Identifier &&
          obj.name === 'HttpStatus'
        ) {
          const propName = getMemberPropertyName(statusValue);
          if (propName === null) {
            return null;
          }
          return HTTP_STATUS_SUCCESS_NAMES.has(propName);
        }
      }
      return null;
    }

    function findObjectProperty(
      obj: TSESTree.ObjectExpression,
      key: string,
    ): TSESTree.Property | null {
      for (const prop of obj.properties) {
        if (prop.type !== AST_NODE_TYPES.Property || prop.computed) {
          continue;
        }
        if (
          prop.key.type === AST_NODE_TYPES.Identifier &&
          prop.key.name === key
        ) {
          return prop;
        }
        if (
          prop.key.type === AST_NODE_TYPES.Literal &&
          prop.key.value === key
        ) {
          return prop;
        }
      }
      return null;
    }

    function isLiteralTrue(node: TSESTree.Node): boolean {
      return (
        node.type === AST_NODE_TYPES.Literal && node.value === true
      );
    }

    function classifyDecoratorTypeNode(
      typeValue: TSESTree.Node,
    ): Shape | null {
      if (typeValue.type === AST_NODE_TYPES.Identifier) {
        const dtoName = resolveIdentifierDtoName(typeValue);
        if (!dtoName) {
          return null;
        }
        return { dtoName, kind: 'single' };
      }
      if (typeValue.type === AST_NODE_TYPES.ArrayExpression) {
        const first = typeValue.elements[0];
        if (!first || first.type !== AST_NODE_TYPES.Identifier) {
          return null;
        }
        const dtoName = resolveIdentifierDtoName(first);
        if (!dtoName) {
          return null;
        }
        return { dtoName, kind: 'array' };
      }
      if (typeValue.type === AST_NODE_TYPES.TSInstantiationExpression) {
        const callee = typeValue.expression;
        if (callee.type !== AST_NODE_TYPES.Identifier) {
          return null;
        }
        const typeArg = typeValue.typeArguments.params[0];
        if (!typeArg) {
          return null;
        }
        const innerName = resolveTypeNodeDtoName(typeArg);
        if (!innerName) {
          return null;
        }
        if (pageWrappers.has(callee.name)) {
          return { dtoName: innerName, kind: 'page' };
        }
        if (arrayWrappers.has(callee.name)) {
          return { dtoName: innerName, kind: 'array' };
        }
        return null;
      }
      return null;
    }

    function resolveIdentifierDtoName(
      ident: TSESTree.Identifier,
    ): string | null {
      const tsNode = services.esTreeNodeToTSNodeMap.get(ident);
      const symbolAtLocation = checker.getSymbolAtLocation(tsNode);
      if (!symbolAtLocation) {
        if (matchesSuffix(ident.name)) {
          return ident.name;
        }
        return null;
      }
      const symbol = resolveSymbol(symbolAtLocation);
      const name = symbol.getName();
      if (!name || !matchesSuffix(name)) {
        return null;
      }
      return name;
    }

    function resolveTypeNodeDtoName(
      typeNode: TSESTree.TypeNode,
    ): string | null {
      const tsNode = services.esTreeNodeToTSNodeMap.get(typeNode);
      const type = checker.getTypeAtLocation(tsNode);
      return extractInnerDtoName(type, 0);
    }

    interface SwaggerCheckTarget {
      typeValueNode: TSESTree.Node;
      shape: Shape;
    }

    function getSwaggerTarget(
      decorator: TSESTree.Decorator,
    ): SwaggerCheckTarget | null {
      const name = getDecoratorName(decorator);
      if (!name) {
        return null;
      }
      const expr = decorator.expression;
      if (expr.type !== AST_NODE_TYPES.CallExpression) {
        return null;
      }
      const optionsArg = expr.arguments[0];

      const named = NAMED_DECORATOR_META[name];
      let isSuccess: boolean;
      let forcedKind: Kind | undefined;
      if (named) {
        if (!named.isSuccess) {
          return null;
        }
        isSuccess = true;
        forcedKind = named.forcedKind;
      } else if (name === 'ApiResponse') {
        if (!optionsArg || optionsArg.type !== AST_NODE_TYPES.ObjectExpression) {
          return null;
        }
        const statusProp = findObjectProperty(optionsArg, 'status');
        if (!statusProp) {
          return null;
        }
        const success = isSuccessApiResponseStatus(
          statusProp.value as TSESTree.Expression,
        );
        if (success !== true) {
          return null;
        }
        isSuccess = true;
      } else {
        return null;
      }
      if (!isSuccess) {
        return null;
      }
      if (!optionsArg || optionsArg.type !== AST_NODE_TYPES.ObjectExpression) {
        return null;
      }
      const typeProp = findObjectProperty(optionsArg, 'type');
      if (!typeProp) {
        return null;
      }
      const typeValue = typeProp.value as TSESTree.Node;
      const classified = classifyDecoratorTypeNode(typeValue);
      if (!classified) {
        return null;
      }
      let kind: Kind = classified.kind;
      if (forcedKind) {
        kind = forcedKind;
      } else {
        const isArrayProp = findObjectProperty(optionsArg, 'isArray');
        if (isArrayProp && isLiteralTrue(isArrayProp.value)) {
          kind = 'array';
        }
      }
      return {
        typeValueNode: typeValue,
        shape: { dtoName: classified.dtoName, kind },
      };
    }

    function checkEndpoint(
      method: TSESTree.MethodDefinition,
    ): void {
      const fn = method.value;
      const returnType = fn.returnType;
      if (!returnType) {
        return;
      }
      const tsReturnNode = services.esTreeNodeToTSNodeMap.get(
        returnType.typeAnnotation,
      );
      const returnTsType = checker.getTypeAtLocation(tsReturnNode);
      const returnShape = classifyReturnType(returnTsType);
      if (!returnShape) {
        return;
      }
      for (const decorator of method.decorators ?? []) {
        const target = getSwaggerTarget(decorator);
        if (!target) {
          continue;
        }
        if (
          target.shape.dtoName !== returnShape.dtoName ||
          target.shape.kind !== returnShape.kind
        ) {
          context.report({
            node: target.typeValueNode,
            messageId: 'slotMismatch',
            data: {
              swaggerShape: formatShape(target.shape),
              returnShape: formatShape(returnShape),
            },
          });
        }
      }
    }

    function visitController(
      classNode: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
    ): void {
      for (const member of classNode.body.body) {
        if (member.type !== AST_NODE_TYPES.MethodDefinition) {
          continue;
        }
        if (!hasAnyDecorator(member.decorators, HTTP_METHOD_DECORATORS)) {
          continue;
        }
        checkEndpoint(member);
      }
    }

    return {
      [AST_NODE_TYPES.ClassDeclaration](
        node: TSESTree.ClassDeclaration,
      ): void {
        if (!isControllerClass(node)) {
          return;
        }
        visitController(node);
      },
      [AST_NODE_TYPES.ClassExpression](node: TSESTree.ClassExpression): void {
        if (!isControllerClass(node)) {
          return;
        }
        visitController(node);
      },
    };
  },
});
