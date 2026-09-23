import { HttpException, HttpStatus } from '@nestjs/common';

export class ApplicationException extends HttpException {
  constructor(code: string, message: string, status: HttpStatus) {
    super({ code, message }, status);
  }
}

export class ExternalServiceException extends ApplicationException {
  constructor(code: string, message: string) {
    super(code, message, HttpStatus.BAD_GATEWAY);
  }
}
