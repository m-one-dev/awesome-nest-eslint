import { dtoMustExtendAbstractOrBase } from './dto-must-extend-abstract-or-base.js';
import { noTypeormFinderMethods } from './no-typeorm-finder-methods.js';
import { payloadTypeSuffix } from './payload-type-suffix.js';
import { uniqueEndpointDtos } from './unique-endpoint-dtos.js';

export const rules = {
  'dto-must-extend-abstract-or-base': dtoMustExtendAbstractOrBase,
  'no-typeorm-finder-methods': noTypeormFinderMethods,
  'payload-type-suffix': payloadTypeSuffix,
  'unique-endpoint-dtos': uniqueEndpointDtos,
} as const;

export type RuleName = keyof typeof rules;
