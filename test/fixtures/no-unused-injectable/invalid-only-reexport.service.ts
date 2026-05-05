import { Injectable } from './nest-shims.js';

@Injectable()
export class OnlyReexportService {
  unused(): string {
    return 'reexport';
  }
}
