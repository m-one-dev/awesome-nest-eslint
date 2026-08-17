import { Injectable } from './nest-shims.js';

@Injectable()
export class FactoryInjectService {
  value(): string {
    return 'factory-inject';
  }
}
