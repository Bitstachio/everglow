import { HttpException } from "@nestjs/common";
import {
  API_ERROR_REGISTRY,
  resolveApiErrorMessage,
  type ApiErrorArgs,
  type ApiErrorCode,
} from "./api-error-codes";

export class ApiException<C extends ApiErrorCode = ApiErrorCode> extends HttpException {
  readonly code: C;

  constructor(code: C, ...params: ApiErrorArgs<C>) {
    const { status } = API_ERROR_REGISTRY[code];
    const message = resolveApiErrorMessage(code, ...params);
    super({ code, message }, status);
    this.code = code;
  }
}
