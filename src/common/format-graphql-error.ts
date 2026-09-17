import type { GraphQLFormattedError } from 'graphql';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { errorDetails, isDebugEnabled } from './debug';

const logger = new Logger('GraphQLFormatError');

const SAFE_GENERIC = 'Something went wrong. Please try again later.';

function isHttpException(error: unknown): error is HttpException {
  return error instanceof HttpException;
}

function getOriginalException(error: unknown): unknown {
  let current = error;
  const visited = new Set<object>();
  while (
    typeof current === 'object' &&
    current !== null &&
    !visited.has(current) &&
    'originalError' in current &&
    current.originalError
  ) {
    visited.add(current);
    current = current.originalError;
  }
  return current;
}

function graphQLCode(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
    case HttpStatus.UNPROCESSABLE_ENTITY:
      return 'BAD_USER_INPUT';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHENTICATED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'TOO_MANY_REQUESTS';
    case HttpStatus.SERVICE_UNAVAILABLE:
      return 'SERVICE_UNAVAILABLE';
    default:
      return status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST';
  }
}

function looksLikeInternalMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('prisma') ||
    lower.includes('invocation') ||
    lower.includes('table ') ||
    lower.includes('column ') ||
    lower.includes('database') ||
    lower.includes('sql') ||
    lower.includes('schema') ||
    lower.includes('public.') ||
    lower.includes('select ') ||
    lower.includes('insert ') ||
    lower.includes('econnrefused') ||
    lower.includes('node_modules') ||
    message.includes('`') ||
    message.length > 180
  );
}

/**
 * Strips internal / Prisma details from GraphQL responses.
 * Nest HttpException messages that are intentional stay (auth, conflict).
 */
export function formatGraphQLError(
  formattedError: GraphQLFormattedError,
  error: unknown,
): GraphQLFormattedError {
  const original = getOriginalException(error);

  if (isDebugEnabled()) {
    logger.error(
      JSON.stringify({
        event: 'graphql.request_failed',
        message: formattedError.message,
        path: formattedError.path,
        code: formattedError.extensions?.code,
      }),
      errorDetails(original),
    );
  }

  if (isHttpException(original)) {
    const response = original.getResponse();
    const message =
      typeof response === 'string'
        ? response
        : typeof response === 'object' &&
            response !== null &&
            'message' in response
          ? Array.isArray((response as { message: string | string[] }).message)
            ? (response as { message: string[] }).message.join(', ')
            : String((response as { message: string }).message)
          : original.message;

    if (!looksLikeInternalMessage(message)) {
      const status = original.getStatus();
      return {
        message,
        extensions: {
          code: graphQLCode(status),
          statusCode: status,
        },
      };
    }
  }

  const rawMessage = formattedError.message ?? '';
  if (!looksLikeInternalMessage(rawMessage) && rawMessage.length <= 120) {
    return {
      message: rawMessage,
      extensions: {
        code: formattedError.extensions?.code ?? 'BAD_REQUEST',
      },
    };
  }

  logger.error(`GraphQL internal error: ${rawMessage}`);

  return {
    message: SAFE_GENERIC,
    extensions: {
      code: 'INTERNAL_SERVER_ERROR',
    },
  };
}
