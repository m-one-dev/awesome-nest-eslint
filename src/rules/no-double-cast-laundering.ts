import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { createRule } from '../utils/create-rule.js';

type MessageIds = 'noLaundering';

function getIntermediateName(
  asExpr: TSESTree.TSAsExpression,
): 'any' | 'unknown' | null {
  const typeAnn = asExpr.typeAnnotation;
  if (typeAnn.type === AST_NODE_TYPES.TSAnyKeyword) {
    return 'any';
  }
  if (typeAnn.type === AST_NODE_TYPES.TSUnknownKeyword) {
    return 'unknown';
  }
  return null;
}

export const noDoubleCastLaundering = createRule<[], MessageIds>({
  name: 'no-double-cast-laundering',
  meta: {
    type: 'problem',
    docs: {
      description:
        "Bans 'expr as unknown as T' and 'expr as any as T' — the double-cast pattern that launders an unrelated type past the type checker.",
    },
    messages: {
      noLaundering:
        "Do not launder types through '{{intermediate}}'. 'expr as {{intermediate}} as T' bypasses type checking by hopping through a top type. Model the type correctly, or if the cast is genuinely necessary, narrow with a type guard.",
    },
    schema: [],
    defaultOptions: [],
  },
  create(context) {
    return {
      TSAsExpression(node) {
        const inner = node.expression;
        if (inner.type !== AST_NODE_TYPES.TSAsExpression) {
          return;
        }
        const intermediate = getIntermediateName(inner);
        if (!intermediate) {
          return;
        }
        context.report({
          node,
          messageId: 'noLaundering',
          data: { intermediate },
        });
      },
    };
  },
});
