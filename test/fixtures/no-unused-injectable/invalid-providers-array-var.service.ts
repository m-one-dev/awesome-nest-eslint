import { Injectable } from './nest-shims.js';

@Injectable()
export class ProvidersArrayVarService {
  unused(): string {
    return 'providers-array-var';
  }
}
