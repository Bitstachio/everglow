import { getSchemaPath } from "@nestjs/swagger";
import { ApiErrorDto, API_ERROR_SCHEMA_REF } from "./api-error.dto";
import { API_ERROR_CODES } from "./api-error-codes";

describe("ApiErrorDto", () => {
  it("resolves to the shared components schema path used by rate-limit docs", () => {
    expect(getSchemaPath(ApiErrorDto)).toBe("#/components/schemas/ApiErrorDto");
    expect(API_ERROR_SCHEMA_REF).toBe("#/components/schemas/ApiErrorDto");
  });

  it("documents code with the closed API_ERROR_CODES enum", () => {
    const codeMeta = Reflect.getMetadata("swagger/apiModelProperties", ApiErrorDto.prototype, "code") as
      | { enum?: readonly string[] }
      | undefined;

    expect(codeMeta?.enum).toEqual([...API_ERROR_CODES]);
  });
});
