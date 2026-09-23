export class PolicyViolationError extends Error {
  readonly statusCode = 403;

  constructor(readonly code: string) {
    super('Action forbidden.');
    this.name = 'PolicyViolationError';
  }
}
