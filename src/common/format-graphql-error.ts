import type { GraphQLFormattedError } from 'graphql';
import { HttpException, Logger } from '@nestjs/common';

const logger = new Logger('GraphQLFormatError');

const SAFE_GENERIC = 'Something went wrong. Please try again later.';

function isHttpException(error: unknown): error is HttpException {
  return error instanceof HttpException;
}

function getOriginalException(error: unknown): unknown {
  if (
    typeof error === 'object' &&
    error !== null &&
    'originalError' in error
  ) {
    return (error as { originalError: unknown }).originalError;
  }
  return error;
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
      return {
        message,
        extensions: {
          code: original.getStatus(),
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
