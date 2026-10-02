export type ApiErrorParams = Record<string, unknown>;

export type ApiErrorDefinition = {
  status: number;
  message: string | ((params: ApiErrorParams) => string);
};
