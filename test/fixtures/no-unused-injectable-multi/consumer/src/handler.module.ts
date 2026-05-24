import { Module } from './nest-shims.js';
import { ShareContactHandler } from './handler.js';

@Module({
  providers: [ShareContactHandler],
  exports: [ShareContactHandler],
})
export class HandlerModule {}
