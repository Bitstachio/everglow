import { HttpException } from "@nestjs/common";
import type { ApiErrorCode } from "./api-error-codes";

export class ApiException extends HttpException {
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super({ code, message }, status);
    this.code = code;
  }
}
