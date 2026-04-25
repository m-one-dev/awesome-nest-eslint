import { ESLintUtils } from '@typescript-eslint/utils';

export const createRule = ESLintUtils.RuleCreator(
  (name) =>
    `https://github.com/m-one/awesome-nest-eslint/blob/main/docs/rules/${name}.md`,
);
