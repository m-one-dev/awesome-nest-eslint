import * as fs from 'node:fs';
import * as path from 'node:path';
import { RuleTester } from '@typescript-eslint/rule-tester';

import { noUnusedInjectable } from '../../src/rules/no-unused-injectable.js';

const fixturesDir = path.resolve(import.meta.dirname, '..', 'fixtures');
const ruleFixturesDir = path.join(fixturesDir, 'no-unused-injectable');

function readFixture(name: string): { filename: string; code: string } {
  const filename = path.join(ruleFixturesDir, name);
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
  ],
});
