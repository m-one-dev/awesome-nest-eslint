import { dtoMustExtendAbstractOrBase } from './dto-must-extend-abstract-or-base.js';
import { noDtoDirectInstantiation } from './no-dto-direct-instantiation.js';
import { noTypeormFinderMethods } from './no-typeorm-finder-methods.js';
import { noUnusedInjectable } from './no-unused-injectable.js';
import { payloadTypeSuffix } from './payload-type-suffix.js';
import { preferPromiseAll } from './prefer-promise-all.js';
import { requireUseDtoDecorator } from './require-use-dto-decorator.js';
import { uniqueEndpointDtos } from './unique-endpoint-dtos.js';
import { uuidFieldNaming } from './uuid-field-naming.js';

export const rules = {
  'dto-must-extend-abstract-or-base': dtoMustExtendAbstractOrBase,
  'no-dto-direct-instantiation': noDtoDirectInstantiation,
  'no-typeorm-finder-methods': noTypeormFinderMethods,
  'no-unused-injectable': noUnusedInjectable,
  'payload-type-suffix': payloadTypeSuffix,
  'prefer-promise-all': preferPromiseAll,
  'require-use-dto-decorator': requireUseDtoDecorator,
  'unique-endpoint-dtos': uniqueEndpointDtos,
  'uuid-field-naming': uuidFieldNaming,
} as const;

export type RuleName = keyof typeof rules;
