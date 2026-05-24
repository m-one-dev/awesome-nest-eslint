import { NotificationClientService } from '../../lib/src/notification-client.service.js';
import { Injectable } from './nest-shims.js';

@Injectable()
export class ShareContactHandler {
  constructor(
    private readonly notificationClientService: NotificationClientService,
  ) {}

  execute(message: string): string {
    return this.notificationClientService.notify(message);
  }
}
