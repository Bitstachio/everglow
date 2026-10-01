import { ApiProperty, ApiPropertyOptional, getSchemaPath } from "@nestjs/swagger";
import { ResponseMetaDto } from "src/common/swagger/response-meta.dto";
import { API_ERROR_CODES, type ApiErrorCode } from "./api-error-codes";

/**
 * Shared HTTP error envelope. `AllExceptionsFilter` writes this shape at
 * runtime; `@nestjs/swagger` publishes it as `#/components/schemas/ApiErrorDto`
 * via `extraModels` in `createOpenApiDocument`. Rate-limit documentation
 * references it for 429 and does not own the fields or the `code` enum.
 */
export class ApiErrorDto {
  @ApiPropertyOptional({ type: String })
  message?: string;

  @ApiPropertyOptional({
    enum: API_ERROR_CODES,
    description: "Stable machine-readable error code, when the error has one",
  })
  code?: ApiErrorCode;

  @ApiProperty({ type: () => ResponseMetaDto })
  meta: ResponseMetaDto;
}

export const API_ERROR_SCHEMA_REF = getSchemaPath(ApiErrorDto);
