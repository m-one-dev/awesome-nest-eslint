import type { RuleName } from '../rules/index.js';

type RuleOptionsMap = Partial<Record<RuleName, readonly unknown[]>>;

export const globalRuleOptions: RuleOptionsMap = {
  'require-api-endpoint-docs': [{ requireOperationSummary: true }],
};

export const controllerFilesConfig: {
  files: readonly string[];
  ignores: readonly string[];
  ruleOptions: RuleOptionsMap;
} = {
  files: ['**/*.controller.ts'],
  ignores: ['**/*-nats.controller.ts', '**/health-checker.controller.ts'],
  ruleOptions: {
    'require-api-endpoint-docs': [{ requireOperationSummary: true }],
  },
};
