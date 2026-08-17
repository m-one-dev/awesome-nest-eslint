import { Injectable } from './nest-shims.js';

@Injectable()
export class ProvideTokenOnlyService {
  unused(): string {
    return 'provide-token-only';
  }
}
