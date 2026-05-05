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
        [`${PLUGIN_NAME}/unique-endpoint-dtos`]: 'error',
        [`${PLUGIN_NAME}/uuid-field-naming`]: 'error',
        [`${PLUGIN_NAME}/no-unused-injectable`]: 'error',
        [`${PLUGIN_NAME}/prefer-promise-all`]: 'warn',
      },
    },
    {
      name: `${PLUGIN_NAME}/recommended-no-dto-direct-instantiation`,
      ignores: [
        '**/*.spec.ts',
        '**/*.e2e-spec.ts',
        '**/test/**',
        'libs/common-module/src/services/abstract-client.service.ts',
      ],
      rules: {
        [`${PLUGIN_NAME}/no-dto-direct-instantiation`]: 'error',
      },
    },
    {
      name: `${PLUGIN_NAME}/recommended-dto`,
      files: ['**/*.dto.ts', '**/dto/**/*.ts'],
      rules: {
        [`${PLUGIN_NAME}/dto-must-extend-abstract-or-base`]: 'error',
      },
    },
    {
      name: `${PLUGIN_NAME}/recommended-entity`,
      files: ['**/*.entity.ts', '**/entities/**/*.ts'],
      ignores: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/test/**'],
      rules: {
        [`${PLUGIN_NAME}/require-use-dto-decorator`]: 'error',
      },
    },
  ];
}

export const recommendedRuleNames = Object.keys(rules);
