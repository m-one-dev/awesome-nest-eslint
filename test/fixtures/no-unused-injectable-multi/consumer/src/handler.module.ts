import { ShareContactHandler } from './handler.js';
import { Module } from './nest-shims.js';

@Module({
  providers: [ShareContactHandler],
  exports: [ShareContactHandler],
})
export class HandlerModule {}
