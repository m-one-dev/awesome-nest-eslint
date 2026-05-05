import { Injectable, MessagePattern } from './nest-shims.js';

@Injectable()
export class MessagePatternService {
  @MessagePattern('foo.bar')
  handle(): void {}
}
