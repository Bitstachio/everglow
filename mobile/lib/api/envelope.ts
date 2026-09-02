import type { ResponseMetaDto } from "./generated";

/** Matches the NestJS ResponseInterceptor envelope ({ data, meta }). */
export type ApiEnvelope<T> = {
  data: T;
  meta: ResponseMetaDto;
};

export const unwrapEnvelope = <T>(body: ApiEnvelope<T>): T => body.data;
