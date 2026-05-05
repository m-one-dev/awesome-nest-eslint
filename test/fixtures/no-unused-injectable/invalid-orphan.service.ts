import { Injectable } from './nest-shims.js';

@Injectable()
export class OrphanService {
  unused(): string {
    return 'orphan';
  }
}
