import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { buildImageS3Key, IMAGE_ORPHAN_MIN_AGE_MS } from "src/images/images.constants";
import { PrismaService } from "src/prisma/prisma.service";
import { OrphanSourceRegistry } from "src/storage/orphan-source.registry";
import { EventCoverOrphanSource } from "./event-cover-orphan-source";
import { EVENT_COVER_S3_KEY_PREFIX } from "./events.constants";

describe("EventCoverOrphanSource", () => {
  let source: EventCoverOrphanSource;
  let prisma: DeepMockProxy<PrismaClient>;
  let registry: OrphanSourceRegistry;

  const eventId = "66666666-6666-6666-6666-666666666666";
  const referencedKey = buildImageS3Key(EVENT_COVER_S3_KEY_PREFIX, eventId, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  const abandonedKey = buildImageS3Key(EVENT_COVER_S3_KEY_PREFIX, eventId, "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    registry = new OrphanSourceRegistry();
    source = new EventCoverOrphanSource(registry, prisma as unknown as PrismaService);
  });

  it("registers the event-covers/ prefix with the image minimum age", () => {
    source.onModuleInit();

    expect(registry.getAll()).toEqual([source]);
    expect(source.prefix).toBe("event-covers/");
    expect(source.minObjectAgeMs).toBe(IMAGE_ORPHAN_MIN_AGE_MS);
  });

  it("owns event cover keys and nothing else", () => {
    expect(source.isOwnedKey(referencedKey)).toBe(true);
    expect(source.isOwnedKey(`photos/${eventId}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`)).toBe(false);
    expect(source.isOwnedKey(`avatars/${eventId}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`)).toBe(false);
    expect(source.isOwnedKey("event-covers/README.txt")).toBe(false);
  });

  it("resolves a page of keys with one query against the events", async () => {
    prisma.event.findMany.mockResolvedValue([{ coverS3Key: referencedKey }] as never);

    await expect(source.findReferencedKeys([referencedKey, abandonedKey])).resolves.toEqual([referencedKey]);

    expect(prisma.event.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.event.findMany).toHaveBeenCalledWith({
      where: { coverS3Key: { in: [referencedKey, abandonedKey] } },
      select: { coverS3Key: true },
    });
  });
});
