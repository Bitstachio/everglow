import type { components } from "./schema";

/** Matches the NestJS ResponseInterceptor envelope ({ data, meta }). */
export type ApiEnvelope<T> = {
  data: T;
  meta: components["schemas"]["ResponseMetaDto"];
};

export const unwrapEnvelope = <T>(body: ApiEnvelope<T>): T => body.data;
