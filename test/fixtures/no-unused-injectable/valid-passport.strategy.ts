import { Injectable, PassportStrategy } from './nest-shims.js';

@Injectable()
export class JwtStrategy extends PassportStrategy {
  validate(): void {}
}
