import { Injectable } from './nest-shims.js';

@Injectable()
export class UseExistingService {
  value(): string {
    return 'use-existing';
  }
}
