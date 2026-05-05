import { Inject, Injectable } from './nest-shims.js';
import { PropertyInjectedService } from './valid-property-inject.service.js';

@Injectable()
export class PropertyInjectConsumer {
  @Inject(PropertyInjectedService)
  private readonly svc!: PropertyInjectedService;

  use(): string {
    return this.svc.greet();
  }
}
