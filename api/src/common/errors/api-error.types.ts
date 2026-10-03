export type ApiErrorDefinition = {
  status: number;
  message: string | ((params: never) => string);
};
