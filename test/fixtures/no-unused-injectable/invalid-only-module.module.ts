import { Module } from './nest-shims.js';
import { OnlyModuleService } from './invalid-only-module.service.js';

@Module({
  providers: [OnlyModuleService],
  exports: [OnlyModuleService],
})
export class OnlyModuleModule {}
