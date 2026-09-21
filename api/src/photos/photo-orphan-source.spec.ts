import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PrismaService } from "src/prisma/prisma.service";
import { OrphanSource, OrphanSourceRegistry } from "src/storage/orphan-source.registry";
import { PhotoOrphanSource } from "./photo-orphan-source";
import { buildPhotoS3Key, PHOTO_S3_KEY_PREFIX } from "./photos.constants";

describe("PhotoOrphanSource", () => {
  let source: PhotoOrphanSource;
  let prisma: DeepMockProxy<PrismaClient>;
  let registry: OrphanSourceRegistry;

  const userId = "11111111-1111-1111-1111-111111111111";
  const eventId = "66666666-6666-6666-6666-666666666666";
  const photoId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const currentKey = buildPhotoS3Key(userId, eventId, photoId);
  const legacyKey = `${PHOTO_S3_KEY_PREFIX}${eventId}/${photoId}`;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    registry = new OrphanSourceRegistry();
    source = new PhotoOrphanSource(prisma as unknown as PrismaService, registry);
  });

  it("registers the photos/ prefix on module init, with no minimum age of its own", () => {
    source.onModuleInit();

    expect(registry.getAll()).toEqual([source]);
    expect(source.prefix).toBe(PHOTO_S3_KEY_PREFIX);
    // A Photo row exists before its object can, so "no row" is enough.
    expect((source as OrphanSource).minObjectAgeMs).toBeUndefined();
  });

  it("owns the current and the legacy photo key layouts", () => {
    expect(source.isOwnedKey(currentKey)).toBe(true);
    expect(source.isOwnedKey(legacyKey)).toBe(true);
  });

  it.each([
    `${PHOTO_S3_KEY_PREFIX}README.txt`,
    `${PHOTO_S3_KEY_PREFIX}${userId}`,
    `${currentKey}/extra`,
    `${PHOTO_S3_KEY_PREFIX}${userId}/${eventId}/not-a-uuid`,
    `avatars/${userId}/${photoId}`,
  ])("does not own %p", (key) => {
    expect(source.isOwnedKey(key)).toBe(false);
  });

  it("resolves a page of keys with one query, whatever the rows' status", async () => {
    prisma.photo.findMany.mockResolvedValue([{ s3Key: currentKey }] as never);

    await expect(source.findReferencedKeys([currentKey, legacyKey])).resolves.toEqual([currentKey]);

    expect(prisma.photo.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.photo.findMany).toHaveBeenCalledWith({
      where: { s3Key: { in: [currentKey, legacyKey] } },
      select: { s3Key: true },
    });
  });
});
