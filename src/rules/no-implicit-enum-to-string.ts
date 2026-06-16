import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES, ESLintUtils } from '@typescript-eslint/utils';
import * as ts from 'typescript';

import { createRule } from '../utils/create-rule.js';

type MessageIds = 'implicitEnumToString';

// `isTypeAssignableTo` is an internal checker API: stable in practice and widely
// relied on by type-aware ESLint rules, but absent from the public `.d.ts`.
// Isolated behind this typed view so the one cast lives in a single place.
interface CheckerWithAssignability extends ts.TypeChecker {
  isTypeAssignableTo(source: ts.Type, target: ts.Type): boolean;
}

// ---------------------------------------------------------------------------
// type classification
// ---------------------------------------------------------------------------

/**
 * True when `type` is a string-enum type or a string-enum member type — i.e.
 * every constituent is an enum literal whose value is a string. This matches:
 *   - a single member:           A.name           (EnumLiteral | StringLiteral)
 *   - a whole string enum:       A.name | A.other (union of the above)
 *   - the string member of a mixed enum: M.b
 * It deliberately rejects:
 *   - numeric enum members (NumberLiteral, not assignable to `string` anyway)
 *   - plain string-literal unions like `'a' | 'b'` (no EnumLiteral flag)
 *   - the bare `string` primitive
 */
function isStringEnumType(type: ts.Type): boolean {
  const parts = type.isUnion() ? type.types : [type];
  let sawStringEnumMember = false;
  for (const part of parts) {
    if ((part.flags & ts.TypeFlags.EnumLiteral) === 0) {
      return false;
    }
    if ((part.flags & ts.TypeFlags.StringLiteral) === 0) {
      // a numeric enum member — TypeScript already rejects this at a string sink
      return false;
    }
    sawStringEnumMember = true;
  }
  return sawStringEnumMember;
}

/**
 * True when the only reason the string enum is accepted by `contextual` is a
 * bare `string` constituent — i.e. the enum is being implicitly widened to
 * `string`. Returns false when the sink has no bare-`string` part (e.g. it is
 * typed as the enum itself, `unknown`, or `any`) or when some non-`string`
 * constituent already accepts the enum.
 *
 * Note: `string | SomeEnum` cannot reach here as a distinct type — because a
 * string enum is a subtype of `string`, TypeScript collapses `string | A` to
 * `string`. The opt-out is therefore to type the sink as the enum itself.
 */
function isLaunderedThroughString(
  checker: CheckerWithAssignability,
  enumType: ts.Type,
  contextual: ts.Type,
): boolean {
  const parts = contextual.isUnion() ? contextual.types : [contextual];
  let hasBareString = false;
  const nonStringParts: ts.Type[] = [];
  for (const part of parts) {
    if ((part.flags & ts.TypeFlags.String) !== 0) {
      hasBareString = true;
    } else {
      nonStringParts.push(part);
    }
  }
  if (!hasBareString) {
    return false;
  }
  for (const part of nonStringParts) {
    if (checker.isTypeAssignableTo(enumType, part)) {
      return false;
    }
  }
  return true;
}

/**
 * Skip identifiers that are not standalone value expressions — a property name
 * (`A.name` → `name`) or an object-literal key (`{ name: x }` → `name`). These
 * carry no contextual type of their own; filtering them up front avoids
 * redundant type work. Every other non-value position bails later because
 * `getContextualType` returns undefined for it.
 */
function isNonReferenceIdentifier(node: TSESTree.Identifier): boolean {
  const parent = node.parent;
  if (
    parent.type === AST_NODE_TYPES.MemberExpression &&
    parent.property === node &&
    !parent.computed
  ) {
    return true;
  }
  if (
    parent.type === AST_NODE_TYPES.Property &&
    parent.key === node &&
    !parent.computed
  ) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// rule
// ---------------------------------------------------------------------------

export const noImplicitEnumToString = createRule<[], MessageIds>({
  name: 'no-implicit-enum-to-string',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Bans implicitly passing a string enum where a plain `string` is expected. Type the target as the enum, or convert explicitly with String(...).',
    },
    messages: {
      implicitEnumToString:
        "Implicitly using the string enum '{{enumType}}' where a 'string' is expected widens it to its raw value and decouples this code from the enum. Type the target as the enum, convert explicitly with String(...), or disable this rule with a reason.",
    },
    schema: [],
    defaultOptions: [],
  },
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker() as CheckerWithAssignability;

    function check(node: TSESTree.Expression): void {
      const tsNode = services.esTreeNodeToTSNodeMap.get(node);
      const enumType = checker.getTypeAtLocation(tsNode);
      if (!isStringEnumType(enumType)) {
        return;
      }
      let contextual: ts.Type | undefined;
      try {
        contextual = checker.getContextualType(tsNode as ts.Expression);
      } catch {
        // getContextualType can throw on nodes that are not real expressions
        // (e.g. an enum identifier used in type position) — treat as no sink.
        return;
      }
      if (!contextual) {
        return;
      }
      if (!isLaunderedThroughString(checker, enumType, contextual)) {
        return;
      }
      context.report({
        node,
        messageId: 'implicitEnumToString',
        data: { enumType: checker.typeToString(enumType) },
      });
    }

    return {
      MemberExpression(node): void {
        check(node);
      },
      Identifier(node): void {
        if (isNonReferenceIdentifier(node)) {
          return;
        }
        check(node);
      },
      CallExpression(node): void {
        check(node);
      },
    };
  },
});
