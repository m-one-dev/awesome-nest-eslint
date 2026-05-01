import { dtoMustExtendAbstractOrBase } from './dto-must-extend-abstract-or-base.js';
import { noDtoDirectInstantiation } from './no-dto-direct-instantiation.js';
import { noTypeormFinderMethods } from './no-typeorm-finder-methods.js';
import { payloadTypeSuffix } from './payload-type-suffix.js';
import { preferPromiseAll } from './prefer-promise-all.js';
import { requireUseDtoDecorator } from './require-use-dto-decorator.js';
import { uniqueEndpointDtos } from './unique-endpoint-dtos.js';

export const rules = {
  'dto-must-extend-abstract-or-base': dtoMustExtendAbstractOrBase,
  'no-dto-direct-instantiation': noDtoDirectInstantiation,
  'no-typeorm-finder-methods': noTypeormFinderMethods,
  'payload-type-suffix': payloadTypeSuffix,
  'prefer-promise-all': preferPromiseAll,
  'require-use-dto-decorator': requireUseDtoDecorator,
  'unique-endpoint-dtos': uniqueEndpointDtos,
} as const;

export type RuleName = keyof typeof rules;
