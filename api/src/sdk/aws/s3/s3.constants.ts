export const S3_SERVICE_ERRORS = {
  BUCKET_NOT_CONFIGURED: () => "AWS S3 bucket is not configured",
  PUT_FAILED: (key: string) => `Failed to upload object to S3 at key "${key}"`,
  DELETE_FAILED: (key: string) => `Failed to delete object from S3 at key "${key}"`,
  PRESIGN_FAILED: (key: string) => `Failed to generate presigned URL for key "${key}"`,
  CREDENTIALS_NOT_CONFIGURED: () => "AWS credentials are not configured",
};

export const DEFAULT_PRESIGNED_URL_TTL_SECONDS = 900;
