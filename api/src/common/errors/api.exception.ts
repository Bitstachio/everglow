import { HttpException } from "@nestjs/common";
import {
  API_ERROR_REGISTRY,
  resolveApiErrorMessage,
  type ApiErrorCode,
  type ApiErrorParams,
} from "./api-error-codes";

export class ApiException extends HttpException {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, params: ApiErrorParams = {}) {
    const { status } = API_ERROR_REGISTRY[code];
    const message = resolveApiErrorMessage(code, params);
    super({ code, message }, status);
    this.code = code;
  }
}
