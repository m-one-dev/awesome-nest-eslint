export function Injectable(_opts?: unknown): ClassDecorator {
  return () => {};
}
export function Module(_meta: unknown): ClassDecorator {
  return () => {};
}
export function Inject(_token?: unknown): ParameterDecorator & PropertyDecorator {
  return () => {};
}
export function MessagePattern(_pattern?: unknown): MethodDecorator {
  return () => {};
}
export function EventPattern(_pattern?: unknown): MethodDecorator {
  return () => {};
}
export function SubscribeMessage(_event?: unknown): MethodDecorator {
  return () => {};
}
export function Cron(_expr?: unknown): MethodDecorator {
  return () => {};
}
export function Interval(_ms?: unknown): MethodDecorator {
  return () => {};
}
export function Timeout(_ms?: unknown): MethodDecorator {
  return () => {};
}
export function Sse(_path?: string): MethodDecorator {
  return () => {};
}
export function Get(_path?: string): MethodDecorator {
  return () => {};
}
export function Post(_path?: string): MethodDecorator {
  return () => {};
}
export function Catch(..._exceptions: unknown[]): ClassDecorator {
  return () => {};
}
export function WebSocketGateway(_meta?: unknown): ClassDecorator {
  return () => {};
}
export function forwardRef<T>(_fn: () => T): T {
  return undefined as unknown as T;
}

export interface OnModuleInit {
  onModuleInit(): void | Promise<void>;
}
export interface OnModuleDestroy {
  onModuleDestroy(): void | Promise<void>;
}
export interface OnApplicationBootstrap {
  onApplicationBootstrap(): void | Promise<void>;
}

export class PassportStrategy {}
export class BaseExceptionFilter {}
