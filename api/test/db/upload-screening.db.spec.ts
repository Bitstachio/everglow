/**
 * Upload screening's SQL against a real Postgres (docs/moderation.md §1, §11):
 * the trigger that only lets automated reports go without a reporter, the
 * one-OPEN-automated-report-per-photo index, and the visibility filter on held
 * and flagged photos, which every other suite mocks. Opt-in, and not in CI:
 *
 *   DB_TEST_DATABASE_URL=postgresql://…/everglow_dbtest pnpm run test:db
 *
 * Point it at an empty database with every migration applied (prisma migrate
 * deploy). It creates and deletes its own users and events.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "crypto";
import { AccessLevel, PhotoStatus, PrismaClient, ReportSource, ReportStatus } from "generated/prisma/client";
import { fileAutomatedReport } from "src/moderation/automated-report";
import { EvidenceService } from "src/moderation/evidence/evidence.service";
import { eventForPhotoVisibilityInclude } from "src/moderation/moderation.types";
import { PhotoVisibilityService } from "src/moderation/photo-visibility.service";

const url = process.env.DB_TEST_DATABASE_URL;
const SUB_PREFIX = "dbtest-screening|";
const describeDb = url ? describe : describe.skip;

describeDb("upload screening against Postgres", () => {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url as string }) });
  const evidence = new EvidenceService(
    db as never,
    {} as never,
    {} as never,
    {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as never,
    {} as never,
  );
  const visibility = new PhotoVisibilityService(db as never);

  let organizerId: string;
  let uploaderId: string;
  let guestId: string;
  let eventId: string;

  const createUser = async () => {
    const id = randomUUID();
    await db.user.create({ data: { id, providerSub: `${SUB_PREFIX}${id}` } });
    return id;
  };

  const cleanUp = async () => {
    await db.event.deleteMany({ where: { title: { startsWith: "dbtest-screening" } } });
    await db.user.deleteMany({ where: { providerSub: { startsWith: SUB_PREFIX } } });
  };

  const addPhoto = (data: { screeningHeldUntil?: Date | null } = {}) => {
    const id = randomUUID();
    return db.photo.create({
      data: {
        id,
        eventId,
        addedById: uploaderId,
        s3Key: `photos/${eventId}/${id}`,
        contentType: "image/jpeg",
        sizeBytes: 1024,
        status: PhotoStatus.READY,
        ...data,
      },
    });
  };

  const fileFor = (photoId: string) =>
    db.$transaction((tx) =>
      fileAutomatedReport(tx, evidence, {
        eventId,
        eventTitle: "dbtest-screening",
        targetType: "PHOTO",
        photoId,
        reportedUserId: uploaderId,
        reason: "NUDITY_OR_SEXUAL",
        note: "Upload screening: Explicit (99%)",
        snapshot: { objectS3Key: `photos/${eventId}/${photoId}`, subjectUserId: uploaderId },
      }),
    );

  const visibleTo = async (callerId: string) => {
    const event = await db.event.findUniqueOrThrow({
      where: { id: eventId },
      include: eventForPhotoVisibilityInclude(callerId),
    });
    const photos = await db.photo.findMany({
      where: { AND: [{ eventId }, await visibility.whereVisibleTo(callerId, event)] },
      select: { id: true },
    });
    return photos.map((photo) => photo.id).sort();
  };

  beforeAll(async () => {
    await db.$connect();
    await cleanUp();
  });

  afterAll(async () => {
    await cleanUp();
    await db.$disconnect();
  });

  beforeEach(async () => {
    await cleanUp();
    [organizerId, uploaderId, guestId] = [await createUser(), await createUser(), await createUser()];
    const plan = await db.plan.findFirstOrThrow();
    eventId = randomUUID();
    await db.event.create({
      data: {
        id: eventId,
        title: "dbtest-screening",
        date: new Date(),
        galleryOpensAt: new Date(Date.now() - 60_000),
        invitationUrl: `dbtest-${eventId}`,
        planId: plan.id,
        eventAccesses: {
          create: [
            { userId: organizerId, accessLevel: AccessLevel.ORGANIZER },
            { userId: uploaderId, accessLevel: AccessLevel.PARTICIPANT },
            { userId: guestId, accessLevel: AccessLevel.PARTICIPANT },
          ],
        },
      },
    });
  });

  describe("Report_user_source_has_reporter_check", () => {
    it("refuses a member's report without a reporter, and lets an automated one through", async () => {
      const photo = await addPhoto();
      const base = {
        eventId,
        eventTitle: "dbtest-screening",
        targetType: "PHOTO" as const,
        photoId: photo.id,
        reason: "SPAM" as const,
      };

      await expect(db.report.create({ data: { ...base, reporterId: null } })).rejects.toThrow(
        /USER report needs a reporterId/,
      );
      await expect(
        db.report.create({ data: { ...base, reporterId: null, source: ReportSource.AUTOMATED } }),
      ).resolves.toMatchObject({ source: "AUTOMATED", reporterId: null });
    });

    it("still lets the reporter's account go afterwards: SET NULL is not an insert", async () => {
      const photo = await addPhoto();
      const report = await db.report.create({
        data: {
          eventId,
          eventTitle: "dbtest-screening",
          targetType: "PHOTO",
          photoId: photo.id,
          reason: "SPAM",
          reporterId: guestId,
        },
      });

      await db.user.delete({ where: { id: guestId } });

      await expect(db.report.findUniqueOrThrow({ where: { id: report.id } })).resolves.toMatchObject({
        reporterId: null,
        source: "USER",
      });
    });
  });

  describe("one OPEN automated report per photo", () => {
    it("files one, skips the second, and allows another once the first is closed", async () => {
      const photo = await addPhoto();

      const first = await fileFor(photo.id);
      expect(first).toMatchObject({ source: "AUTOMATED", queue: "PLATFORM", reporterId: null });
      expect(await db.reportEvidence.count({ where: { reportId: first!.id } })).toBe(1);

      await expect(fileFor(photo.id)).resolves.toBeNull();

      await db.report.update({
        where: { id: first!.id },
        data: {
          status: ReportStatus.DISMISSED,
          resolvedAt: new Date(),
          closedReason: "DISMISSED",
          closedByRole: "PLATFORM",
        },
      });
      await expect(fileFor(photo.id)).resolves.not.toBeNull();
    });
  });

  describe("visibility", () => {
    it("shows a held photo to its uploader and the organizers only, until its hold runs out", async () => {
      const held = await addPhoto({ screeningHeldUntil: new Date(Date.now() + 60_000) });
      const lapsed = await addPhoto({ screeningHeldUntil: new Date(Date.now() - 1000) });
      const plain = await addPhoto();

      expect(await visibleTo(guestId)).toEqual([lapsed.id, plain.id].sort());
      expect(await visibleTo(uploaderId)).toEqual([held.id, lapsed.id, plain.id].sort());
      expect(await visibleTo(organizerId)).toEqual([held.id, lapsed.id, plain.id].sort());
    });

    it("hides a photo with an OPEN automated report from everyone but organizers, uploader included", async () => {
      const flagged = await addPhoto();
      const plain = await addPhoto();
      await fileFor(flagged.id);

      expect(await visibleTo(guestId)).toEqual([plain.id]);
      expect(await visibleTo(uploaderId)).toEqual([plain.id]);
      expect(await visibleTo(organizerId)).toEqual([flagged.id, plain.id].sort());
    });
  });
});
