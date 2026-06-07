import type { TSESLint } from '@typescript-eslint/utils';

import type { RuleName } from '../rules/index.js';
import { rules } from '../rules/index.js';
import { controllerFilesConfig, globalRuleOptions } from './rule-options.js';

const PLUGIN_NAME = 'awesome-nest';

export function buildAll(plugin: TSESLint.FlatConfig.Plugin): TSESLint.FlatConfig.ConfigArray {
  return [
    {
      name: `${PLUGIN_NAME}/all`,
      plugins: { [PLUGIN_NAME]: plugin },
      rules: Object.fromEntries(
        Object.keys(rules).map((name) => {
          const opts = globalRuleOptions[name as RuleName];
          const ruleId = `${PLUGIN_NAME}/${name}`;

          return [ruleId, opts ? ['error', ...opts] : 'error'];
        }),
      ),
    },
    {
      name: `${PLUGIN_NAME}/all-controller`,
      files: [...controllerFilesConfig.files],
      ignores: [...controllerFilesConfig.ignores],
      rules: Object.fromEntries(
        Object.entries(controllerFilesConfig.ruleOptions).map(([name, opts]) => [`${PLUGIN_NAME}/${name}`, ['error', ...opts]]),
      ),
    },
  ];
}
