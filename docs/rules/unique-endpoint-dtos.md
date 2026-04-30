# `awesome-nest/unique-endpoint-dtos`

Each NestJS endpoint slot — `@Body()`, `@Query()`, and the response (return type
or Swagger `@ApiResponse({ type })`) — must use a DTO class that is not used in
any other endpoint slot anywhere in the project.

## Rationale

When the same DTO is reused across endpoints (e.g. `UserDto` as both
`POST /users` body and `GET /users/:id` response), the wire contracts of those
endpoints become coupled. A field added to satisfy one endpoint's needs leaks
into the other's payload, OpenAPI schemas collapse to ambiguous shapes, and
refactors carry hidden blast radius. Forcing every endpoint slot to have its own
dedicated DTO keeps each contract independently evolvable.

## What is checked

For every method on a class decorated with `@Controller(...)` that itself
carries an HTTP verb decorator (`@Get`, `@Post`, `@Put`, `@Patch`, `@Delete`,
`@Options`, `@Head`, `@All`):

- the type of any `@Body()` parameter,
- the type of any `@Query()` parameter,
- the method's return type (with `Promise<T>`, `Observable<T>`, `Array<T>`, etc.
  unwrapped), and
- the `type` field of any Swagger response decorator (`@ApiResponse`,
  `@ApiOkResponse`, `@ApiCreatedResponse`, ...).

Bare `@Body('field')` / `@Query('name')` reads of a single primitive are
ignored — the DTO is not the parameter type in that case.

By default, only types whose name ends with `Dto` are tracked.

## Examples

### Incorrect

```ts
@Controller('foo')
class FooController {
  @Post()
  create(@Body() dto: FooDto): FooResponseDto {}

  @Get(':id')
  // FooDto already used as @Body above
  fetch(): FooDto {}
}
```

```ts
@Controller('foo')
class FooController {
  @Post()
  create(@Body() dto: CreateFooDto): FooResponseDto {}

  @Get()
  @ApiOkResponse({ type: CreateFooDto }) // duplicate
  list() {}
}
```

### Correct

```ts
@Controller('foo')
class FooController {
  @Post()
  create(@Body() dto: CreateFooDto): CreateFooResponseDto {}

  @Get(':id')
  fetch(): FooDetailsResponseDto {}

  @Get()
  list(@Query() q: ListFooQueryDto): ListFooResponseDto {}
}
```

## Options

```ts
type Options = {
  suffixes?: string[];                   // default: ['Dto']
  responseWrappers?: string[];           // default: ['Promise', 'Observable', 'Array', 'ReadonlyArray', 'PageDto', 'PageOptionsDto']
  swaggerResponseDecorators?: string[];  // default: ['ApiResponse', 'ApiOkResponse', 'ApiCreatedResponse', 'ApiAcceptedResponse', 'ApiDefaultResponse', 'ApiNoContentResponse']
};
```

- `suffixes` — names that don't end in one of these are ignored. Broaden it if
  your project uses other conventions (e.g. `['Dto', 'Schema']`).
- `responseWrappers` — generic types whose first type argument is unwrapped when
  detecting the underlying DTO of a response.
- `swaggerResponseDecorators` — decorator names whose `{ type }` option is
  inspected for the response DTO.

## Cross-file behavior and limitations

The rule tracks DTO usages in module-level state so duplicates across files in
the same project are caught when ESLint runs over the whole project (e.g.
`eslint .` in CI). When ESLint runs in `--cache` mode, in IDE single-file mode,
or under parallel workers, files may be linted in isolation; in those modes the
rule will only catch duplicates within a single file. Run a full project lint
to enforce the rule end-to-end.

DTO identity uses the class's *declaration source file* plus its name, so two
unrelated `FooDto` classes declared in different modules are correctly treated
as distinct.

## When not to use

If your project intentionally reuses DTOs across endpoints (for example, a
read-then-update CRUD pattern that returns the same shape it accepts), or if
you maintain shared library DTOs reused across services, this rule will produce
false positives. Disable it or scope it to specific paths.
