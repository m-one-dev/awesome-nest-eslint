import type { TSESLint } from '@typescript-eslint/utils';

import { rules } from '../rules/index.js';

const PLUGIN_NAME = 'awesome-nest';

export function buildAll(
  plugin: TSESLint.FlatConfig.Plugin,
): TSESLint.FlatConfig.ConfigArray {
  return [
    {
      name: `${PLUGIN_NAME}/all`,
      plugins: { [PLUGIN_NAME]: plugin },
      rules: Object.fromEntries(
        Object.keys(rules).map((name) => [`${PLUGIN_NAME}/${name}`, 'error']),
      ),
    },
  ];
}
