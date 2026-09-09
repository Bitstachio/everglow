export const S3_SERVICE_ERRORS = {
  BUCKET_NOT_CONFIGURED: () => "AWS S3 bucket is not configured",
  PUT_FAILED: (key: string) => `Failed to upload object to S3 at key "${key}"`,
  DELETE_FAILED: (key: string) => `Failed to delete object from S3 at key "${key}"`,
  DELETE_BATCH_FAILED: (count: number) => `Failed to delete a batch of ${count} objects from S3`,
  HEAD_FAILED: (key: string) => `Failed to fetch object metadata from S3 at key "${key}"`,
  LIST_FAILED: (prefix: string) => `Failed to list objects in S3 under prefix "${prefix}"`,
  PRESIGN_FAILED: (key: string) => `Failed to generate presigned URL for key "${key}"`,
  CREDENTIALS_NOT_CONFIGURED: () => "AWS credentials are not configured",
};

export const DEFAULT_PRESIGNED_URL_TTL_SECONDS = 900;

// S3 DeleteObjects accepts at most this many keys per request.
export const MAX_DELETE_OBJECTS_BATCH_SIZE = 1000;
