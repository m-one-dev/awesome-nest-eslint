import { APP_INTERCEPTOR, Module } from './nest-shims.js';
import { UseClassInterceptor } from './valid-use-class.interceptor.js';

@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: UseClassInterceptor,
    },
  ],
})
export class UseClassModule {}
