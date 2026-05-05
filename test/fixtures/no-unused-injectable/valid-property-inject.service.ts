import { Injectable } from './nest-shims.js';

@Injectable()
export class PropertyInjectedService {
  greet(): string {
    return 'hi';
  }
}
