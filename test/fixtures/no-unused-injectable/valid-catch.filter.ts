import { Catch, Injectable } from './nest-shims.js';

class HttpException {}

@Catch(HttpException)
@Injectable()
export class HttpExceptionFilter {
  catch(): void {}
}
