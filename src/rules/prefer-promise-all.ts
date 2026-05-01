import type { TSESLint, TSESTree } from '@typescript-eslint/utils';
import { AST_NODE_TYPES } from '@typescript-eslint/utils';

import { createRule } from '../utils/create-rule.js';

type MessageIds = 'preferPromiseAll';

interface GroupMember {
  node: TSESTree.VariableDeclaration;
  bindingNames: Set<string>;
  awaitArgument: TSESTree.Expression;
}

interface AwaitDecl {
  node: TSESTree.VariableDeclaration;
  awaitArgument: TSESTree.Expression;
  bindingNames: Set<string>;
}

function collectBoundNames(node: TSESTree.Node): Set<string> {
  const names = new Set<string>();
  const stack: TSESTree.Node[] = [node];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    switch (current.type) {
      case AST_NODE_TYPES.Identifier:
        names.add(current.name);
        break;
      case AST_NODE_TYPES.ObjectPattern:
        for (const prop of current.properties) {
          stack.push(
            prop.type === AST_NODE_TYPES.RestElement
              ? prop.argument
              : prop.value,
          );
        }
        break;
      case AST_NODE_TYPES.ArrayPattern:
        for (const el of current.elements) {
          if (el) {
            stack.push(el);
          }
        }
        break;
      case AST_NODE_TYPES.AssignmentPattern:
        stack.push(current.left);
        break;
      case AST_NODE_TYPES.RestElement:
        stack.push(current.argument);
        break;
      default:
        break;
    }
  }

  return names;
}

function nodeReferencesAny(root: TSESTree.Node, names: Set<string>): boolean {
  if (names.size === 0) {
    return false;
  }

  const stack: TSESTree.Node[] = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    if (current.type === AST_NODE_TYPES.Identifier && names.has(current.name)) {
      return true;
    }

    for (const key of Object.keys(current)) {
      if (key === 'parent' || key === 'range' || key === 'loc') {
        continue;
      }

      const child = (current as unknown as Record<string, unknown>)[key];

      if (Array.isArray(child)) {
        for (const item of child) {
          if (
            item !== null &&
            typeof item === 'object' &&
            typeof (item as Record<string, unknown>)['type'] === 'string'
          ) {
            stack.push(item as TSESTree.Node);
          }
        }
      } else if (
        child !== null &&
        typeof child === 'object' &&
        typeof (child as Record<string, unknown>)['type'] === 'string'
      ) {
        stack.push(child as TSESTree.Node);
      }
    }
  }

  return false;
}

function statementReferencesGroupBinding(
  stmt: TSESTree.Statement,
  groupBindings: Set<string>,
): boolean {
  if (groupBindings.size === 0) {
    return false;
  }

  if (stmt.type === AST_NODE_TYPES.VariableDeclaration) {
    return stmt.declarations.some(
      (decl) => decl.init !== null && decl.init !== undefined && nodeReferencesAny(decl.init, groupBindings),
    );
  }

  return nodeReferencesAny(stmt, groupBindings);
}

function extractAwaitDecl(stmt: TSESTree.Statement): AwaitDecl | null {
  if (stmt.type !== AST_NODE_TYPES.VariableDeclaration) {
    return null;
  }

  if (stmt.kind !== 'const') {
    return null;
  }

  if (stmt.declarations.length !== 1) {
    return null;
  }

  const decl = stmt.declarations[0];

  if (!decl?.init || decl.init.type !== AST_NODE_TYPES.AwaitExpression) {
    return null;
  }

  return {
    node: stmt,
    awaitArgument: decl.init.argument,
    bindingNames: collectBoundNames(decl.id),
  };
}

export const preferPromiseAll = createRule<[], MessageIds>({
  name: 'prefer-promise-all',
  meta: {
    type: 'suggestion',
    fixable: 'code',
    docs: {
      description:
        'Prefer combining independent sequential awaits into Promise.all for better performance.',
    },
    messages: {
      preferPromiseAll:
        '{{count}} sequential awaits are independent and can be combined with Promise.all.',
    },
    schema: [],
    defaultOptions: [],
  },
  create(context) {
    function emitGroup(members: GroupMember[], hasIntermediates: boolean): void {
      if (members.length < 2) {
        return;
      }

      const first = members[0];
      const last = members[members.length - 1];

      if (!first || !last) {
        return;
      }

      const canFix =
        !hasIntermediates &&
        members.every(
          (m) => m.node.declarations[0]?.id.type === AST_NODE_TYPES.Identifier,
        );

      context.report({
        node: first.node,
        messageId: 'preferPromiseAll',
        data: { count: String(members.length) },
        ...(canFix
          ? {
              fix(fixer: TSESLint.RuleFixer): TSESLint.RuleFix | null {
                const firstRange = first.node.range;
                const lastRange = last.node.range;

                if (!firstRange || !lastRange) {
                  return null;
                }

                const ids = members
                  .map((m) => context.sourceCode.getText(m.node.declarations[0]!.id))
                  .join(', ');
                const args = members
                  .map((m) => context.sourceCode.getText(m.awaitArgument))
                  .join(', ');

                return fixer.replaceTextRange(
                  [firstRange[0], lastRange[1]],
                  `const [${ids}] = await Promise.all([${args}]);`,
                );
              },
            }
          : {}),
      });
    }

    function processBlock(stmts: TSESTree.Statement[]): void {
      let members: GroupMember[] = [];
      let groupBindings = new Set<string>();
      let hasIntermediates = false;

      const closeGroup = (): void => {
        emitGroup(members, hasIntermediates);
        members = [];
        groupBindings = new Set<string>();
        hasIntermediates = false;
      };

      for (const stmt of stmts) {
        const awaitDecl = extractAwaitDecl(stmt);

        if (awaitDecl !== null) {
          if (nodeReferencesAny(awaitDecl.awaitArgument, groupBindings)) {
            closeGroup();
          }

          members.push({
            node: awaitDecl.node,
            bindingNames: awaitDecl.bindingNames,
            awaitArgument: awaitDecl.awaitArgument,
          });

          for (const name of awaitDecl.bindingNames) {
            groupBindings.add(name);
          }
        } else {
          if (statementReferencesGroupBinding(stmt, groupBindings)) {
            closeGroup();
          } else if (members.length > 0) {
            hasIntermediates = true;
          }
        }
      }

      closeGroup();
    }

    return {
      BlockStatement(node: TSESTree.BlockStatement): void {
        processBlock(node.body);
      },
    };
  },
});
