import { Injectable } from './nest-shims.js';

function JobHandler(_job: string): MethodDecorator {
  return () => {};
}

@Injectable()
export class CustomDecoratorService {
  @JobHandler('do-thing')
  run(): void {}
}
