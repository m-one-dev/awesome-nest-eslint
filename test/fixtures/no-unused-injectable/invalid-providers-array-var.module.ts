import { Module } from './nest-shims.js';
import { ProvidersArrayVarService } from './invalid-providers-array-var.service.js';

type Provider = unknown;

const handlers: Provider[] = [ProvidersArrayVarService];

@Module({
  providers: [...handlers],
})
export class ProvidersArrayVarModule {}
