import { Injectable } from './nest-shims.js';

@Injectable()
export class UseClassInterceptor {
  intercept(): string {
    return 'use-class';
  }
}
