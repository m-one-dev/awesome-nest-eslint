import { Module, SOME_TOKEN } from './nest-shims.js';
import { FactoryInjectService } from './valid-factory-inject.service.js';

// The factory parameter is deliberately structurally typed: `inject: [...]` must
// be the only reference to the class in this file, or the test would pass on the
// strength of a type annotation instead of the behaviour under test.
@Module({
  providers: [
    {
      provide: SOME_TOKEN,
      useFactory: (dep: { value(): string }): string => dep.value(),
      inject: [FactoryInjectService],
    },
  ],
})
export class FactoryInjectModule {}
