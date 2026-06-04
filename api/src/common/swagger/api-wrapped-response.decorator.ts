import { Type, applyDecorators } from "@nestjs/common";
import { ApiCreatedResponse, ApiExtraModels, ApiOkResponse, getSchemaPath } from "@nestjs/swagger";
import { ResponseMetaDto } from "./response-meta.dto";

function wrappedResponseSchema(model: Type<unknown>) {
  return {
    type: "object",
    required: ["data", "meta"],
    properties: {
      data: { $ref: getSchemaPath(model) },
      meta: { $ref: getSchemaPath(ResponseMetaDto) },
    },
  };
}

export const ApiWrappedResponse = <TModel extends Type<unknown>>(
  model: TModel,
  description?: string,
  status: 200 | 201 = 200,
) => {
  const responseDecorator = status === 201 ? ApiCreatedResponse : ApiOkResponse;

  return applyDecorators(
    ApiExtraModels(model, ResponseMetaDto),
    responseDecorator({
      description,
      schema: wrappedResponseSchema(model),
    }),
  );
};
