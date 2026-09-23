import type { GraphQLFormattedError } from 'graphql';
import { HttpException, Logger } from '@nestjs/common';
import { errorDetails, isDebugEnabled } from './debug';
import { PolicyViolationError } from '../policies/policy-violation.error';

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
    case 400:
    case 422:
      return 'BAD_USER_INPUT';
    case 401:
      return 'UNAUTHENTICATED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'TOO_MANY_REQUESTS';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    default:
      return status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST';
  }
}

function responseCode(response: unknown): string | undefined {
  if (
    typeof response === 'object' &&
    response !== null &&
    'code' in response &&
    typeof response.code === 'string'
  ) {
    return response.code;
  }
  return undefined;
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

  if (original instanceof PolicyViolationError) {
    return {
      message: original.message,
      extensions: {
        code: original.code,
        statusCode: original.statusCode,
      },
    };
  }

  if (isDebugEnabled()) {
    const event = JSON.stringify({
      event: 'graphql.request_failed',
      message: formattedError.message,
      path: formattedError.path,
      code: formattedError.extensions?.code,
      statusCode: isHttpException(original) ? original.getStatus() : undefined,
    });
    if (isHttpException(original) && original.getStatus() < 500) {
      logger.warn(event);
    } else {
      logger.error(event, errorDetails(original));
    }
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
          code: responseCode(response) ?? graphQLCode(status),
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
