import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import {
  AccessLevel,
  Event,
  EventAccess,
  Photo,
  PrismaClient,
  Report,
  ReportReason,
  ReportStatus,
  ReportTargetType,
} from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import { AbilityFactory } from "src/casl/ability.factory";
import { encodeKeysetCursor } from "src/common/pagination/keyset-cursor";
import { EVENT_SERVICE_ERRORS } from "src/events/events.constants";
import { FREE_TIER_STORAGE_LIMIT_BYTES, PHOTO_SERVICE_ERRORS } from "src/photos/photos.constants";
import { PrismaService } from "src/prisma/prisma.service";
import { UserWithDetails } from "src/users/users.types";
import { REPORT_SERVICE_ERRORS } from "./moderation.constants";
import { PhotoVisibilityService } from "./photo-visibility.service";
import { ReportsService } from "./reports.service";

describe("ReportsService", () => {
  let service: ReportsService;
  let prisma: DeepMockProxy<PrismaClient>;
  let photoVisibilityService: { isVisibleTo: jest.Mock };
  let logger: { setContext: jest.Mock; info: jest.Mock; warn: jest.Mock; error: jest.Mock; debug: jest.Mock };

  const callerId = "11111111-1111-1111-1111-111111111111";
  const uploaderId = "22222222-2222-2222-2222-222222222222";
  const eventId = "66666666-6666-6666-6666-666666666666";
  const photoId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const reportId = "dddddddd-dddd-dddd-dddd-dddddddddddd";
  const now = new Date("2026-06-10T12:00:00.000Z");

  const callerWithoutDetails: UserWithDetails = {
    id: callerId,
    providerSub: "auth0|caller",
    storageLimitBytes: FREE_TIER_STORAGE_LIMIT_BYTES,
    deletionStartedAt: null,
    auth0DeletedAt: null,
    deletionPhotoPolicy: null,
    deletionAttempts: 0,
    termsAcceptedAt: null,
    createdAt: now,
    updatedAt: now,
    details: null,
  };

  const callerWithDetails: UserWithDetails = {
    ...callerWithoutDetails,
    details: {
      id: "33333333-3333-3333-3333-333333333333",
      userId: callerId,
      email: "caller@example.com",
      name: "Caller",
      avatarS3Key: null,
      createdAt: now,
      updatedAt: now,
    },
  };

  const event: Event = {
    id: eventId,
    title: "Summer BBQ",
    description: null,
    date: new Date("2026-08-15T18:00:00.000Z"),
    creatorId: uploaderId,
    invitationUrl: "invite-token",
    coverS3Key: null,
    createdAt: now,
    updatedAt: now,
  };

  const access = (userId: string, accessLevel: AccessLevel): EventAccess => ({
    id: "44444444-4444-4444-4444-444444444444",
    userId,
    eventId,
    accessLevel,
    createdAt: now,
    updatedAt: now,
  });

  const eventFor = (callerAccessLevel: AccessLevel | null, memberCount = 10) => ({
    ...event,
    eventAccesses: callerAccessLevel ? [access(callerId, callerAccessLevel)] : [],
    _count: { eventAccesses: memberCount },
  });

  const photoFor = (callerAccessLevel: AccessLevel | null, overrides: Partial<Photo> = {}, memberCount = 10) => ({
    id: photoId,
    eventId,
    addedById: uploaderId,
    s3Key: `photos/${uploaderId}/${eventId}/${photoId}`,
    contentType: "image/jpeg",
    sizeBytes: 1024,
    status: "READY" as const,
    createdAt: now,
    updatedAt: now,
    ...overrides,
    event: eventFor(callerAccessLevel, memberCount),
  });

  const buildReport = (overrides: Partial<Report> = {}): Report => ({
    id: reportId,
    eventId,
    reporterId: callerId,
    targetType: ReportTargetType.PHOTO,
    photoId,
    reportedUserId: uploaderId,
    reason: ReportReason.SPAM,
    note: null,
    status: ReportStatus.OPEN,
    resolvedById: null,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });

  const memberReport = (overrides: Partial<Report> = {}): Report =>
    buildReport({ targetType: ReportTargetType.MEMBER, photoId: null, ...overrides });

  const loggedEvents = (level: "info" | "warn") =>
    logger[level].mock.calls.map(([fields]: [{ event: string }]) => fields.event);

  beforeEach(async () => {
    prisma = mockDeep<PrismaClient>();
    photoVisibilityService = { isVisibleTo: jest.fn().mockResolvedValue(true) };
    logger = { setContext: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        AbilityFactory,
        { provide: PrismaService, useValue: prisma },
        { provide: PhotoVisibilityService, useValue: photoVisibilityService },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    service = module.get(ReportsService);

    prisma.user.findUnique.mockResolvedValue(callerWithDetails);
    prisma.report.findFirst.mockResolvedValue(null);
    prisma.report.count.mockResolvedValue(1);
    prisma.eventAccess.findUnique.mockResolvedValue(access(uploaderId, AccessLevel.PARTICIPANT));
  });

  describe("reportPhoto", () => {
    const dto = { reason: ReportReason.SPAM, note: "Keeps posting ads" };

    it.each([AccessLevel.ORGANIZER, AccessLevel.PARTICIPANT, AccessLevel.VIEWER])(
      "lets a %s report a photo of the event",
      async (accessLevel) => {
        prisma.photo.findUnique.mockResolvedValue(photoFor(accessLevel) as never);
        prisma.report.createManyAndReturn.mockResolvedValue([buildReport({ note: dto.note })]);

        const result = await service.reportPhoto(photoId, callerId, dto);

        expect(result).toEqual(buildReport({ note: dto.note }));
        expect(prisma.report.createManyAndReturn).toHaveBeenCalledWith({
          data: [
            {
              eventId,
              targetType: "PHOTO",
              photoId,
              reportedUserId: uploaderId,
              reporterId: callerId,
              reason: "SPAM",
              note: dto.note,
            },
          ],
          skipDuplicates: true,
        });
      },
    );

    it("stores a missing note as null and a missing uploader as no reported user", async () => {
      prisma.photo.findUnique.mockResolvedValue(photoFor(AccessLevel.VIEWER, { addedById: null }) as never);
      prisma.report.createManyAndReturn.mockResolvedValue([buildReport({ reportedUserId: null })]);

      await service.reportPhoto(photoId, callerId, { reason: ReportReason.OTHER });

      const [args] = prisma.report.createManyAndReturn.mock.calls[0];
      expect(args?.data).toEqual([expect.objectContaining({ note: null, reportedUserId: null })]);
      expect(prisma.eventAccess.findUnique).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the photo does not exist", async () => {
      prisma.photo.findUnique.mockResolvedValue(null);

      await expect(service.reportPhoto(photoId, callerId, dto)).rejects.toThrow(
        new NotFoundException(PHOTO_SERVICE_ERRORS.NOT_FOUND(photoId)),
      );
    });

    it("throws NotFoundException for a photo that is not READY, as the read paths do", async () => {
      prisma.photo.findUnique.mockResolvedValue(photoFor(AccessLevel.ORGANIZER, { status: "PENDING" }) as never);

      await expect(service.reportPhoto(photoId, callerId, dto)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws ForbiddenException when the caller is not a member of the photo's event", async () => {
      prisma.photo.findUnique.mockResolvedValue(photoFor(null) as never);

      await expect(service.reportPhoto(photoId, callerId, dto)).rejects.toThrow(
        new ForbiddenException(REPORT_SERVICE_ERRORS.CREATE_FORBIDDEN(eventId)),
      );
      expect(prisma.report.createManyAndReturn).not.toHaveBeenCalled();
    });

    it("throws ForbiddenException when the caller has not completed onboarding", async () => {
      prisma.user.findUnique.mockResolvedValue(callerWithoutDetails);
      prisma.photo.findUnique.mockResolvedValue(photoFor(AccessLevel.PARTICIPANT) as never);

      await expect(service.reportPhoto(photoId, callerId, dto)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("refuses a report of the caller's own photo", async () => {
      prisma.photo.findUnique.mockResolvedValue(photoFor(AccessLevel.PARTICIPANT, { addedById: callerId }) as never);

      await expect(service.reportPhoto(photoId, callerId, dto)).rejects.toThrow(
        new ForbiddenException(REPORT_SERVICE_ERRORS.CANNOT_REPORT_SELF),
      );
      expect(prisma.report.createManyAndReturn).not.toHaveBeenCalled();
    });

    it("returns the caller's OPEN report instead of creating a second one", async () => {
      const existing = buildReport({ reason: ReportReason.HARASSMENT });
      prisma.photo.findUnique.mockResolvedValue(photoFor(AccessLevel.PARTICIPANT) as never);
      prisma.report.findFirst.mockResolvedValue(existing);
      // Their own open report hides the photo from them; that must not turn the repeat into a 404.
      photoVisibilityService.isVisibleTo.mockResolvedValue(false);

      await expect(service.reportPhoto(photoId, callerId, dto)).resolves.toEqual(existing);

      expect(prisma.report.findFirst).toHaveBeenCalledWith({
        where: { reporterId: callerId, status: "OPEN", eventId, targetType: "PHOTO", photoId },
      });
      expect(prisma.report.createManyAndReturn).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("returns the winning report when a concurrent submission inserted first", async () => {
      const winner = buildReport();
      prisma.photo.findUnique.mockResolvedValue(photoFor(AccessLevel.PARTICIPANT) as never);
      // The photo was still visible, so no report existed yet; the database then skipped the insert as a duplicate.
      prisma.report.createManyAndReturn.mockResolvedValue([]);
      prisma.report.findFirst.mockResolvedValue(winner);

      await expect(service.reportPhoto(photoId, callerId, dto)).resolves.toEqual(winner);
      expect(prisma.report.createManyAndReturn).toHaveBeenCalledWith(expect.objectContaining({ skipDuplicates: true }));
      // The winner's request logged the creation; this one must not log it again.
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("answers 409 when the insert was skipped and the winning report is already resolved", async () => {
      prisma.photo.findUnique.mockResolvedValue(photoFor(AccessLevel.PARTICIPANT) as never);
      prisma.report.createManyAndReturn.mockResolvedValue([]);

      await expect(service.reportPhoto(photoId, callerId, dto)).rejects.toThrow(
        new ConflictException(REPORT_SERVICE_ERRORS.CREATE_CONFLICT),
      );
    });

    it("treats a photo the caller cannot see (blocked, or already hidden) as not found", async () => {
      const photo = photoFor(AccessLevel.PARTICIPANT);
      prisma.photo.findUnique.mockResolvedValue(photo as never);
      photoVisibilityService.isVisibleTo.mockResolvedValue(false);

      await expect(service.reportPhoto(photoId, callerId, dto)).rejects.toThrow(
        new NotFoundException(PHOTO_SERVICE_ERRORS.NOT_FOUND(photoId)),
      );
      expect(photoVisibilityService.isVisibleTo).toHaveBeenCalledWith(photoId, callerId, photo.event);
      expect(prisma.report.createManyAndReturn).not.toHaveBeenCalled();
    });

    describe("audit and escalation", () => {
      beforeEach(() => {
        prisma.photo.findUnique.mockResolvedValue(photoFor(AccessLevel.PARTICIPANT) as never);
      });

      it("logs report.created with ids, reason and target type, and never the note", async () => {
        prisma.report.createManyAndReturn.mockResolvedValue([buildReport({ note: dto.note })]);

        await service.reportPhoto(photoId, callerId, dto);

        expect(logger.info).toHaveBeenCalledWith(
          {
            event: "report.created",
            reportId,
            eventId,
            callerId,
            targetType: "PHOTO",
            photoId,
            reportedUserId: uploaderId,
            reason: "SPAM",
            audit: true,
          },
          "Report created",
        );
        expect(JSON.stringify(logger.info.mock.calls)).not.toContain(dto.note);
      });

      it("does not escalate an ordinary report", async () => {
        prisma.report.createManyAndReturn.mockResolvedValue([buildReport()]);

        await service.reportPhoto(photoId, callerId, dto);

        expect(logger.warn).not.toHaveBeenCalled();
      });

      it.each([ReportReason.NUDITY_OR_SEXUAL, ReportReason.VIOLENCE])(
        "escalates a %s report as a distinct event",
        async (reason) => {
          prisma.report.createManyAndReturn.mockResolvedValue([buildReport({ reason })]);

          await service.reportPhoto(photoId, callerId, { reason });

          expect(loggedEvents("info")).toEqual(["report.created"]);
          expect(logger.warn).toHaveBeenCalledWith(
            expect.objectContaining({
              event: "report.escalated",
              reportId,
              reason,
              escalationReasons: ["severe_reason"],
              audit: true,
            }),
            expect.any(String),
          );
        },
      );

      it("escalates a report of an organizer's photo", async () => {
        prisma.eventAccess.findUnique.mockResolvedValue(access(uploaderId, AccessLevel.ORGANIZER));
        prisma.report.createManyAndReturn.mockResolvedValue([buildReport()]);

        await service.reportPhoto(photoId, callerId, dto);

        expect(prisma.eventAccess.findUnique).toHaveBeenCalledWith({
          where: { userId_eventId: { userId: uploaderId, eventId } },
        });
        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ escalationReasons: ["target_is_organizer"] }),
          expect.any(String),
        );
      });

      it("escalates the report that takes the photo to the hide threshold, and only that one", async () => {
        prisma.report.createManyAndReturn.mockResolvedValue([buildReport()]);

        prisma.report.count.mockResolvedValue(2);
        await service.reportPhoto(photoId, callerId, dto);
        expect(logger.warn).not.toHaveBeenCalled();

        prisma.report.count.mockResolvedValue(3);
        await service.reportPhoto(photoId, callerId, dto);
        expect(prisma.report.count).toHaveBeenLastCalledWith({ where: { photoId, status: "OPEN" } });
        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ escalationReasons: ["hide_threshold_reached"] }),
          expect.any(String),
        );

        logger.warn.mockClear();
        prisma.report.count.mockResolvedValue(4);
        await service.reportPhoto(photoId, callerId, dto);
        expect(logger.warn).not.toHaveBeenCalled();
      });

      it("uses the small-event threshold of 2 where 3 reports could never be collected", async () => {
        prisma.photo.findUnique.mockResolvedValue(photoFor(AccessLevel.PARTICIPANT, {}, 3) as never);
        prisma.report.createManyAndReturn.mockResolvedValue([buildReport()]);
        prisma.report.count.mockResolvedValue(2);

        await service.reportPhoto(photoId, callerId, dto);

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({ escalationReasons: ["hide_threshold_reached"] }),
          expect.any(String),
        );
      });

      it("names every reason when several apply", async () => {
        prisma.eventAccess.findUnique.mockResolvedValue(access(uploaderId, AccessLevel.ORGANIZER));
        prisma.report.createManyAndReturn.mockResolvedValue([buildReport({ reason: ReportReason.VIOLENCE })]);
        prisma.report.count.mockResolvedValue(3);

        await service.reportPhoto(photoId, callerId, { reason: ReportReason.VIOLENCE });

        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            escalationReasons: ["severe_reason", "target_is_organizer", "hide_threshold_reached"],
          }),
          expect.any(String),
        );
      });
    });
  });

  describe("reportMember", () => {
    const dto = { reason: ReportReason.HARASSMENT };
    const targetUserId = uploaderId;

    const eventWithCallerAccess = (accessLevel: AccessLevel | null) => ({
      ...event,
      eventAccesses: accessLevel ? [access(callerId, accessLevel)] : [],
    });

    it("lets a member report another member of the event", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(AccessLevel.VIEWER));
      prisma.report.createManyAndReturn.mockResolvedValue([memberReport({ reason: dto.reason })]);

      const result = await service.reportMember(eventId, targetUserId, callerId, dto);

      expect(result.targetType).toBe("MEMBER");
      expect(prisma.eventAccess.findUnique).toHaveBeenCalledWith({
        where: { userId_eventId: { userId: targetUserId, eventId } },
      });
      expect(prisma.report.createManyAndReturn).toHaveBeenCalledWith({
        data: [
          {
            eventId,
            targetType: "MEMBER",
            photoId: null,
            reportedUserId: targetUserId,
            reporterId: callerId,
            reason: "HARASSMENT",
            note: null,
          },
        ],
        skipDuplicates: true,
      });
      // No photo involved, so no threshold to count towards.
      expect(prisma.report.count).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.reportMember(eventId, targetUserId, callerId, dto)).rejects.toThrow(
        new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId)),
      );
    });

    it("throws ForbiddenException when the caller is not a member of the event", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(null));

      await expect(service.reportMember(eventId, targetUserId, callerId, dto)).rejects.toThrow(
        new ForbiddenException(REPORT_SERVICE_ERRORS.CREATE_FORBIDDEN(eventId)),
      );
      expect(prisma.eventAccess.findUnique).not.toHaveBeenCalled();
    });

    it("refuses a report of yourself", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(AccessLevel.PARTICIPANT));

      await expect(service.reportMember(eventId, callerId, callerId, dto)).rejects.toThrow(
        new ForbiddenException(REPORT_SERVICE_ERRORS.CANNOT_REPORT_SELF),
      );
    });

    it("refuses a target who is not a member of the event", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(AccessLevel.PARTICIPANT));
      prisma.eventAccess.findUnique.mockResolvedValue(null);

      await expect(service.reportMember(eventId, targetUserId, callerId, dto)).rejects.toThrow(
        new ForbiddenException(EVENT_SERVICE_ERRORS.NOT_A_MEMBER(eventId, targetUserId)),
      );
      expect(prisma.report.createManyAndReturn).not.toHaveBeenCalled();
    });

    it("returns the caller's OPEN report on that member instead of creating a second one", async () => {
      const existing = memberReport();
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(AccessLevel.PARTICIPANT));
      // The partial unique index is the duplicate check: the insert is skipped, sequentially or in a race.
      prisma.report.createManyAndReturn.mockResolvedValue([]);
      prisma.report.findFirst.mockResolvedValue(existing);

      await expect(service.reportMember(eventId, targetUserId, callerId, dto)).resolves.toEqual(existing);

      expect(prisma.report.findFirst).toHaveBeenCalledWith({
        where: { reporterId: callerId, status: "OPEN", eventId, targetType: "MEMBER", reportedUserId: targetUserId },
      });
      expect(logger.info).not.toHaveBeenCalled();
    });

    it("escalates a report of an organizer", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(AccessLevel.PARTICIPANT));
      prisma.eventAccess.findUnique.mockResolvedValue(access(targetUserId, AccessLevel.ORGANIZER));
      prisma.report.createManyAndReturn.mockResolvedValue([memberReport()]);

      await service.reportMember(eventId, targetUserId, callerId, dto);

      expect(loggedEvents("info")).toEqual(["report.created"]);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "report.escalated",
          targetType: "MEMBER",
          reportedUserId: targetUserId,
          escalationReasons: ["target_is_organizer"],
        }),
        expect.any(String),
      );
    });

    it("does not escalate a HARASSMENT report of an ordinary member", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(AccessLevel.PARTICIPANT));
      prisma.report.createManyAndReturn.mockResolvedValue([memberReport()]);

      await service.reportMember(eventId, targetUserId, callerId, dto);

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe("listReports", () => {
    const eventWithCallerAccess = (accessLevel: AccessLevel | null) => ({
      ...event,
      eventAccesses: accessLevel ? [access(callerId, accessLevel)] : [],
    });

    it("returns the event's reports to an organizer, newest first, with the default page size", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(AccessLevel.ORGANIZER));
      prisma.report.findMany.mockResolvedValue([buildReport()]);

      const page = await service.listReports(eventId, callerId, {});

      expect(page).toEqual({ items: [buildReport()], nextCursor: null });
      expect(prisma.report.findMany).toHaveBeenCalledWith({
        where: { AND: [{ eventId }, expect.anything()] },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 51,
      });
    });

    it("filters by status and continues from a cursor with a keyset WHERE", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(AccessLevel.ORGANIZER));
      prisma.report.findMany.mockResolvedValue([]);
      const last = { createdAt: new Date("2026-06-10T12:00:00.500Z"), id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee" };

      await service.listReports(eventId, callerId, { status: "OPEN", cursor: encodeKeysetCursor(last), limit: 10 });

      expect(prisma.report.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              { eventId, status: "OPEN" },
              expect.anything(),
              { OR: [{ createdAt: { lt: last.createdAt } }, { createdAt: last.createdAt, id: { lt: last.id } }] },
            ],
          },
          take: 11,
        }),
      );
    });

    it("returns a nextCursor when more reports exist", async () => {
      prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(AccessLevel.ORGANIZER));
      const reports = [1, 2, 3].map((n) =>
        buildReport({ id: `dddddddd-dddd-dddd-dddd-00000000000${n}`, createdAt: new Date(now.getTime() - n) }),
      );
      prisma.report.findMany.mockResolvedValue(reports);

      const page = await service.listReports(eventId, callerId, { limit: 2 });

      expect(page.items).toEqual(reports.slice(0, 2));
      expect(page.nextCursor).toBe(encodeKeysetCursor(reports[1]));
    });

    it("throws NotFoundException when the event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.listReports(eventId, callerId, {})).rejects.toThrow(
        new NotFoundException(EVENT_SERVICE_ERRORS.NOT_FOUND(eventId)),
      );
    });

    it.each([AccessLevel.PARTICIPANT, AccessLevel.VIEWER, null])(
      "throws ForbiddenException for a caller whose access is %s",
      async (accessLevel) => {
        prisma.event.findUnique.mockResolvedValue(eventWithCallerAccess(accessLevel));

        await expect(service.listReports(eventId, callerId, {})).rejects.toThrow(
          new ForbiddenException(REPORT_SERVICE_ERRORS.LIST_FORBIDDEN(eventId)),
        );
        expect(prisma.report.findMany).not.toHaveBeenCalled();
      },
    );
  });

  describe("resolveReport", () => {
    const reportFor = (accessLevel: AccessLevel | null, overrides: Partial<Report> = {}) => ({
      ...buildReport({ reporterId: "99999999-9999-9999-9999-999999999999", ...overrides }),
      event: { ...event, eventAccesses: accessLevel ? [access(callerId, accessLevel)] : [] },
    });

    it.each([ReportStatus.ACTIONED, ReportStatus.DISMISSED] as const)(
      "lets an organizer resolve an OPEN report as %s, touching nothing else",
      async (resolution) => {
        const resolved = buildReport({ status: resolution, resolvedById: callerId, resolvedAt: now });
        prisma.report.findUnique.mockResolvedValue(reportFor(AccessLevel.ORGANIZER));
        prisma.report.updateManyAndReturn.mockResolvedValue([resolved]);

        await expect(service.resolveReport(reportId, callerId, resolution)).resolves.toEqual(resolved);

        expect(prisma.report.updateManyAndReturn).toHaveBeenCalledWith({
          where: { id: reportId, status: "OPEN" },
          data: { status: resolution, resolvedById: callerId, resolvedAt: expect.any(Date) as unknown },
        });
        // Resolving is a verdict, not an action: the photo and the member stay.
        expect(prisma.photo.delete).not.toHaveBeenCalled();
        expect(prisma.eventAccess.delete).not.toHaveBeenCalled();
        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({ event: "report.resolved", reportId, callerId, resolution, audit: true }),
          "Report resolved",
        );
      },
    );

    it("throws NotFoundException when the report does not exist", async () => {
      prisma.report.findUnique.mockResolvedValue(null);

      await expect(service.resolveReport(reportId, callerId, "DISMISSED")).rejects.toThrow(
        new NotFoundException(REPORT_SERVICE_ERRORS.NOT_FOUND(reportId)),
      );
    });

    it.each([AccessLevel.PARTICIPANT, AccessLevel.VIEWER, null])(
      "throws ForbiddenException for a caller whose access is %s",
      async (accessLevel) => {
        prisma.report.findUnique.mockResolvedValue(reportFor(accessLevel));

        await expect(service.resolveReport(reportId, callerId, "DISMISSED")).rejects.toThrow(
          new ForbiddenException(REPORT_SERVICE_ERRORS.RESOLVE_FORBIDDEN(reportId)),
        );
        expect(prisma.report.updateManyAndReturn).not.toHaveBeenCalled();
      },
    );

    it.each([
      ["a report about themselves", { targetType: ReportTargetType.MEMBER, photoId: null }],
      ["a report about their own photo", {}],
    ])("does not let an organizer resolve %s", async (_label, overrides) => {
      prisma.report.findUnique.mockResolvedValue(
        reportFor(AccessLevel.ORGANIZER, { ...overrides, reportedUserId: callerId }),
      );

      await expect(service.resolveReport(reportId, callerId, "DISMISSED")).rejects.toThrow(
        new ForbiddenException(REPORT_SERVICE_ERRORS.CANNOT_RESOLVE_OWN),
      );
      expect(prisma.report.updateManyAndReturn).not.toHaveBeenCalled();
    });

    it("answers 409 when the report was already resolved, including by a concurrent request", async () => {
      prisma.report.findUnique.mockResolvedValue(reportFor(AccessLevel.ORGANIZER));
      // The OPEN guard in the UPDATE matched nothing.
      prisma.report.updateManyAndReturn.mockResolvedValue([]);

      await expect(service.resolveReport(reportId, callerId, "ACTIONED")).rejects.toThrow(
        new ConflictException(REPORT_SERVICE_ERRORS.ALREADY_RESOLVED(reportId)),
      );
      expect(logger.info).not.toHaveBeenCalled();
    });
  });
});
