import { EvidenceService } from "../evidence.service";

export type EvidenceServiceMock = jest.Mocked<
  Pick<EvidenceService, "preserveBeforeDelete" | "writeSnapshot" | "findKeysAwaitingQuarantine" | "discardImages">
>;

/**
 * An EvidenceService for specs of the delete paths: nothing is reported, so
 * every key may be deleted and nothing is kept back.
 */
export const buildEvidenceServiceMock = (): EvidenceServiceMock => ({
  preserveBeforeDelete: jest.fn((keys: string[]) => Promise.resolve({ deletable: keys, retained: [] })),
  writeSnapshot: jest.fn().mockResolvedValue(undefined),
  findKeysAwaitingQuarantine: jest.fn().mockResolvedValue([]),
  discardImages: jest.fn().mockResolvedValue(undefined),
});
