import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import * as ts from 'typescript';

import { createRule } from '../utils/create-rule.js';

type MessageIds =
  | 'optionalDecoratorRequiresOptionalProperty'
  | 'optionalPropertyRequiresOptionalDecorator'
  | 'nullableTypeRequiresNullableOption'
  | 'nullableOptionRequiresNullableType';

const FIELD_SHAPE_DECORATOR_RE = /(?:Field|Property)(?:Optional)?$/;
const OPTIONAL_SUFFIX_RE = /Optional$/;
const MAX_NULL_WALK_DEPTH = 8;

type NullableOptionState = 'true' | 'false' | 'absent' | 'unknown';

export const dtoDecoratorOptionalityMustMatchType = createRule<[], MessageIds>({
  name: 'dto-decorator-optionality-must-match-type',
  meta: {
    type: 'problem',
    docs: {
      description:
        "In classes named '*Dto', field decorator optionality and the '{ nullable: true }' option must match the property's '?' marker and nullable type respectively.",
    },
    messages: {
      optionalDecoratorRequiresOptionalProperty:
        "Decorator '{{decorator}}' ends with 'Optional' but property '{{property}}' is not declared optional ('?'). Either remove the 'Optional' suffix or mark the property optional.",
      optionalPropertyRequiresOptionalDecorator:
        "Property '{{property}}' is declared optional ('?') but decorator '{{decorator}}' does not end with 'Optional'. Either rename the decorator to its 'Optional' variant or remove the '?' marker.",
      nullableTypeRequiresNullableOption:
        "Property '{{property}}' has a nullable type but decorator '{{decorator}}' is missing '{ nullable: true }'. Either add the option or remove 'null' from the type.",
      nullableOptionRequiresNullableType:
        "Decorator '{{decorator}}' declares '{ nullable: true }' but property '{{property}}' type is not nullable. Either remove the option or add 'null' to the type.",
    },
    schema: [],
    defaultOptions: [],
  },
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    function getDecoratorCalleeName(
      decorator: TSESTree.Decorator,
    ): string | null {
      const expr = decorator.expression;
      if (expr.type === AST_NODE_TYPES.CallExpression) {
        if (expr.callee.type === AST_NODE_TYPES.Identifier) {
          return expr.callee.name;
        }
        if (
          expr.callee.type === AST_NODE_TYPES.MemberExpression &&
          !expr.callee.computed &&
          expr.callee.property.type === AST_NODE_TYPES.Identifier
        ) {
          return expr.callee.property.name;
        }
        return null;
      }
      if (expr.type === AST_NODE_TYPES.Identifier) {
        return expr.name;
      }
      if (
        expr.type === AST_NODE_TYPES.MemberExpression &&
        !expr.computed &&
        expr.property.type === AST_NODE_TYPES.Identifier
      ) {
        return expr.property.name;
      }
      return null;
    }

    function isFieldShapeName(name: string): boolean {
      return FIELD_SHAPE_DECORATOR_RE.test(name);
    }

    function isOptionalVariantName(name: string): boolean {
      return OPTIONAL_SUFFIX_RE.test(name);
    }

    function readNullableOption(
      decorator: TSESTree.Decorator,
    ): NullableOptionState {
      const expr = decorator.expression;
      if (expr.type !== AST_NODE_TYPES.CallExpression) return 'absent';
      const firstArg = expr.arguments[0];
      if (!firstArg) return 'absent';
      if (firstArg.type !== AST_NODE_TYPES.ObjectExpression) return 'unknown';

      let result: NullableOptionState = 'absent';
      for (const prop of firstArg.properties) {
        if (prop.type === AST_NODE_TYPES.SpreadElement) return 'unknown';
        if (prop.type !== AST_NODE_TYPES.Property) continue;
        if (prop.computed) continue;

        let keyName: string | undefined;
        if (prop.key.type === AST_NODE_TYPES.Identifier) {
          keyName = prop.key.name;
        } else if (
          prop.key.type === AST_NODE_TYPES.Literal &&
          typeof prop.key.value === 'string'
        ) {
          keyName = prop.key.value;
        }
        if (keyName !== 'nullable') continue;

        if (prop.value.type !== AST_NODE_TYPES.Literal) return 'unknown';
        const value = prop.value.value;
        if (value === true) result = 'true';
        else if (value === false) result = 'false';
        else return 'unknown';
      }
      return result;
    }

    function typeIncludesNull(type: ts.Type, depth = 0): boolean {
      if (depth > MAX_NULL_WALK_DEPTH) return false;
      if (type.flags & ts.TypeFlags.Null) return true;
      if (type.isUnion()) {
        return type.types.some((t) => typeIncludesNull(t, depth + 1));
      }
      if (type.isIntersection()) {
        return type.types.some((t) => typeIncludesNull(t, depth + 1));
      }
      return false;
    }

    function getPropertyKeyName(
      node: TSESTree.PropertyDefinition,
    ): string | null {
      if (node.computed) return null;
      const key = node.key;
      if (key.type === AST_NODE_TYPES.Identifier) return key.name;
      if (key.type === AST_NODE_TYPES.PrivateIdentifier) return null;
      if (key.type === AST_NODE_TYPES.Literal) {
        if (typeof key.value === 'string') return key.value;
        if (typeof key.value === 'number') return String(key.value);
      }
      return null;
    }

    function isInsideDtoClass(node: TSESTree.PropertyDefinition): boolean {
      const parent = node.parent;
      if (
        parent?.type !== AST_NODE_TYPES.ClassBody ||
        !parent.parent
      ) {
        return false;
      }
      const classNode = parent.parent;
      if (
        classNode.type !== AST_NODE_TYPES.ClassDeclaration &&
        classNode.type !== AST_NODE_TYPES.ClassExpression
      ) {
        return false;
      }
      const className = classNode.id?.name;
      return Boolean(className && className.endsWith('Dto'));
    }

    function isInitializerUndefinable(
      node: TSESTree.PropertyDefinition,
    ): boolean {
      if (!node.value) return true;
      if (
        node.value.type === AST_NODE_TYPES.Identifier &&
        node.value.name === 'undefined'
      ) {
        return true;
      }
      if (
        node.value.type === AST_NODE_TYPES.UnaryExpression &&
        node.value.operator === 'void'
      ) {
        return true;
      }
      return false;
    }

    function checkPropertyDefinition(node: TSESTree.PropertyDefinition): void {
      if (node.static) return;
      if (
        node.accessibility === 'private' ||
        node.accessibility === 'protected'
      ) {
        return;
      }
      if (node.key.type === AST_NODE_TYPES.PrivateIdentifier) return;
      if (!isInsideDtoClass(node)) return;

      const decorators = node.decorators ?? [];
      if (decorators.length === 0) return;

      const fieldShapeDecorators: Array<{
        node: TSESTree.Decorator;
        name: string;
      }> = [];
      for (const decorator of decorators) {
        const name = getDecoratorCalleeName(decorator);
        if (!name) continue;
        if (!isFieldShapeName(name)) continue;
        fieldShapeDecorators.push({ node: decorator, name });
      }
      if (fieldShapeDecorators.length === 0) return;

      const propertyName = getPropertyKeyName(node);
      if (!propertyName) return;

      const isPropertyOptional = node.optional === true;

      const hasRealDefault =
        node.value !== null && !isInitializerUndefinable(node);

      let typeIsNullable = false;
      if (node.typeAnnotation) {
        const tsTypeNode = services.esTreeNodeToTSNodeMap.get(
          node.typeAnnotation.typeAnnotation,
        );
        const tsType = checker.getTypeAtLocation(tsTypeNode);
        typeIsNullable = typeIncludesNull(tsType);
      } else {
        const tsNode = services.esTreeNodeToTSNodeMap.get(node);
        const tsType = checker.getTypeAtLocation(tsNode);
        typeIsNullable = typeIncludesNull(tsType);
      }

      const propertyIsEffectivelyOptional =
        isPropertyOptional || hasRealDefault;

      for (const { node: decoratorNode, name } of fieldShapeDecorators) {
        const isOptionalDecorator = isOptionalVariantName(name);

        if (isOptionalDecorator && !propertyIsEffectivelyOptional) {
          context.report({
            node: decoratorNode,
            messageId: 'optionalDecoratorRequiresOptionalProperty',
            data: { decorator: name, property: propertyName },
          });
        } else if (!isOptionalDecorator && isPropertyOptional) {
          context.report({
            node: decoratorNode,
            messageId: 'optionalPropertyRequiresOptionalDecorator',
            data: { decorator: name, property: propertyName },
          });
        }

        const nullableOption = readNullableOption(decoratorNode);
        if (nullableOption === 'unknown') continue;

        const nullableDeclared = nullableOption === 'true';
        if (nullableDeclared && !typeIsNullable) {
          context.report({
            node: decoratorNode,
            messageId: 'nullableOptionRequiresNullableType',
            data: { decorator: name, property: propertyName },
          });
        } else if (!nullableDeclared && typeIsNullable) {
          context.report({
            node: decoratorNode,
            messageId: 'nullableTypeRequiresNullableOption',
            data: { decorator: name, property: propertyName },
          });
        }
      }
    }

    return {
      PropertyDefinition: checkPropertyDefinition,
    };
  },
});
