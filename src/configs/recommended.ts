import type { TSESLint } from '@typescript-eslint/utils';

import { rules } from '../rules/index.js';

const PLUGIN_NAME = 'awesome-nest';

export function buildRecommended(
  plugin: TSESLint.FlatConfig.Plugin,
): TSESLint.FlatConfig.ConfigArray {
  return [
    {
      name: `${PLUGIN_NAME}/recommended`,
      plugins: { [PLUGIN_NAME]: plugin },
      rules: {
        [`${PLUGIN_NAME}/no-typeorm-finder-methods`]: 'error',
        [`${PLUGIN_NAME}/payload-type-suffix`]: 'error',
      },
    },
    {
      name: `${PLUGIN_NAME}/recommended-dto`,
      files: ['**/*.dto.ts', '**/dto/**/*.ts'],
      rules: {
        [`${PLUGIN_NAME}/dto-must-extend-abstract-or-base`]: 'error',
      },
    },
  ];
}

export const recommendedRuleNames = Object.keys(rules);
