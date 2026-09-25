import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { buildImageS3Key, IMAGE_ORPHAN_MIN_AGE_MS } from "src/images/images.constants";
import { PrismaService } from "src/prisma/prisma.service";
import { OrphanSourceRegistry } from "src/storage/orphan-source.registry";
import { UserAvatarOrphanSource } from "./user-avatar-orphan-source";
import { USER_AVATAR_S3_KEY_PREFIX } from "./users.constants";

describe("UserAvatarOrphanSource", () => {
  let source: UserAvatarOrphanSource;
  let prisma: DeepMockProxy<PrismaClient>;
  let registry: OrphanSourceRegistry;

  const userId = "11111111-1111-1111-1111-111111111111";
  const referencedKey = buildImageS3Key(USER_AVATAR_S3_KEY_PREFIX, userId, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  const abandonedKey = buildImageS3Key(USER_AVATAR_S3_KEY_PREFIX, userId, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    registry = new OrphanSourceRegistry();
    source = new UserAvatarOrphanSource(registry, prisma as unknown as PrismaService);
  });

  it("registers the avatars/ prefix with the image minimum age", () => {
    source.onModuleInit();

    expect(registry.getAll()).toEqual([source]);
    expect(source.prefix).toBe("avatars/");
    expect(source.minObjectAgeMs).toBe(IMAGE_ORPHAN_MIN_AGE_MS);
  });

  it("owns avatar keys and nothing else", () => {
    expect(source.isOwnedKey(referencedKey)).toBe(true);
    expect(source.isOwnedKey(`photos/${userId}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`)).toBe(false);
    expect(source.isOwnedKey("avatars/README.txt")).toBe(false);
  });

  it("resolves a page of keys with one query against the profiles", async () => {
    prisma.userDetails.findMany.mockResolvedValue([{ avatarS3Key: referencedKey }] as never);

    await expect(source.findReferencedKeys([referencedKey, abandonedKey])).resolves.toEqual([referencedKey]);

    expect(prisma.userDetails.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.userDetails.findMany).toHaveBeenCalledWith({
      where: { avatarS3Key: { in: [referencedKey, abandonedKey] } },
      select: { avatarS3Key: true },
    });
  });
});
