import { ProvideTokenOnlyImpl } from './invalid-provide-token-only.impl.js';
import { ProvideTokenOnlyService } from './invalid-provide-token-only.service.js';
import { Module } from './nest-shims.js';

// `provide:` names the injection token, it does not consume the class. Nothing
// ever injects ProvideTokenOnlyService, so it stays unused.
@Module({
  providers: [
    {
      provide: ProvideTokenOnlyService,
      useClass: ProvideTokenOnlyImpl,
    },
  ],
})
export class ProvideTokenOnlyModule {}
