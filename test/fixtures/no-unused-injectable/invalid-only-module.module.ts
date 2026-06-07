import { OnlyModuleService } from './invalid-only-module.service.js';
import { Module } from './nest-shims.js';

@Module({
  providers: [OnlyModuleService],
  exports: [OnlyModuleService],
})
export class OnlyModuleModule {}
