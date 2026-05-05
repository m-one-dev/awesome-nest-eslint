import { Injectable } from './nest-shims.js';

@Injectable()
export class InjectedService {
  ping(): string {
    return 'pong';
  }
}
