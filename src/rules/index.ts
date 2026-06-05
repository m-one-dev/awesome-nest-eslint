import { dtoDecoratorOptionalityMustMatchType } from './dto-decorator-optionality-must-match-type.js';
import { dtoMustExtendAbstractOrBase } from './dto-must-extend-abstract-or-base.js';
import { maxTypeormJoins } from './max-typeorm-joins.js';
import { noApiPropertyDecorator } from './no-api-property-decorator.js';
import { noBuiltinExceptionInstantiation } from './no-builtin-exception-instantiation.js';
import { noDoubleCastLaundering } from './no-double-cast-laundering.js';
import { noDtoDirectInstantiation } from './no-dto-direct-instantiation.js';
import { noDuplicateModuleEntries } from './no-duplicate-module-entries.js';
import { noTypeormFinderMethods } from './no-typeorm-finder-methods.js';
import { noUnusedInjectable } from './no-unused-injectable.js';
import { payloadTypeSuffix } from './payload-type-suffix.js';
import { preferPromiseAll } from './prefer-promise-all.js';
import { preferRawTerminalOnSelect } from './prefer-raw-terminal-on-select.js';
import { requireApiEndpointDocs } from './require-api-endpoint-docs.js';
import { requireClientActionOnNatsPattern } from './require-client-action-on-nats-pattern.js';
import { requireObjectLiteralAnchor } from './require-object-literal-anchor.js';
import { requireUseDtoDecorator } from './require-use-dto-decorator.js';
import { swaggerMatchesReturnType } from './swagger-matches-return-type.js';
import { uniqueEndpointDtos } from './unique-endpoint-dtos.js';
import { uuidFieldNaming } from './uuid-field-naming.js';

export const rules = {
  'dto-decorator-optionality-must-match-type':
    dtoDecoratorOptionalityMustMatchType,
  'dto-must-extend-abstract-or-base': dtoMustExtendAbstractOrBase,
  'max-typeorm-joins': maxTypeormJoins,
  'no-api-property-decorator': noApiPropertyDecorator,
  'no-builtin-exception-instantiation': noBuiltinExceptionInstantiation,
  'no-double-cast-laundering': noDoubleCastLaundering,
  'no-dto-direct-instantiation': noDtoDirectInstantiation,
  'no-duplicate-module-entries': noDuplicateModuleEntries,
  'no-typeorm-finder-methods': noTypeormFinderMethods,
  'no-unused-injectable': noUnusedInjectable,
  'payload-type-suffix': payloadTypeSuffix,
  'prefer-promise-all': preferPromiseAll,
  'prefer-raw-terminal-on-select': preferRawTerminalOnSelect,
  'require-api-endpoint-docs': requireApiEndpointDocs,
  'require-client-action-on-nats-pattern': requireClientActionOnNatsPattern,
  'require-object-literal-anchor': requireObjectLiteralAnchor,
  'require-use-dto-decorator': requireUseDtoDecorator,
  'swagger-matches-return-type': swaggerMatchesReturnType,
  'unique-endpoint-dtos': uniqueEndpointDtos,
  'uuid-field-naming': uuidFieldNaming,
} as const;

export type RuleName = keyof typeof rules;
