import { Cron, Injectable } from './nest-shims.js';

@Injectable()
export class CronService {
  @Cron('0 * * * *')
  run(): void {}
}
