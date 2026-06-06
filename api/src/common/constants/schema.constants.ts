/**
 * Database column length constraints.
 * These constants ensure consistency across the Prisma schema and DTOs.
 */
export const STRING_LIMITS = {
  // Concise metadata, codes, and identifiers
  STRICT: 50,
  // The professional and industry-standard length for general-purpose strings
  // Aligned with RFC standards for emails (254) and optimized for 1-byte length prefix storage in modern SQL engines
  STANDARD: 255,
  // Reserved for high-capacity strings such as cloud storage keys (S3),absolute URLs, and extended web identifiers
  LONG: 2048,
} as const;
