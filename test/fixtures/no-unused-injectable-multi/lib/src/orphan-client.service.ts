import { AbstractClientService } from './abstract-client.service.js';
import { Injectable } from './nest-shims.js';

@Injectable()
export class OrphanClientService extends AbstractClientService<string> {
  ping(): string {
    return 'orphan';
  }
}
