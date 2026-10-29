import { PrismaClient } from "generated/prisma/client";
import { mockDeep } from "jest-mock-extended";
import { PrismaService } from "src/prisma/prisma.service";
import { OrphanSourceRegistry } from "src/storage/orphan-source.registry";
import { PhotoDerivativeOrphanSource } from "./photo-derivative-orphan-source";

const original =
  "photos/11111111-1111-1111-1111-111111111111/66666666-6666-6666-6666-666666666666/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const thumb = `derived/${original}/thumb.webp`;
const large = `derived/${original}/large.jpg`;

describe("PhotoDerivativeOrphanSource", () => {
  const prisma = mockDeep<PrismaClient>();
  const registry = new OrphanSourceRegistry();
  const source = new PhotoDerivativeOrphanSource(prisma as unknown as PrismaService, registry);

  beforeEach(() => jest.clearAllMocks());

  it("registers a separate prefix for derivative cleanup", () => {
    source.onModuleInit();
    expect(registry.getAll()).toContain(source);
    expect(source.prefix).toBe("derived/photos/");
  });

  it("owns both current and legacy renditions, but no other objects", () => {
    expect(source.isOwnedKey(thumb)).toBe(true);
    expect(source.isOwnedKey(large)).toBe(true);
    expect(source.isOwnedKey(thumb.replace("11111111-1111-1111-1111-111111111111/", ""))).toBe(true);
    for (const key of [
      original,
      `${thumb}/extra`,
      `derived/${original}/other.jpg`,
      "derived/photos/manual-test/thumb.webp",
    ]) {
      expect(source.isOwnedKey(key)).toBe(false);
    }
  });

  it("keeps both renditions of a referenced original with one deduplicated lookup", async () => {
    prisma.photo.findMany.mockResolvedValue([{ s3Key: original }] as never);
    await expect(source.findReferencedKeys([thumb, large])).resolves.toEqual([thumb, large]);
    expect(prisma.photo.findMany).toHaveBeenCalledWith({
      where: { s3Key: { in: [original] } },
      select: { s3Key: true },
    });
    expect(prisma.photo.findMany).toHaveBeenCalledTimes(1);
  });

  it("releases both copies after the photo row is removed", async () => {
    prisma.photo.findMany.mockResolvedValue([]);
    await expect(source.findReferencedKeys([thumb, large])).resolves.toEqual([]);
  });

  it("ignores unrecognized keys without a database query", async () => {
    await expect(source.findReferencedKeys(["derived/README.txt"])).resolves.toEqual([]);
    expect(prisma.photo.findMany).not.toHaveBeenCalled();
  });
});
