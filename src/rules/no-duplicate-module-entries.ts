import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { createRule } from '../utils/create-rule.js';

type MessageIds = 'duplicateInModuleArray' | 'duplicateInConstArray';

/**
 * Variable names matching this pattern are treated as arrays that will be
 * spread into a `@Module()` decorator (e.g. `handlers`, `commandHandlers`,
 * `queryProviders`, `extraControllers`, `customExports`).
 */
const MODULE_ARRAY_NAME_PATTERN = /(?:handler|provider|controller|export)s?$/i;

/**
 * Returns `true` when the decorator expression looks like `@Module(...)`.
 */
function isModuleDecorator(
  decorator: TSESTree.Decorator,
): decorator is TSESTree.Decorator & {
  expression: TSESTree.CallExpression & { callee: TSESTree.Identifier };
} {
  return (
    decorator.expression.type === AST_NODE_TYPES.CallExpression &&
    decorator.expression.callee.type === AST_NODE_TYPES.Identifier &&
    decorator.expression.callee.name === 'Module'
  );
}

/**
 * Extracts the first argument of `@Module({...})` — the configuration object.
 */
function getModuleConfigArgument(
  decorator: TSESTree.Decorator & {
    expression: TSESTree.CallExpression;
  },
): TSESTree.ObjectExpression | undefined {
  const arg = decorator.expression.arguments[0];

  if (arg && arg.type === AST_NODE_TYPES.ObjectExpression) {
    return arg;
  }

  return undefined;
}

/**
 * Produces an autofix that removes a duplicate array element together with
 * the comma that precedes it.  Falls back to removing just the element when
 * no preceding punctuation is found.
 */
function fixDuplicateElement(
  fixer: TSESLint.RuleFixer,
  duplicate: TSESTree.Node,
  sourceCode: Readonly<TSESLint.SourceCode>,
): TSESLint.RuleFix {
  const tokenBefore = sourceCode.getTokenBefore(duplicate, {
    includeComments: false,
  });

  if (tokenBefore && tokenBefore.value === ',') {
    // Remove the comma (and any whitespace before the element) plus the
    // element itself.
    return fixer.removeRange([tokenBefore.range[0], duplicate.range[1]]);
  }

  // The element might be the very first entry, or preceded by a comment
  // block.  Fall back to removing just the duplicate identifier.
  return fixer.remove(duplicate);
}

export const noDuplicateModuleEntries = createRule<[], MessageIds>({
  name: 'no-duplicate-module-entries',
  meta: {
    type: 'problem',
    fixable: 'code',
    docs: {
      description:
        'Disallow duplicate identifiers in @Module() decorator arrays and handler/provider const arrays.',
    },
    messages: {
      duplicateInModuleArray:
        "Duplicate '{{name}}' in the {{arrayName}} array of @Module().",
      duplicateInConstArray:
        "Duplicate '{{name}}' in the '{{variableName}}' const array.",
    },
    schema: [],
    defaultOptions: [],
  },
  defaultOptions: [],
  create(context): TSESLint.RuleListener {
    const { sourceCode } = context;

    /**
     * Scans an array's elements for duplicate `Identifier` references and
     * reports each duplicate with an autofix that removes it.
     */
    function checkArrayForDuplicates(
      elements: readonly (
        | TSESTree.Expression
        | TSESTree.SpreadElement
        | null
      )[],
      label:
        | { kind: 'module'; arrayName: string }
        | { kind: 'const'; variableName: string },
    ): void {
      const seen = new Map<string, TSESTree.Identifier>();

      for (const element of elements) {
        if (!element || element.type !== AST_NODE_TYPES.Identifier) {
          continue;
        }

        const { name } = element;
        const first = seen.get(name);

        if (first) {
          const messageId =
            label.kind === 'module'
              ? 'duplicateInModuleArray'
              : 'duplicateInConstArray';

          context.report({
            node: element,
            messageId,
            data:
              label.kind === 'module'
                ? { name, arrayName: label.arrayName }
                : { name, variableName: label.variableName },
            fix(fixer: TSESLint.RuleFixer) {
              return fixDuplicateElement(fixer, element, sourceCode);
            },
          });
        } else {
          seen.set(name, element);
        }
      }
    }

    return {
      // ── @Module({ controllers, providers, exports }) ──────────────────
      Decorator(node: TSESTree.Decorator): void {
        if (!isModuleDecorator(node)) {
          return;
        }

        const config = getModuleConfigArgument(node);
        if (!config) {
          return;
        }

        for (const prop of config.properties) {
          if (
            prop.type !== AST_NODE_TYPES.Property ||
            prop.key.type !== AST_NODE_TYPES.Identifier
          ) {
            continue;
          }

          const propName = prop.key.name;
          if (
            propName !== 'controllers' &&
            propName !== 'providers' &&
            propName !== 'exports'
          ) {
            continue;
          }

          if (prop.value.type === AST_NODE_TYPES.ArrayExpression) {
            checkArrayForDuplicates(prop.value.elements, {
              kind: 'module',
              arrayName: propName,
            });
          }
        }
      },

      // ── const handlers / providers / controllers / exports = […] ──────
      VariableDeclarator(node: TSESTree.VariableDeclarator): void {
        if (
          node.id.type !== AST_NODE_TYPES.Identifier ||
          !MODULE_ARRAY_NAME_PATTERN.test(node.id.name) ||
          !node.init ||
          node.init.type !== AST_NODE_TYPES.ArrayExpression
        ) {
          return;
        }

        checkArrayForDuplicates(node.init.elements, {
          kind: 'const',
          variableName: node.id.name,
        });
      },
    };
  },
});
