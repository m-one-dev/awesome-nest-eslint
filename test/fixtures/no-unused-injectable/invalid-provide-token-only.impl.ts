import { Injectable } from './nest-shims.js';

@Injectable()
export class ProvideTokenOnlyImpl {
  unused(): string {
    return 'provide-token-only-impl';
  }
}
