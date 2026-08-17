/*
 * Custom schema loader for graphql-codegen. Reference it from a consumer
 * repo's codegen config as
 * `schema: { [url]: { loader: './kausal_common/configs/codegen-schema-loader.cjs' } }`.
 *
 * Backends running graphql-core >= 3.2.10 advertise directive locations from
 * newer GraphQL spec drafts (e.g. `@deprecated ... on DIRECTIVE_DEFINITION`)
 * that the graphql-js version pinned here cannot parse when codegen re-prints
 * the schema as SDL. Locations unknown to graphql-js are dropped from the
 * introspection result before building the schema; they only affect where
 * directives may be attached, which codegen output never depends on.
 */
const { buildClientSchema, getIntrospectionQuery, DirectiveLocation } = require('graphql');

const KNOWN_DIRECTIVE_LOCATIONS = new Set(Object.values(DirectiveLocation));

module.exports = async function loadSchema(url) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ query: getIntrospectionQuery() }),
  });
  if (!response.ok) {
    throw new Error(`Introspection of ${url} failed: HTTP ${response.status}`);
  }
  const { data, errors } = await response.json();
  if (!data || errors?.length) {
    throw new Error(`Introspection of ${url} failed: ${JSON.stringify(errors)}`);
  }
  for (const directive of data.__schema.directives) {
    directive.locations = directive.locations.filter((location) =>
      KNOWN_DIRECTIVE_LOCATIONS.has(location)
    );
  }
  return buildClientSchema(data);
};
