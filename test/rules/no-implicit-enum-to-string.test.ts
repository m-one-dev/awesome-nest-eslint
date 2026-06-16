import * as path from 'node:path';
import { RuleTester } from '@typescript-eslint/rule-tester';

import { noImplicitEnumToString } from '../../src/rules/no-implicit-enum-to-string.js';

const fixturesDir = path.resolve(import.meta.dirname, '..', 'fixtures');

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

// Shared preamble fragments kept inline per-case so each snippet is a
// self-contained, type-checkable module.

ruleTester.run('no-implicit-enum-to-string', noImplicitEnumToString, {
  valid: [
    {
      name: 'valid: sink typed as the enum itself',
      code: `
        enum A { name = 'name' }
        function takesEnum(x: A) {}
        takesEnum(A.name);
      `,
    },
    {
      name: 'valid: sink typed as unknown',
      code: `
        enum A { name = 'name' }
        function takesUnknown(x: unknown) {}
        takesUnknown(A.name);
      `,
    },
    {
      name: 'valid: sink typed as any',
      code: `
        enum A { name = 'name' }
        function takesAny(x: any) {}
        takesAny(A.name);
      `,
    },
    {
      name: 'valid: explicit String() conversion',
      code: `
        enum A { name = 'name' }
        function getName(x: string) {}
        getName(String(A.name));
      `,
    },
    {
      name: 'valid: template literal interpolation',
      code: `
        enum A { name = 'name' }
        function getName(x: string) {}
        getName(\`\${A.name}\`);
      `,
    },
    {
      name: 'valid: explicit .toString()',
      code: `
        enum A { name = 'name' }
        function getName(x: string) {}
        getName(A.name.toString());
      `,
    },
    {
      name: 'valid: plain string-literal union is not an enum',
      code: `
        type Plain = 'a' | 'b';
        function getName(x: string) {}
        declare const lit: Plain;
        getName(lit);
      `,
    },
    {
      name: 'valid: numeric enum to a number sink',
      code: `
        enum N { a, b }
        function takesNum(x: number) {}
        takesNum(N.a);
      `,
    },
    {
      name: 'valid: equality comparison against a string is not a sink',
      code: `
        enum A { name = 'name' }
        declare const s: string;
        const eq = s === A.name;
      `,
    },
    {
      name: 'valid: switch/case against a string is not a sink',
      code: `
        enum A { name = 'name' }
        declare const s: string;
        switch (s) { case A.name: break; }
      `,
    },
    {
      name: 'valid: string concatenation is not a sink',
      code: `
        enum A { name = 'name' }
        declare const s: string;
        const out = s + A.name;
      `,
    },
    {
      name: 'valid: returning an enum member from an enum-typed function',
      code: `
        enum A { name = 'name' }
        function makeA(): A { return A.name; }
      `,
    },
    {
      name: 'valid: enum value assigned to an enum-typed variable',
      code: `
        enum A { name = 'name' }
        const a: A = A.name;
      `,
    },
    {
      name: 'valid: passing a plain string variable',
      code: `
        function getName(x: string) {}
        declare const s: string;
        getName(s);
      `,
    },
  ],

  invalid: [
    {
      name: 'invalid: call argument',
      code: `
        enum A { name = 'name' }
        function getName(x: string) {}
        getName(A.name);
      `,
      errors: [
        { messageId: 'implicitEnumToString', data: { enumType: 'A' } },
      ],
    },
    {
      name: 'invalid: method argument',
      code: `
        enum A { name = 'name' }
        class Svc { setName(x: string) {} }
        declare const svc: Svc;
        svc.setName(A.name);
      `,
      errors: [{ messageId: 'implicitEnumToString' }],
    },
    {
      name: 'invalid: constructor argument',
      code: `
        enum A { name = 'name' }
        class Greeter { constructor(x: string) {} }
        new Greeter(A.name);
      `,
      errors: [{ messageId: 'implicitEnumToString' }],
    },
    {
      name: 'invalid: decorator-factory argument',
      code: `
        enum A { name = 'name' }
        function Cls(x: string) { return (_t: unknown) => {}; }
        @Cls(A.name)
        class Foo {}
      `,
      errors: [{ messageId: 'implicitEnumToString' }],
    },
    {
      name: 'invalid: variable type annotation',
      code: `
        enum A { name = 'name' }
        const y: string = A.name;
      `,
      errors: [{ messageId: 'implicitEnumToString' }],
    },
    {
      name: 'invalid: return position',
      code: `
        enum A { name = 'name' }
        function ret(): string { return A.name; }
      `,
      errors: [{ messageId: 'implicitEnumToString' }],
    },
    {
      name: 'invalid: arrow expression-body return',
      code: `
        enum A { name = 'name' }
        const ret = (): string => A.name;
      `,
      errors: [{ messageId: 'implicitEnumToString' }],
    },
    {
      name: 'invalid: assignment to a string variable',
      code: `
        enum A { name = 'name' }
        let s: string;
        s = A.name;
      `,
      errors: [{ messageId: 'implicitEnumToString' }],
    },
    {
      name: 'invalid: object-literal property typed string',
      code: `
        enum A { name = 'name' }
        const obj: { k: string } = { k: A.name };
      `,
      errors: [{ messageId: 'implicitEnumToString' }],
    },
    {
      name: 'invalid: array element typed string',
      code: `
        enum A { name = 'name' }
        const arr: string[] = [A.name];
      `,
      errors: [{ messageId: 'implicitEnumToString' }],
    },
    {
      name: 'invalid: string | undefined sink',
      code: `
        enum A { name = 'name' }
        function takesOpt(x: string | undefined) {}
        takesOpt(A.name);
      `,
      errors: [{ messageId: 'implicitEnumToString' }],
    },
    {
      name: 'invalid: default parameter value',
      code: `
        enum A { name = 'name' }
        function withDefault(x: string = A.name) {}
      `,
      errors: [{ messageId: 'implicitEnumToString' }],
    },
    {
      name: 'invalid: ternary branch into a string sink',
      code: `
        enum A { name = 'name' }
        declare const cond: boolean;
        const t: string = cond ? A.name : 'x';
      `,
      errors: [{ messageId: 'implicitEnumToString' }],
    },
    {
      name: 'invalid: indirect variable holding an enum member',
      code: `
        enum A { name = 'name' }
        function getName(x: string) {}
        const v = A.name;
        getName(v);
      `,
      errors: [{ messageId: 'implicitEnumToString' }],
    },
    {
      name: 'invalid: forwarded enum-typed parameter',
      code: `
        enum A { name = 'name' }
        function getName(x: string) {}
        function fwd(v: A) { getName(v); }
      `,
      errors: [{ messageId: 'implicitEnumToString' }],
    },
    {
      name: 'invalid: string member of a mixed enum',
      code: `
        enum M { a = 1, b = 'b' }
        function getName(x: string) {}
        getName(M.b);
      `,
      errors: [
        { messageId: 'implicitEnumToString', data: { enumType: 'M.b' } },
      ],
    },
    {
      name: 'invalid: const enum member',
      code: `
        const enum C { x = 'x' }
        function getName(x: string) {}
        getName(C.x);
      `,
      errors: [{ messageId: 'implicitEnumToString' }],
    },
    {
      name: 'invalid: enum-returning call assigned to a string',
      code: `
        enum A { name = 'name' }
        function makeA(): A { return A.name; }
        const z: string = makeA();
      `,
      errors: [{ messageId: 'implicitEnumToString' }],
    },
  ],
});
