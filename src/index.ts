import type { TSESLint } from '@typescript-eslint/utils';

import pkg from '../package.json' with { type: 'json' };
import { buildAll } from './configs/all.js';
import { buildRecommended } from './configs/recommended.js';
import { rules } from './rules/index.js';

const PLUGIN_NAME = 'awesome-nest';

interface AwesomeNestPlugin extends TSESLint.FlatConfig.Plugin {
  meta: { name: string; version: string };
  rules: typeof rules;
  configs: {
    recommended: TSESLint.FlatConfig.ConfigArray;
    all: TSESLint.FlatConfig.ConfigArray;
  };
}

const plugin = {
  meta: { name: PLUGIN_NAME, version: pkg.version },
  rules,
} as unknown as AwesomeNestPlugin;

plugin.configs = {
  recommended: buildRecommended(plugin),
  all: buildAll(plugin),
};

export default plugin;
export { rules };
export type { AwesomeNestPlugin };
