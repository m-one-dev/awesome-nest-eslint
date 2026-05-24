import * as fs from 'node:fs';
import * as path from 'node:path';
import { RuleTester } from '@typescript-eslint/rule-tester';

import { noUnusedInjectable } from '../../src/rules/no-unused-injectable.js';

const fixturesDir = path.resolve(import.meta.dirname, '..', 'fixtures');
const ruleFixturesDir = path.join(fixturesDir, 'no-unused-injectable');
const multiFixturesDir = path.join(
  fixturesDir,
  'no-unused-injectable-multi',
);
const multiWorkspaceTsconfig = path.join(multiFixturesDir, 'tsconfig.json');
const multiLibDir = path.join(multiFixturesDir, 'lib');

function readFixture(name: string): { filename: string; code: string } {
  const filename = path.join(ruleFixturesDir, name);
  return { filename, code: fs.readFileSync(filename, 'utf8') };
}

function readMultiLibFixture(
  name: string,
): { filename: string; code: string } {
  const filename = path.join(multiLibDir, 'src', name);
  return { filename, code: fs.readFileSync(filename, 'utf8') };
}

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      projectService: {
        allowDefaultProject: ['*.ts', '*.tsx'],
        defaultProject: 'tsconfig.json',
      },
      tsconfigRootDir: fixturesDir,
    },
  },
});

// Forces the per-file parserServices.program to be the lib-only tsconfig,
// reproducing the cross-project bug condition: lib's program does not see
// consumers under consumer/src.
const multiLibLanguageOptions = {
  parserOptions: {
    projectService: {
      allowDefaultProject: ['*.ts', '*.tsx'],
      defaultProject: 'tsconfig.json',
    },
    tsconfigRootDir: multiLibDir,
  },
};

ruleTester.run('no-unused-injectable', noUnusedInjectable, {
  valid: [
    {
      name: 'valid: service injected via constructor in another file',
      ...readFixture('valid-injected.service.ts'),
    },
    {
      name: 'valid: @MessagePattern method on class is exempt',
      ...readFixture('valid-message-pattern.service.ts'),
    },
    {
      name: 'valid: @Cron method on class is exempt',
      ...readFixture('valid-cron.service.ts'),
    },
    {
      name: 'valid: implements OnModuleInit is exempt',
      ...readFixture('valid-lifecycle.service.ts'),
    },
    {
      name: 'valid: @Catch class decorator is exempt',
      ...readFixture('valid-catch.filter.ts'),
    },
    {
      name: 'valid: extends PassportStrategy is exempt',
      ...readFixture('valid-passport.strategy.ts'),
    },
    {
      name: 'valid: service consumed via @Inject property injection',
      ...readFixture('valid-property-inject.service.ts'),
    },
    {
      name: 'valid: class without @Injectable is out of scope',
      ...readFixture('valid-no-decorator.ts'),
    },
    {
      name: 'valid: configurable exemptDecorators allows custom framework decorator',
      ...readFixture('valid-custom-decorator.service.ts'),
      options: [{ exemptDecorators: ['JobHandler'] }],
    },
    {
      name: 'valid: service injected from a different tsconfig project (cross-project regression)',
      ...readMultiLibFixture('notification-client.service.ts'),
      languageOptions: multiLibLanguageOptions,
      options: [{ workspaceTsconfigPath: multiWorkspaceTsconfig }],
    },
  ],
  invalid: [
    {
      name: 'invalid: @Injectable() never referenced anywhere',
      ...readFixture('invalid-orphan.service.ts'),
      errors: [
        { messageId: 'unusedInjectable', data: { className: 'OrphanService' } },
      ],
    },
    {
      name: 'invalid: @Injectable() only registered in @Module providers',
      ...readFixture('invalid-only-module.service.ts'),
      errors: [
        {
          messageId: 'unusedInjectable',
          data: { className: 'OnlyModuleService' },
        },
      ],
    },
    {
      name: 'invalid: @Injectable() only re-exported, never injected',
      ...readFixture('invalid-only-reexport.service.ts'),
      errors: [
        {
          messageId: 'unusedInjectable',
          data: { className: 'OnlyReexportService' },
        },
      ],
    },
    {
      name: 'invalid: @Injectable() only listed in a top-level Provider[] var spread into @Module providers',
      ...readFixture('invalid-providers-array-var.service.ts'),
      errors: [
        {
          messageId: 'unusedInjectable',
          data: { className: 'ProvidersArrayVarService' },
        },
      ],
    },
    {
      name: 'invalid: orphan service in workspace with multiple tsconfig projects (cross-project regression)',
      ...readMultiLibFixture('orphan-client.service.ts'),
      languageOptions: multiLibLanguageOptions,
      options: [{ workspaceTsconfigPath: multiWorkspaceTsconfig }],
      errors: [
        {
          messageId: 'unusedInjectable',
          data: { className: 'OrphanClientService' },
        },
      ],
    },
  ],
});
