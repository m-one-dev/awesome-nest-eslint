import { Module } from './nest-shims.js';
import { InjectedConsumerService } from './valid-injected.consumer.js';
import { InjectedService } from './valid-injected.service.js';

@Module({
  providers: [InjectedService, InjectedConsumerService],
  exports: [InjectedConsumerService],
})
export class InjectedModule {}
