import { AbstractClientService } from './abstract-client.service.js';
import { Injectable } from './nest-shims.js';

@Injectable()
export class NotificationClientService extends AbstractClientService<string> {
  notify(message: string): string {
    return message;
  }
}
