import { Injectable, type OnModuleInit } from './nest-shims.js';

@Injectable()
export class LifecycleService implements OnModuleInit {
  onModuleInit(): void {}
}
