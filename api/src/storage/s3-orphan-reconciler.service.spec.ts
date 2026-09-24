import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import { PinoLogger } from "nestjs-pino";
import { ListObjectsResult, S3ObjectSummary, S3Service } from "src/sdk/aws/s3/s3.service";
import { OrphanSourceRegistry } from "./orphan-source.registry";
import { S3OrphanReconcilerService } from "./s3-orphan-reconciler.service";

describe("S3OrphanReconcilerService", () => {
  let service: S3OrphanReconcilerService;
  let registry: OrphanSourceRegistry;
  let source: { prefix: string; minObjectAgeMs?: number; isOwnedKey: jest.Mock; findReferencedKeys: jest.Mock };
  let s3Service: { listObjects: jest.Mock; deleteObject: jest.Mock };
  let logger: { setContext: jest.Mock; info: jest.Mock; error: jest.Mock };
  let batchSize: number;
  let minAgeHours: number;

  const HOUR_MS = 60 * 60 * 1000;
  const MIN_AGE_HOURS = 24;
  const PREFIX = "things/";

  const referencedKey = `${PREFIX}referenced`;
  const orphanKey = `${PREFIX}orphan`;
  const otherOrphanKey = `${PREFIX}other-orphan`;
  const thirdOrphanKey = `${PREFIX}third-orphan`;
  const foreignKey = `${PREFIX}README.txt`;

  const object = (key: string, ageHours = MIN_AGE_HOURS + 1, sizeBytes = 1024): S3ObjectSummary => ({
    key,
    sizeBytes,
    lastModified: new Date(Date.now() - ageHours * HOUR_MS),
  });

  const page = (objects: S3ObjectSummary[], nextContinuationToken?: string): ListObjectsResult => ({
    objects,
    nextContinuationToken,
  });

  const buildSource = (prefix: string): typeof source => ({
    prefix,
    isOwnedKey: jest.fn((key: string) => key.startsWith(prefix) && !key.endsWith(".txt")),
    findReferencedKeys: jest.fn().mockResolvedValue([]),
  });

  beforeEach(async () => {
    batchSize = 100;
    minAgeHours = MIN_AGE_HOURS;
    s3Service = {
      listObjects: jest.fn().mockResolvedValue(page([])),
      deleteObject: jest.fn().mockResolvedValue(undefined),
    };
    logger = { setContext: jest.fn(), info: jest.fn(), error: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        S3OrphanReconcilerService,
        OrphanSourceRegistry,
        { provide: S3Service, useValue: s3Service },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn((key: string) => {
              if (key === "storage.orphanReconcilerBatchSize") return batchSize;
              if (key === "storage.orphanReconcilerMinObjectAgeHours") return minAgeHours;
              throw new Error(`Unexpected config key: ${key}`);
            }),
          },
        },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    service = module.get(S3OrphanReconcilerService);
    registry = module.get(OrphanSourceRegistry);
    source = buildSource(PREFIX);
    registry.register(source);
  });

  it("deletes objects the source does not reference and keeps the referenced ones", async () => {
    s3Service.listObjects.mockResolvedValue(page([object(referencedKey), object(orphanKey)]));
    source.findReferencedKeys.mockResolvedValue([referencedKey]);

    const result = await service.reconcileOrphanedObjects();

    expect(result).toEqual({ scanned: 2, skipped: 0, deleted: 1, failed: 0, completed: true });
    expect(s3Service.listObjects).toHaveBeenCalledWith(PREFIX, undefined);
    expect(source.findReferencedKeys).toHaveBeenCalledWith([referencedKey, orphanKey]);
    expect(s3Service.deleteObject).toHaveBeenCalledTimes(1);
    expect(s3Service.deleteObject).toHaveBeenCalledWith(orphanKey);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "storage.orphan_reconcile.deleted",
        prefix: PREFIX,
        key: orphanKey,
        sizeBytes: 1024,
        audit: true,
      }),
      expect.any(String),
    );
  });

  it("never looks up or deletes keys the source does not recognise", async () => {
    s3Service.listObjects.mockResolvedValue(page([object(foreignKey), object(orphanKey)]));

    const result = await service.reconcileOrphanedObjects();

    expect(result).toEqual({ scanned: 2, skipped: 1, deleted: 1, failed: 0, completed: true });
    expect(source.findReferencedKeys).toHaveBeenCalledWith([orphanKey]);
    expect(s3Service.deleteObject).toHaveBeenCalledTimes(1);
    expect(s3Service.deleteObject).toHaveBeenCalledWith(orphanKey);
  });

  it("skips objects newer than the minimum age and objects without a timestamp", async () => {
    s3Service.listObjects.mockResolvedValue(
      page([object(orphanKey, 1), { key: otherOrphanKey, sizeBytes: 1 }, object(thirdOrphanKey, MIN_AGE_HOURS + 1)]),
    );

    const result = await service.reconcileOrphanedObjects();

    expect(result).toEqual({ scanned: 3, skipped: 2, deleted: 1, failed: 0, completed: true });
    expect(source.findReferencedKeys).toHaveBeenCalledWith([thirdOrphanKey]);
    expect(s3Service.deleteObject).toHaveBeenCalledTimes(1);
    expect(s3Service.deleteObject).toHaveBeenCalledWith(thirdOrphanKey);
  });

  it("does not query the database for a page with no candidates", async () => {
    s3Service.listObjects.mockResolvedValue(page([object(orphanKey, 1)]));

    await service.reconcileOrphanedObjects();

    expect(source.findReferencedKeys).not.toHaveBeenCalled();
  });

  it("continues after a failed delete and counts it", async () => {
    s3Service.listObjects.mockResolvedValue(page([object(orphanKey), object(otherOrphanKey)]));
    s3Service.deleteObject.mockRejectedValueOnce(new Error("s3 down"));

    const result = await service.reconcileOrphanedObjects();

    expect(result).toEqual({ scanned: 2, skipped: 0, deleted: 1, failed: 1, completed: true });
    expect(s3Service.deleteObject).toHaveBeenCalledTimes(2);
    expect(s3Service.deleteObject).toHaveBeenLastCalledWith(otherOrphanKey);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: "storage.orphan_reconcile.delete_failed", key: orphanKey }),
      expect.any(String),
    );
  });

  it("walks every page of the listing", async () => {
    s3Service.listObjects
      .mockResolvedValueOnce(page([object(orphanKey)], "token-2"))
      .mockResolvedValueOnce(page([object(otherOrphanKey)]));

    const result = await service.reconcileOrphanedObjects();

    expect(result).toEqual({ scanned: 2, skipped: 0, deleted: 2, failed: 0, completed: true });
    expect(s3Service.listObjects).toHaveBeenCalledTimes(2);
    expect(s3Service.listObjects).toHaveBeenNthCalledWith(1, PREFIX, undefined);
    expect(s3Service.listObjects).toHaveBeenNthCalledWith(2, PREFIX, "token-2");
    expect(source.findReferencedKeys).toHaveBeenCalledTimes(2);
  });

  it("stops at the batch cap, reports the run as incomplete, and fetches no further pages", async () => {
    batchSize = 2;
    s3Service.listObjects.mockResolvedValue(
      page([object(orphanKey), object(otherOrphanKey), object(thirdOrphanKey)], "token-2"),
    );

    const result = await service.reconcileOrphanedObjects();

    expect(result).toEqual({ scanned: 3, skipped: 0, deleted: 2, failed: 0, completed: false });
    expect(s3Service.deleteObject).toHaveBeenCalledTimes(2);
    expect(s3Service.deleteObject).not.toHaveBeenCalledWith(thirdOrphanKey);
    expect(s3Service.listObjects).toHaveBeenCalledTimes(1);
  });

  it("counts failed deletes against the batch cap", async () => {
    batchSize = 1;
    s3Service.listObjects.mockResolvedValue(page([object(orphanKey), object(otherOrphanKey)]));
    s3Service.deleteObject.mockRejectedValueOnce(new Error("s3 down"));

    const result = await service.reconcileOrphanedObjects();

    expect(result).toEqual({ scanned: 2, skipped: 0, deleted: 0, failed: 1, completed: false });
    expect(s3Service.deleteObject).toHaveBeenCalledTimes(1);
  });

  it("completes a run that deletes exactly the batch cap with nothing left over", async () => {
    batchSize = 1;
    s3Service.listObjects.mockResolvedValue(page([object(orphanKey)]));

    const result = await service.reconcileOrphanedObjects();

    expect(result).toEqual({ scanned: 1, skipped: 0, deleted: 1, failed: 0, completed: true });
  });

  it("returns zero counts for an empty prefix and still logs the summary", async () => {
    const result = await service.reconcileOrphanedObjects();

    expect(result).toEqual({ scanned: 0, skipped: 0, deleted: 0, failed: 0, completed: true });
    expect(source.findReferencedKeys).not.toHaveBeenCalled();
    expect(s3Service.deleteObject).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "storage.orphan_reconcile.completed",
        scanned: 0,
        deleted: 0,
        failed: 0,
        completed: true,
        minObjectAgeHours: MIN_AGE_HOURS,
        audit: true,
      }),
      expect.any(String),
    );
  });

  describe("with several sources", () => {
    const OTHER_PREFIX = "others/";
    const otherSourceOrphanKey = `${OTHER_PREFIX}orphan`;
    let otherSource: typeof source;

    beforeEach(() => {
      otherSource = buildSource(OTHER_PREFIX);
      registry.register(otherSource);
      s3Service.listObjects.mockImplementation((prefix: string) =>
        Promise.resolve(page(prefix === PREFIX ? [object(orphanKey)] : [object(otherSourceOrphanKey)])),
      );
    });

    it("walks every registered prefix and asks each source only about its own keys", async () => {
      const result = await service.reconcileOrphanedObjects();

      expect(result).toEqual({ scanned: 2, skipped: 0, deleted: 2, failed: 0, completed: true });
      expect(s3Service.listObjects).toHaveBeenCalledWith(PREFIX, undefined);
      expect(s3Service.listObjects).toHaveBeenCalledWith(OTHER_PREFIX, undefined);
      expect(source.findReferencedKeys).toHaveBeenCalledWith([orphanKey]);
      expect(otherSource.findReferencedKeys).toHaveBeenCalledWith([otherSourceOrphanKey]);
    });

    it("shares one batch cap across the sources and does not list the prefixes it never reached", async () => {
      batchSize = 1;

      const result = await service.reconcileOrphanedObjects();

      expect(result).toEqual({ scanned: 2, skipped: 0, deleted: 1, failed: 0, completed: false });
      expect(s3Service.deleteObject).toHaveBeenCalledTimes(1);
      expect(s3Service.deleteObject).toHaveBeenCalledWith(orphanKey);
    });
  });

  describe("source minimum age", () => {
    const SOURCE_MIN_AGE_HOURS = 2;

    beforeEach(() => {
      source.minObjectAgeMs = SOURCE_MIN_AGE_HOURS * HOUR_MS;
    });

    it("keeps young objects even when the configured age buffer is disabled", async () => {
      minAgeHours = 0;
      s3Service.listObjects.mockResolvedValue(page([object(orphanKey, 1), object(otherOrphanKey, 3)]));

      const result = await service.reconcileOrphanedObjects();

      expect(result).toEqual({ scanned: 2, skipped: 1, deleted: 1, failed: 0, completed: true });
      expect(s3Service.deleteObject).toHaveBeenCalledWith(otherOrphanKey);
    });

    it("does not lower a larger configured age", async () => {
      s3Service.listObjects.mockResolvedValue(page([object(orphanKey, 3)]));

      const result = await service.reconcileOrphanedObjects();

      expect(result).toEqual({ scanned: 1, skipped: 1, deleted: 0, failed: 0, completed: true });
    });
  });

  it("does nothing when no source is registered", async () => {
    const module = await Test.createTestingModule({
      providers: [
        S3OrphanReconcilerService,
        OrphanSourceRegistry,
        { provide: S3Service, useValue: s3Service },
        { provide: ConfigService, useValue: { getOrThrow: jest.fn().mockReturnValue(1) } },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    const result = await module.get(S3OrphanReconcilerService).reconcileOrphanedObjects();

    expect(result).toEqual({ scanned: 0, skipped: 0, deleted: 0, failed: 0, completed: true });
    expect(s3Service.listObjects).not.toHaveBeenCalled();
  });

  it("propagates a listing failure so the scheduler can report the run", async () => {
    s3Service.listObjects.mockRejectedValue(new Error("list failed"));

    await expect(service.reconcileOrphanedObjects()).rejects.toThrow("list failed");

    expect(s3Service.deleteObject).not.toHaveBeenCalled();
  });
});
