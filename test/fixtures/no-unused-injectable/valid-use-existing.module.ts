import { Module, SOME_TOKEN } from './nest-shims.js';
import { UseExistingService } from './valid-use-existing.service.js';

@Module({
  providers: [
    {
      provide: SOME_TOKEN,
      useExisting: UseExistingService,
    },
  ],
})
export class UseExistingModule {}
