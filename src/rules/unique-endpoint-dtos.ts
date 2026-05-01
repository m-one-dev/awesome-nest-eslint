import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import * as ts from 'typescript';

import { createRule } from '../utils/create-rule.js';

type MessageIds = 'duplicateDto';

type Position = 'body' | 'query' | 'response';

interface Usage {
  filePath: string;
  line: number;
  column: number;
  controller: string;
  method: string;
  position: Position;
}

export interface Options {
  suffixes?: string[];
  responseWrappers?: string[];
  swaggerResponseDecorators?: string[];
}

const DEFAULT_SUFFIXES: readonly string[] = ['Dto'];

const DEFAULT_RESPONSE_WRAPPERS: readonly string[] = [
  'Promise',
  'Observable',
  'Array',
  'ReadonlyArray',
  'PageDto',
  'PageOptionsDto',
];

const DEFAULT_SWAGGER_DECORATORS: readonly string[] = [
  'ApiResponse',
  'ApiOkResponse',
  'ApiCreatedResponse',
  'ApiAcceptedResponse',
  'ApiDefaultResponse',
  'ApiNoContentResponse',
];

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

const registry = new Map<string, Usage[]>();

export const uniqueEndpointDtos = createRule<[Options], MessageIds>({
  name: 'unique-endpoint-dtos',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Each DTO class may appear in at most one NestJS endpoint slot (request body, query, or response) across the project.',
    },
    messages: {
      duplicateDto:
        "DTO '{{name}}' is already used as the {{prevPosition}} of {{prevController}}.{{prevMethod}} ({{prevLocation}}). Each endpoint slot must use its own DTO.",
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
          responseWrappers: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
          swaggerResponseDecorators: {
            type: 'array',
            items: { type: 'string', minLength: 1 },
          },
        },
      },
    ],
    defaultOptions: [
      {
        suffixes: [...DEFAULT_SUFFIXES],
        responseWrappers: [...DEFAULT_RESPONSE_WRAPPERS],
        swaggerResponseDecorators: [...DEFAULT_SWAGGER_DECORATORS],
      },
    ],
  },
  create(context, [rawOptions]) {
    const suffixes =
      rawOptions.suffixes && rawOptions.suffixes.length > 0
        ? rawOptions.suffixes
        : [...DEFAULT_SUFFIXES];
    const responseWrappers = new Set(
      rawOptions.responseWrappers && rawOptions.responseWrappers.length > 0
        ? rawOptions.responseWrappers
        : [...DEFAULT_RESPONSE_WRAPPERS],
    );
    const swaggerResponseDecorators = new Set(
      rawOptions.swaggerResponseDecorators &&
      rawOptions.swaggerResponseDecorators.length > 0
        ? rawOptions.swaggerResponseDecorators
        : [...DEFAULT_SWAGGER_DECORATORS],
    );

    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();
    const filePath = context.filename;

    for (const [key, usages] of registry) {
      const filtered = usages.filter((u) => u.filePath !== filePath);
      if (filtered.length === 0) {
        registry.delete(key);
      } else if (filtered.length !== usages.length) {
        registry.set(key, filtered);
      }
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

    function findDecorator(
      decorators: TSESTree.Decorator[] | undefined,
      name: string,
    ): TSESTree.Decorator | undefined {
      if (!decorators) {
        return undefined;
      }
      return decorators.find((d) => getDecoratorName(d) === name);
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

    function getDecoratorCallArgument(
      decorator: TSESTree.Decorator,
    ): TSESTree.CallExpressionArgument | undefined {
      const expr = decorator.expression;
      if (expr.type !== AST_NODE_TYPES.CallExpression) {
        return undefined;
      }
      return expr.arguments[0];
    }

    function isCallWithStringArg(decorator: TSESTree.Decorator): boolean {
      const arg = getDecoratorCallArgument(decorator);
      if (!arg) {
        return false;
      }
      if (arg.type === AST_NODE_TYPES.Literal && typeof arg.value === 'string') {
        return true;
      }
      return false;
    }

    function getParamTypeAnnotation(
      param: TSESTree.Parameter,
    ): TSESTree.TSTypeAnnotation | undefined {
      if ('typeAnnotation' in param && param.typeAnnotation) {
        return param.typeAnnotation;
      }
      if (
        param.type === AST_NODE_TYPES.AssignmentPattern &&
        'typeAnnotation' in param.left &&
        param.left.typeAnnotation
      ) {
        return param.left.typeAnnotation;
      }
      return undefined;
    }

    function matchesSuffix(name: string): boolean {
      return suffixes.some((suffix) => name.endsWith(suffix));
    }

    interface ResolvedDto {
      name: string;
      key: string;
    }

    function symbolToKey(symbol: ts.Symbol, name: string): string {
      const decl = symbol.declarations?.[0];
      const declFile = decl ? decl.getSourceFile().fileName : '<unknown>';
      return `${declFile}::${name}`;
    }

    function resolveSymbol(symbol: ts.Symbol): ts.Symbol {
      if (symbol.flags & ts.SymbolFlags.Alias) {
        return checker.getAliasedSymbol(symbol);
      }
      return symbol;
    }

    function collectDtosFromTsType(
      type: ts.Type,
      out: ResolvedDto[],
      seen: Set<ts.Type>,
      depth = 0,
    ): void {
      if (depth > 6 || seen.has(type)) {
        return;
      }
      seen.add(type);
      if (type.flags & SKIPPED_TYPE_FLAGS) {
        return;
      }
      if (type.isUnion() || type.isIntersection()) {
        for (const member of type.types) {
          collectDtosFromTsType(member, out, seen, depth + 1);
        }
        return;
      }

      const aliasName = type.aliasSymbol?.getName();
      if (
        aliasName &&
        responseWrappers.has(aliasName) &&
        type.aliasTypeArguments?.[0]
      ) {
        collectDtosFromTsType(
          type.aliasTypeArguments[0],
          out,
          seen,
          depth + 1,
        );
        return;
      }

      const typeRef = type as ts.TypeReference;
      const target = typeRef.target;
      if (target && target !== type) {
        const targetName = target.getSymbol()?.getName();
        if (targetName && responseWrappers.has(targetName)) {
          const typeArgs = checker.getTypeArguments(typeRef);
          for (const arg of typeArgs) {
            collectDtosFromTsType(arg, out, seen, depth + 1);
          }
          return;
        }
      }

      const rawSymbol = type.aliasSymbol ?? type.getSymbol();
      if (!rawSymbol) {
        return;
      }
      const symbol = resolveSymbol(rawSymbol);
      const name = symbol.getName();
      if (!name || name === '__type' || name === '__object') {
        return;
      }
      if (responseWrappers.has(name)) {
        return;
      }
      if (!matchesSuffix(name)) {
        return;
      }
      out.push({ name, key: symbolToKey(symbol, name) });
    }

    function isControllerClass(
      classNode: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
    ): boolean {
      const decorators = classNode.decorators;
      if (!decorators) {
        return false;
      }
      for (const d of decorators) {
        const n = getDecoratorName(d);
        if (n === 'Controller') {
          return true;
        }
      }
      return false;
    }

    function getMethodName(method: TSESTree.MethodDefinition): string {
      const key = method.key;
      if (key.type === AST_NODE_TYPES.Identifier) {
        return key.name;
      }
      if (key.type === AST_NODE_TYPES.Literal) {
        return String(key.value);
      }
      return '<computed>';
    }

    function getControllerName(
      classNode: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
    ): string {
      return classNode.id?.name ?? '<anonymous>';
    }

    function recordUsage(
      reportNode: TSESTree.Node,
      dto: ResolvedDto,
      controller: string,
      methodName: string,
      position: Position,
    ): void {
      const loc = reportNode.loc.start;
      const usage: Usage = {
        filePath,
        line: loc.line,
        column: loc.column,
        controller,
        method: methodName,
        position,
      };
      const existing = registry.get(dto.key);
      if (!existing) {
        registry.set(dto.key, [usage]);
        return;
      }
      const prior = existing[0];
      registry.set(dto.key, [...existing, usage]);
      if (!prior) {
        return;
      }
      context.report({
        node: reportNode,
        messageId: 'duplicateDto',
        data: {
          name: dto.name,
          prevController: prior.controller,
          prevMethod: prior.method,
          prevPosition: prior.position,
          prevLocation: `${prior.filePath}:${prior.line}:${prior.column}`,
        },
      });
    }

    function checkParamType(
      param: TSESTree.Parameter,
      controller: string,
      methodName: string,
      position: Position,
    ): void {
      const annotation = getParamTypeAnnotation(param);
      if (!annotation) {
        return;
      }
      const tsNode = services.esTreeNodeToTSNodeMap.get(
        annotation.typeAnnotation,
      );
      const type = checker.getTypeAtLocation(tsNode);
      const dtos: ResolvedDto[] = [];
      collectDtosFromTsType(type, dtos, new Set());
      for (const dto of dtos) {
        recordUsage(
          annotation.typeAnnotation,
          dto,
          controller,
          methodName,
          position,
        );
      }
    }

    function checkReturnType(
      method: TSESTree.MethodDefinition,
      controller: string,
      methodName: string,
    ): void {
      const fn = method.value;
      const returnType = fn.returnType;
      if (!returnType) {
        return;
      }
      const tsNode = services.esTreeNodeToTSNodeMap.get(
        returnType.typeAnnotation,
      );
      const type = checker.getTypeAtLocation(tsNode);
      const dtos: ResolvedDto[] = [];
      collectDtosFromTsType(type, dtos, new Set());
      for (const dto of dtos) {
        recordUsage(
          returnType.typeAnnotation,
          dto,
          controller,
          methodName,
          'response',
        );
      }
    }

    function collectDtosFromExpression(
      expr: TSESTree.Identifier | TSESTree.ArrayExpression,
      out: Array<{ dto: ResolvedDto; node: TSESTree.Node }>,
    ): void {
      if (expr.type === AST_NODE_TYPES.Identifier) {
        const tsNode = services.esTreeNodeToTSNodeMap.get(expr);
        const symbolAtLocation = checker.getSymbolAtLocation(tsNode);
        if (!symbolAtLocation) {
          return;
        }
        const symbol = resolveSymbol(symbolAtLocation);
        const name = symbol.getName();
        if (!name || !matchesSuffix(name)) {
          return;
        }
        out.push({ dto: { name, key: symbolToKey(symbol, name) }, node: expr });
        return;
      }
      for (const el of expr.elements) {
        if (
          el &&
          (el.type === AST_NODE_TYPES.Identifier ||
            el.type === AST_NODE_TYPES.ArrayExpression)
        ) {
          collectDtosFromExpression(el, out);
        }
      }
    }

    function checkSwaggerResponseDecorators(
      method: TSESTree.MethodDefinition,
      controller: string,
      methodName: string,
    ): void {
      const decorators = method.decorators ?? [];
      for (const decorator of decorators) {
        const name = getDecoratorName(decorator);
        if (!name || !swaggerResponseDecorators.has(name)) {
          continue;
        }
        if (decorator.expression.type !== AST_NODE_TYPES.CallExpression) {
          continue;
        }
        const arg = decorator.expression.arguments[0];
        if (!arg || arg.type !== AST_NODE_TYPES.ObjectExpression) {
          continue;
        }
        for (const prop of arg.properties) {
          if (
            prop.type !== AST_NODE_TYPES.Property ||
            prop.computed ||
            prop.key.type !== AST_NODE_TYPES.Identifier ||
            prop.key.name !== 'type'
          ) {
            continue;
          }
          const valueNode = prop.value;
          if (
            valueNode.type !== AST_NODE_TYPES.Identifier &&
            valueNode.type !== AST_NODE_TYPES.ArrayExpression
          ) {
            continue;
          }
          const collected: Array<{ dto: ResolvedDto; node: TSESTree.Node }> =
            [];
          collectDtosFromExpression(valueNode, collected);
          for (const { dto, node } of collected) {
            recordUsage(node, dto, controller, methodName, 'response');
          }
        }
      }
    }

    function visitController(
      classNode: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
    ): void {
      const controller = getControllerName(classNode);
      for (const member of classNode.body.body) {
        if (member.type !== AST_NODE_TYPES.MethodDefinition) {
          continue;
        }
        if (!hasAnyDecorator(member.decorators, HTTP_METHOD_DECORATORS)) {
          continue;
        }
        const methodName = getMethodName(member);
        const fn = member.value;
        for (const param of fn.params) {
          const targetParam =
            param.type === AST_NODE_TYPES.TSParameterProperty
              ? param.parameter
              : param;
          if (!('decorators' in targetParam) || !targetParam.decorators) {
            continue;
          }
          const bodyDecorator = findDecorator(targetParam.decorators, 'Body');
          if (bodyDecorator && !isCallWithStringArg(bodyDecorator)) {
            checkParamType(targetParam, controller, methodName, 'body');
            continue;
          }
          const queryDecorator = findDecorator(targetParam.decorators, 'Query');
          if (queryDecorator && !isCallWithStringArg(queryDecorator)) {
            checkParamType(targetParam, controller, methodName, 'query');
          }
        }
        checkReturnType(member, controller, methodName);
        checkSwaggerResponseDecorators(member, controller, methodName);
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
