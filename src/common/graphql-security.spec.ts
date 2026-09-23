import { buildSchema, parse, validate } from 'graphql';
import { createGraphqlSecurityRule } from './graphql-security';

const schema = buildSchema(`
  type User { id: ID!, friend: User }
  type Query { user: User }
`);

describe('createGraphqlSecurityRule', () => {
  const rule = createGraphqlSecurityRule({
    maxDepth: 3,
    maxFields: 5,
    maxAliases: 2,
    maxComplexity: 50,
  });

  it('rejects expensive repeated collection fields', () => {
    const strictRule = createGraphqlSecurityRule({
      maxDepth: 10,
      maxFields: 100,
      maxAliases: 20,
      maxComplexity: 15,
    });
    const document = parse('{ first:user { id } second:user { id } }');
    expect(validate(schema, document, [strictRule])).toHaveLength(0);

    const expensiveSchema = buildSchema('type Query { searchMusic: String }');
    expect(
      validate(expensiveSchema, parse('{ searchMusic }'), [strictRule])[0]
        ?.message,
    ).toContain('query complexity');
  });

  it('accepts an ordinary operation', () => {
    expect(validate(schema, parse('{ user { id } }'), [rule])).toHaveLength(0);
  });

  it('rejects excessive depth including fragment spreads', () => {
    const document = parse(`
      query { user { ...DeepUser } }
      fragment DeepUser on User { friend { friend { id } } }
    `);
    expect(validate(schema, document, [rule])[0]?.message).toContain(
      'query depth',
    );
  });

  it('rejects excessive aliases and fields', () => {
    const aliases = parse('{ a:user { id } b:user { id } c:user { id } }');
    expect(validate(schema, aliases, [rule])[0]?.message).toContain(
      'field count',
    );
    expect(validate(schema, aliases, [rule])[1]?.message).toContain(
      'alias count',
    );
  });
});
