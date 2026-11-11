/**
 * Confirm's refusal of a second copy of a photo, against a real Postgres: the
 * advisory lock and the READY lookup every other suite mocks. Two confirms of
 * the same bytes by the same person, at the same time, must leave one frame.
 * Opt-in, and not in CI:
 *
 *   DB_TEST_DATABASE_URL=postgresql://…/everglow_dbtest pnpm run test:db
 *
 * Point it at a database with every migration applied (prisma migrate deploy).
 * It creates its own users and events and deletes them afterwards. S3 is a
 * stub: each original hashes to whatever the test says.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "crypto";
import { AccessLevel, PhotoStatus, PrismaClient } from "generated/prisma/client";
import { AbilityFactory } from "src/casl/ability.factory";
import { buildPhotoS3Key } from "src/photos/photos.constants";
import { PhotosService } from "src/photos/photos.service";

const url = process.env.DB_TEST_DATABASE_URL;
const SUB_PREFIX = "dbtest-copies|";

if (!url) {
  console.warn("Skipped the photo copies suite: set DB_TEST_DATABASE_URL to a migrated Postgres database to run it.");
}
const describeDb = url ? describe : describe.skip;

const newClient = () => new PrismaClient({ adapter: new PrismaPg({ connectionString: url as string }) });
const quietLogger = () => ({
  setContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
});

/** Stands in for S3: every object is there as declared, and hashing takes a moment so confirms overlap. */
const fakeS3 = (hashOf: (key: string) => string, delayMs = 50) => ({
  headObject: jest.fn(() => Promise.resolve({ exists: true, contentType: "image/jpeg", sizeBytes: 1024 })),
  sha256OfObject: jest.fn(async (key: string) => {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return hashOf(key);
  }),
  deleteObjects: jest.fn((keys: string[]) => Promise.resolve({ deleted: keys, failed: [] })),
});

/**
 * The client with a pause before each READY flip, so two confirms that both
 * looked for copies before either flipped would both flip: what the lock
 * prevents.
 */
const slowFlips = (client: PrismaClient) =>
  client.$extends({
    query: {
      photo: {
        async updateMany({ args, query }) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return query(args);
        },
      },
    },
  });

const serviceOn = (client: PrismaClient, s3: ReturnType<typeof fakeS3>) =>
  new PhotosService(
    slowFlips(client) as never,
    new AbilityFactory(client as never),
    s3 as never,
    {} as never,
    {} as never,
    { discardImages: jest.fn() } as never,
    {
      findRemovedImages: jest.fn(() => Promise.resolve(new Map())),
      removeCopies: jest.fn(() => Promise.resolve([])),
    } as never,
    quietLogger() as never,
  );

describeDb("photo copies against Postgres", () => {
  const a = newClient();
  const b = newClient();
  const sameBytes = "c0".repeat(32);
  let eventId: string;
  let userId: string;
  let otherUserId: string;

  const createMember = async (eventIdForAccess: string) => {
    const id = randomUUID();
    await a.user.create({
      data: {
        id,
        providerSub: `${SUB_PREFIX}${id}`,
        details: { create: { username: `copies${id.slice(0, 8)}`, name: "Copies" } },
      },
    });
    await a.eventAccess.create({
      data: { userId: id, eventId: eventIdForAccess, accessLevel: AccessLevel.PARTICIPANT },
    });
    return id;
  };

  const pendingPhoto = async (addedById: string) => {
    const id = randomUUID();
    await a.photo.create({
      data: {
        id,
        eventId,
        addedById,
        s3Key: buildPhotoS3Key(eventId, id),
        contentType: "image/jpeg",
        sizeBytes: 1024,
        status: PhotoStatus.PENDING,
      },
    });
    return id;
  };

  const rows = (ids: string[]) =>
    a.photo.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, sha256: true } });

  beforeAll(async () => {
    const plan = await a.plan.findFirstOrThrow({ where: { code: "FREE" }, orderBy: { version: "desc" } });
    eventId = randomUUID();
    await a.event.create({
      data: {
        id: eventId,
        title: "Copies",
        date: new Date(),
        invitationUrl: `dbtest-copies-${eventId}`,
        planId: plan.id,
        galleryOpensAt: new Date(),
      },
    });
    userId = await createMember(eventId);
    otherUserId = await createMember(eventId);
  });

  afterAll(async () => {
    await a.event.deleteMany({ where: { id: eventId } });
    await a.user.deleteMany({ where: { providerSub: { startsWith: SUB_PREFIX } } });
    await Promise.all([a.$disconnect(), b.$disconnect()]);
  });

  afterEach(async () => {
    await a.photo.deleteMany({ where: { eventId } });
  });

  it("leaves one frame when two confirms of the same bytes run at once", async () => {
    const [first, second] = [await pendingPhoto(userId), await pendingPhoto(userId)];
    const s3 = fakeS3(() => sameBytes);

    const [left, right] = await Promise.all([
      serviceOn(a, s3).confirmUploads(eventId, userId, [first]),
      serviceOn(b, s3).confirmUploads(eventId, userId, [second]),
    ]);

    const verdicts = [...left, ...right];
    const kept = verdicts.find((result) => result.status === "READY");
    const copy = verdicts.find((result) => result.status === "DUPLICATE");
    expect(kept).toBeDefined();
    expect(copy?.existingPhotoId).toBe(kept?.photoId);
    // The copy's row is gone, and its slot with it; the kept one is READY with its hash.
    expect(await rows([first, second])).toEqual([{ id: kept?.photoId, status: "READY", sha256: sameBytes }]);
    expect(s3.deleteObjects).toHaveBeenCalledTimes(1);
    expect(s3.deleteObjects.mock.calls[0][0][0]).toBe(buildPhotoS3Key(eventId, copy?.photoId as string));
  });

  it("never discards a photo that a concurrent confirm of an overlapping request made READY", async () => {
    const [first, second] = [await pendingPhoto(userId), await pendingPhoto(userId)];
    const s3 = fakeS3(() => sameBytes);

    await Promise.all([
      serviceOn(a, s3).confirmUploads(eventId, userId, [second]),
      serviceOn(b, s3).confirmUploads(eventId, userId, [first, second]),
      serviceOn(a, s3).confirmUploads(eventId, userId, [first]),
    ]);

    const left = await rows([first, second]);
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ status: "READY", sha256: sameBytes });
    // Only the discarded copy's object was deleted, never the one on the roll.
    const deletedOriginals = s3.deleteObjects.mock.calls.map(([keys]) => keys[0]);
    expect(deletedOriginals).not.toContain(buildPhotoS3Key(eventId, left[0].id));
  });

  it("keeps a photo confirmed twice at once", async () => {
    const photoId = await pendingPhoto(userId);
    const s3 = fakeS3(() => sameBytes);

    const [left, right] = await Promise.all([
      serviceOn(a, s3).confirmUploads(eventId, userId, [photoId]),
      serviceOn(b, s3).confirmUploads(eventId, userId, [photoId]),
    ]);

    expect([...left, ...right]).toEqual([
      { photoId, status: "READY" },
      { photoId, status: "READY" },
    ]);
    expect(await rows([photoId])).toEqual([{ id: photoId, status: "READY", sha256: sameBytes }]);
    expect(s3.deleteObjects).not.toHaveBeenCalled();
  });

  it("lets another member add the same bytes", async () => {
    const mine = await pendingPhoto(userId);
    const theirs = await pendingPhoto(otherUserId);
    const s3 = fakeS3(() => sameBytes);

    await serviceOn(a, s3).confirmUploads(eventId, userId, [mine]);
    const results = await serviceOn(b, s3).confirmUploads(eventId, otherUserId, [theirs]);

    expect(results).toEqual([{ photoId: theirs, status: "READY" }]);
    expect(await rows([mine, theirs])).toHaveLength(2);
  });

  it("lets the same bytes back on after the photo was deleted", async () => {
    const before = await pendingPhoto(userId);
    const s3 = fakeS3(() => sameBytes);
    await serviceOn(a, s3).confirmUploads(eventId, userId, [before]);
    await a.photo.delete({ where: { id: before } });

    const again = await pendingPhoto(userId);
    const results = await serviceOn(a, s3).confirmUploads(eventId, userId, [again]);

    expect(results).toEqual([{ photoId: again, status: "READY" }]);
  });

  it("doesn't count a READY photo without a hash", async () => {
    const unhashed = await pendingPhoto(userId);
    await a.photo.update({ where: { id: unhashed }, data: { status: PhotoStatus.READY } });
    const photoId = await pendingPhoto(userId);

    const results = await serviceOn(
      a,
      fakeS3(() => sameBytes),
    ).confirmUploads(eventId, userId, [photoId]);

    expect(results).toEqual([{ photoId, status: "READY" }]);
  });
});
