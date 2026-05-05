import { Injectable } from './nest-shims.js';
import { InjectedService } from './valid-injected.service.js';

@Injectable()
export class InjectedConsumerService {
  constructor(private readonly injected: InjectedService) {}

  call(): string {
    return this.injected.ping();
  }
}
