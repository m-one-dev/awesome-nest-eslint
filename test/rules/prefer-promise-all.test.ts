import '../setup.js';

import { RuleTester } from '@typescript-eslint/rule-tester';

import { preferPromiseAll } from '../../src/rules/prefer-promise-all.js';

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
});

ruleTester.run('prefer-promise-all', preferPromiseAll, {
  valid: [
    {
      name: 'single await — no group',
      code: `async function f() { const a = await serviceA.get(); }`,
    },
    {
      name: 'dependent awaits — second uses first result',
      code: `async function f() {
        const a = await serviceA.get();
        const b = await serviceB.get(a);
      }`,
    },
    {
      name: 'dependent awaits — second uses first result in object',
      code: `async function f() {
        const user = await getUser();
        const token = await createToken({ userId: user.id });
      }`,
    },
    {
      name: 'let declaration — not flagged',
      code: `async function f() {
        let a = await serviceA.get();
        let b = await serviceB.get();
      }`,
    },
    {
      name: 'intermediate statement references first binding — stops group',
      code: `async function f() {
        const a = await serviceA.get();
        console.info(a);
        const b = await serviceB.get();
      }`,
    },
    {
      name: 'if condition references group binding — stops group',
      code: `async function f() {
        const a = await serviceA.get();
        if (a) { doSomething(); }
        const b = await serviceB.get();
      }`,
    },
    {
      name: 'multi-declarator statement — not eligible',
      code: `async function f() {
        const a = await serviceA.get(), x = 1;
        const b = await serviceB.get();
      }`,
    },
    {
      name: 'non-await init — not eligible',
      code: `async function f() {
        const a = serviceA.getSync();
        const b = serviceB.getSync();
      }`,
    },
  ],
  invalid: [
    {
      name: 'two consecutive independent awaits — auto-fixed',
      code: `async function f() {
        const a = await serviceA.get();
        const b = await serviceB.get();
      }`,
      errors: [{ messageId: 'preferPromiseAll', data: { count: '2' } }],
      output: `async function f() {
        const [a, b] = await Promise.all([serviceA.get(), serviceB.get()]);
      }`,
    },
    {
      name: 'three consecutive independent awaits — auto-fixed',
      code: `async function f() {
        const a = await serviceA.get();
        const b = await serviceB.get();
        const c = await serviceC.get();
      }`,
      errors: [{ messageId: 'preferPromiseAll', data: { count: '3' } }],
      output: `async function f() {
        const [a, b, c] = await Promise.all([serviceA.get(), serviceB.get(), serviceC.get()]);
      }`,
    },
    {
      name: 'independent awaits with non-referencing intermediate — report only, no fix',
      code: `async function f() {
        const a = await serviceA.get();
        console.info('loading');
        const b = await serviceB.get();
      }`,
      errors: [{ messageId: 'preferPromiseAll', data: { count: '2' } }],
      output: null,
    },
    {
      name: 'group splits when third await depends on second',
      code: `async function f() {
        const a = await serviceA.get();
        const b = await serviceB.get();
        const c = await serviceC.get(b);
      }`,
      errors: [{ messageId: 'preferPromiseAll', data: { count: '2' } }],
      output: `async function f() {
        const [a, b] = await Promise.all([serviceA.get(), serviceB.get()]);
        const c = await serviceC.get(b);
      }`,
    },
    {
      name: 'destructuring patterns — report without fix',
      code: `async function f() {
        const { x } = await serviceA.get();
        const b = await serviceB.get();
      }`,
      errors: [{ messageId: 'preferPromiseAll', data: { count: '2' } }],
      output: null,
    },
    {
      name: 'intermediate references first but not second — closes then new group',
      code: `async function f() {
        const a = await serviceA.get();
        const b = await serviceB.get();
        const c = await serviceC.get();
        console.info(a);
        const d = await serviceD.get();
        const e = await serviceE.get();
      }`,
      errors: [
        { messageId: 'preferPromiseAll', data: { count: '3' } },
        { messageId: 'preferPromiseAll', data: { count: '2' } },
      ],
      output: `async function f() {
        const [a, b, c] = await Promise.all([serviceA.get(), serviceB.get(), serviceC.get()]);
        console.info(a);
        const [d, e] = await Promise.all([serviceD.get(), serviceE.get()]);
      }`,
    },
  ],
});
