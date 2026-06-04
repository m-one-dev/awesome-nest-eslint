import type { TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { createRule } from '../utils/create-rule';

type MessageIds = 'noApiProperty' | 'noApiPropertyOptional';

const BANNED_NAMES: ReadonlySet<string> = new Set([
  'ApiProperty',
  'ApiPropertyOptional',
]);

export const noApiPropertyDecorator = createRule<[], MessageIds>({
  name: 'no-api-property-decorator',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow @ApiProperty and @ApiPropertyOptional decorators on class members. Use Field decorators (@StringField, @NumberField, etc.) from @hr-drone/common-module instead.',
    },
    messages: {
      noApiProperty:
        "Use a Field decorator (@StringField, @NumberField, @UUIDField, etc.) instead of @ApiProperty. 'description' is mandatory on every Field decorator.",
      noApiPropertyOptional:
        "Use a FieldOptional decorator (@StringFieldOptional, @NumberFieldOptional, etc.) instead of @ApiPropertyOptional. 'description' is mandatory on every Field decorator.",
    },
    schema: [],
    defaultOptions: [],
  },
  create(context) {
    return {
      [AST_NODE_TYPES.Decorator](node: TSESTree.Decorator) {
        const expr = node.expression;

        // Direct @ApiProperty(...) or @ApiPropertyOptional(...)
        if (
          expr.type === AST_NODE_TYPES.CallExpression &&
          expr.callee.type === AST_NODE_TYPES.Identifier &&
          BANNED_NAMES.has(expr.callee.name)
        ) {
          const messageId: MessageIds =
            expr.callee.name === 'ApiPropertyOptional'
              ? 'noApiPropertyOptional'
              : 'noApiProperty';

          context.report({ node, messageId });
        }
      },
    };
  },
});
