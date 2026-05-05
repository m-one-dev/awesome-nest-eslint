import { Injectable } from './nest-shims.js';

@Injectable()
export class OnlyModuleService {
  unused(): string {
    return 'only-module';
  }
}
