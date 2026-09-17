import { ConflictException, HttpException } from '@nestjs/common';
import { GraphQLError } from 'graphql';
import { formatGraphQLError } from './format-graphql-error';

function wrapped(error: Error): GraphQLError {
  return new GraphQLError(error.message, {
    originalError: new GraphQLError(error.message, { originalError: error }),
  });
}

describe('formatGraphQLError', () => {
  it('preserves a nested conflict as a safe GraphQL conflict', () => {
    const error = wrapped(new ConflictException('Identifier unavailable.'));

    expect(formatGraphQLError(error.toJSON(), error)).toEqual({
      message: 'Identifier unavailable.',
      extensions: { code: 'CONFLICT', statusCode: 409 },
    });
  });

  it('maps rate limiting to a stable GraphQL code', () => {
    const error = wrapped(new HttpException('Try again later.', 429));

    expect(formatGraphQLError(error.toJSON(), error)).toEqual({
      message: 'Try again later.',
      extensions: { code: 'TOO_MANY_REQUESTS', statusCode: 429 },
    });
  });
});
