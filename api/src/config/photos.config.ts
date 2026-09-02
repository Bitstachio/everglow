import { registerAs } from "@nestjs/config";
import { FREE_TIER_STORAGE_LIMIT_BYTES } from "src/photos/photos.constants";

const parsePositiveBigInt = (value: string | undefined, fallback: bigint): bigint => {
  if (!value) return fallback;
  try {
    const parsed = BigInt(value);
    return parsed > 0n ? parsed : fallback;
  } catch {
    return fallback;
  }
};

export default registerAs("photos", () => ({
  storageLimitBytes: parsePositiveBigInt(
    process.env.PHOTO_STORAGE_LIMIT_BYTES,
    FREE_TIER_STORAGE_LIMIT_BYTES,
  ),
}));
