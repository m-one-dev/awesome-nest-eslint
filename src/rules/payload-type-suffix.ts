import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import * as ts from 'typescript';

import { createRule } from '../utils/create-rule.js';

type MessageIds =
  | 'payloadTypeSuffix'
  | 'sendArgTypeSuffix'
  | 'missingType'
  | 'paramNameMustBePayload';

interface Options {
  allowedSuffixes?: string[];
  enforcePayloadParamName?: boolean;
}

const DEFAULT_SUFFIXES: readonly string[] = [
  'PayloadDto',
  'PageOptionsDto',
  'CursorPageOptionsDto',
];

const UNWRAP_GENERICS = new Set([
  'Array',
  'ReadonlyArray',
  'Partial',
  'Required',
  'Readonly',
]);

const SKIPPED_TYPE_FLAGS =
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Null |
  ts.TypeFlags.Void |
  ts.TypeFlags.Never |
  ts.TypeFlags.Any |
  ts.TypeFlags.Unknown;

export const payloadTypeSuffix = createRule<[Options], MessageIds>({
  name: "payload-type-suffix",
  meta: {
    type: "problem",
    docs: {
      description:
        "Payload parameters on NATS controllers and AbstractClientService `send`/`emit` calls must use a type whose name ends with an allowed payload suffix.",
    },
    messages: {
      payloadTypeSuffix:
        "@Payload() parameter type '{{name}}' must end with one of: {{suffixes}}.",
      sendArgTypeSuffix:
        "Data argument of '{{method}}' has type '{{name}}' which must end with one of: {{suffixes}}.",
      missingType: "@Payload() parameter must have a type annotation.",
      paramNameMustBePayload:
        "@Payload() parameter must be named 'payload' (got '{{name}}').",
    },
    schema: [
      {
        type: "object",
        additionalProperties: false,
        properties: {
          allowedSuffixes: {
            type: "array",
            items: { type: "string", minLength: 1 },
            minItems: 1,
          },
          enforcePayloadParamName: { type: "boolean" },
        },
      },
    ],
    defaultOptions: [
      {
        allowedSuffixes: [...DEFAULT_SUFFIXES],
        enforcePayloadParamName: false,
      },
    ],
  },
  create(context, [rawOptions]) {
    const allowedSuffixes =
      rawOptions.allowedSuffixes && rawOptions.allowedSuffixes.length > 0
        ? rawOptions.allowedSuffixes
        : [...DEFAULT_SUFFIXES];
    const enforcePayloadParamName = rawOptions.enforcePayloadParamName ?? false;
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();
    const suffixesText = allowedSuffixes.join(", ");

    const heritageCache = new WeakMap<TSESTree.Node, boolean>();

    function classHeritageIncludesAbstractClientService(
      classDecl: ts.ClassLikeDeclaration,
    ): boolean {
      const visited = new Set<ts.Node>();
      const stack: ts.ClassLikeDeclaration[] = [classDecl];
      while (stack.length > 0) {
        const current = stack.pop();
        if (!current || visited.has(current)) {
          continue;
        }
        visited.add(current);
        const heritageClauses = current.heritageClauses ?? [];
        for (const clause of heritageClauses) {
          if (clause.token !== ts.SyntaxKind.ExtendsKeyword) {
            continue;
          }
          for (const typeExpr of clause.types) {
            const superType = checker.getTypeAtLocation(typeExpr.expression);
            const superSymbol = superType.getSymbol() ?? superType.aliasSymbol;
            if (!superSymbol) {
              continue;
            }
            if (superSymbol.getName() === "AbstractClientService") {
              return true;
            }
            const decls = superSymbol.getDeclarations() ?? [];
            for (const decl of decls) {
              if (ts.isClassDeclaration(decl) || ts.isClassExpression(decl)) {
                stack.push(decl);
              }
            }
          }
        }
      }
      return false;
    }

    function extendsAbstractClientService(
      classNode: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
    ): boolean {
      const cached = heritageCache.get(classNode);
      if (cached !== undefined) {
        return cached;
      }
      if (!classNode.superClass) {
        heritageCache.set(classNode, false);
        return false;
      }
      const tsNode = services.esTreeNodeToTSNodeMap.get(
        classNode,
      ) as ts.ClassLikeDeclaration;
      const result = classHeritageIncludesAbstractClientService(tsNode);
      heritageCache.set(classNode, result);
      return result;
    }

    function findEnclosingClass(
      node: TSESTree.Node,
    ): TSESTree.ClassDeclaration | TSESTree.ClassExpression | null {
      let current: TSESTree.Node | undefined = node.parent;
      while (current) {
        if (
          current.type === AST_NODE_TYPES.ClassDeclaration ||
          current.type === AST_NODE_TYPES.ClassExpression
        ) {
          return current;
        }
        current = current.parent;
      }
      return null;
    }

    function matchesAllowedSuffix(name: string): boolean {
      return allowedSuffixes.some((suffix) => name.endsWith(suffix));
    }

    function extractNamesFromTsType(type: ts.Type, depth = 0): string[] {
      if (depth > 4) {
        return [];
      }
      if (type.flags & SKIPPED_TYPE_FLAGS) {
        return [];
      }
      if (type.isUnion()) {
        const names: string[] = [];
        for (const member of type.types) {
          names.push(...extractNamesFromTsType(member, depth + 1));
        }
        return names;
      }
      const aliasName = type.aliasSymbol?.getName();
      if (
        aliasName &&
        UNWRAP_GENERICS.has(aliasName) &&
        type.aliasTypeArguments?.[0]
      ) {
        return extractNamesFromTsType(type.aliasTypeArguments[0], depth + 1);
      }
      const typeRef = type as ts.TypeReference;
      const target = typeRef.target;
      if (target && target !== type) {
        const targetName = target.getSymbol()?.getName();
        if (targetName && UNWRAP_GENERICS.has(targetName)) {
          const typeArgs = checker.getTypeArguments(typeRef);
          if (typeArgs[0]) {
            return extractNamesFromTsType(typeArgs[0], depth + 1);
          }
        }
      }
      const symbol = type.aliasSymbol ?? type.getSymbol();
      const name = symbol?.getName();
      if (!name || name === "__type" || name === "__object") {
        return [];
      }
      return [name];
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

    function getParamIdentifierName(param: TSESTree.Parameter): string | null {
      if (param.type === AST_NODE_TYPES.Identifier) {
        return param.name;
      }
      if (
        param.type === AST_NODE_TYPES.AssignmentPattern &&
        param.left.type === AST_NODE_TYPES.Identifier
      ) {
        return param.left.name;
      }
      return null;
    }

    function getParamTypeAnnotation(
      param: TSESTree.Parameter,
    ): TSESTree.TSTypeAnnotation | undefined {
      if ("typeAnnotation" in param && param.typeAnnotation) {
        return param.typeAnnotation;
      }
      if (
        param.type === AST_NODE_TYPES.AssignmentPattern &&
        "typeAnnotation" in param.left &&
        param.left.typeAnnotation
      ) {
        return param.left.typeAnnotation;
      }
      return undefined;
    }

    function isFunctionLikeNode(type: AST_NODE_TYPES | undefined): boolean {
      return (
        type === AST_NODE_TYPES.FunctionDeclaration ||
        type === AST_NODE_TYPES.FunctionExpression ||
        type === AST_NODE_TYPES.ArrowFunctionExpression ||
        type === AST_NODE_TYPES.TSEmptyBodyFunctionExpression ||
        type === AST_NODE_TYPES.TSFunctionType ||
        type === AST_NODE_TYPES.TSDeclareFunction
      );
    }

    return {
      Decorator(node) {
        if (getDecoratorName(node) !== "Payload") {
          return;
        }
        const param = node.parent;
        if (!param || !isFunctionLikeNode(param.parent?.type)) {
          return;
        }
        const typedParam = param as TSESTree.Parameter;

        if (enforcePayloadParamName) {
          const name = getParamIdentifierName(typedParam);
          if (name !== null && name !== "payload") {
            context.report({
              node: typedParam,
              messageId: "paramNameMustBePayload",
              data: { name },
            });
          }
        }

        const typeAnnotation = getParamTypeAnnotation(typedParam);
        if (!typeAnnotation) {
          context.report({
            node: typedParam,
            messageId: "missingType",
          });

          return;
        }

        const tsNode = services.esTreeNodeToTSNodeMap.get(
          typeAnnotation.typeAnnotation,
        );
        const type = checker.getTypeAtLocation(tsNode);
        const names = extractNamesFromTsType(type);
        if (names.length === 0) {
          return;
        }
        const bad = names.filter((n) => !matchesAllowedSuffix(n));
        if (bad.length === 0) {
          return;
        }
        context.report({
          node: typeAnnotation.typeAnnotation,
          messageId: "payloadTypeSuffix",
          data: { name: bad.join(" | "), suffixes: suffixesText },
        });
      },

      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type !== AST_NODE_TYPES.MemberExpression ||
          callee.object.type !== AST_NODE_TYPES.ThisExpression ||
          callee.property.type !== AST_NODE_TYPES.Identifier
        ) {
          return;
        }
        const methodName = callee.property.name;
        if (methodName !== "send" && methodName !== "emit") {
          return;
        }
        const classNode = findEnclosingClass(node);
        if (!classNode || !extendsAbstractClientService(classNode)) {
          return;
        }
        const dataArg = node.arguments[1];
        if (
          !dataArg ||
          dataArg.type === AST_NODE_TYPES.ObjectExpression ||
          dataArg.type === AST_NODE_TYPES.ArrayExpression ||
          dataArg.type === AST_NODE_TYPES.SpreadElement
        ) {
          return;
        }
        const tsNode = services.esTreeNodeToTSNodeMap.get(dataArg);
        const type = checker.getTypeAtLocation(tsNode);
        const names = extractNamesFromTsType(type);
        if (names.length === 0) {
          return;
        }
        const bad = names.filter((n) => !matchesAllowedSuffix(n));
        if (bad.length === 0) {
          return;
        }
        context.report({
          node: dataArg,
          messageId: "sendArgTypeSuffix",
          data: {
            method: methodName,
            name: bad.join(" | "),
            suffixes: suffixesText,
          },
        });
      },
    };
  },
});
