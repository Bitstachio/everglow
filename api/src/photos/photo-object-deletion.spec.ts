import { InternalServerErrorException } from "@nestjs/common";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { deleteObjectsWithDerivatives, deleteObjectWithDerivatives } from "./photo-object-deletion";

const photo = "photos/u/e/p";
const thumb = `derived/${photo}/thumb.webp`;
const large = `derived/${photo}/large.jpg`;
const cover = "event-covers/e/c";

describe("photo object deletion", () => {
  const deleteObjects = jest.fn();
  const s3Service = { deleteObjects } as unknown as S3Service;

  beforeEach(() => {
    deleteObjects.mockReset();
    deleteObjects.mockImplementation((keys: string[]) => Promise.resolve({ deleted: keys, failed: [] }));
  });

  describe("deleteObjectsWithDerivatives", () => {
    it("deletes each photo original with its thumbnail and display copy in one batch", async () => {
      const result = await deleteObjectsWithDerivatives(s3Service, [photo, cover]);

      expect(deleteObjects).toHaveBeenCalledTimes(1);
      expect(deleteObjects).toHaveBeenCalledWith([photo, thumb, large, cover]);
      expect(result).toEqual({ deleted: [photo, cover], failed: [], derivativesFailed: [] });
    });

    it("reports a derived key that fails apart from its original", async () => {
      deleteObjects.mockResolvedValue({
        deleted: [photo, large],
        failed: [{ key: thumb, code: "InternalError" }],
      });

      await expect(deleteObjectsWithDerivatives(s3Service, [photo])).resolves.toEqual({
        deleted: [photo],
        failed: [],
        derivativesFailed: [thumb],
      });
    });

    it("reports an original that fails", async () => {
      deleteObjects.mockResolvedValue({ deleted: [thumb, large], failed: [{ key: photo, code: "AccessDenied" }] });

      const result = await deleteObjectsWithDerivatives(s3Service, [photo]);

      expect(result.failed).toEqual([{ key: photo, code: "AccessDenied" }]);
      expect(result.deleted).toEqual([]);
    });

    it("makes no request for no keys", async () => {
      await expect(deleteObjectsWithDerivatives(s3Service, [])).resolves.toEqual({
        deleted: [],
        failed: [],
        derivativesFailed: [],
      });
      expect(deleteObjects).not.toHaveBeenCalled();
    });

    it("throws when the request fails as a whole", async () => {
      deleteObjects.mockRejectedValue(new InternalServerErrorException("s3 down"));
      await expect(deleteObjectsWithDerivatives(s3Service, [photo])).rejects.toThrow("s3 down");
    });
  });

  describe("deleteObjectWithDerivatives", () => {
    it("deletes the original and both derived keys", async () => {
      await deleteObjectWithDerivatives(s3Service, photo);
      expect(deleteObjects).toHaveBeenCalledWith([photo, thumb, large]);
    });

    it("throws when the original could not be deleted", async () => {
      deleteObjects.mockResolvedValue({ deleted: [thumb, large], failed: [{ key: photo }] });
      await expect(deleteObjectWithDerivatives(s3Service, photo)).rejects.toThrow(InternalServerErrorException);
    });

    it("succeeds when only a derived key could not be deleted", async () => {
      deleteObjects.mockResolvedValue({ deleted: [photo, thumb], failed: [{ key: large }] });
      await expect(deleteObjectWithDerivatives(s3Service, photo)).resolves.toBeUndefined();
    });

    it("deletes a key without derivatives alone", async () => {
      await deleteObjectWithDerivatives(s3Service, cover);
      expect(deleteObjects).toHaveBeenCalledWith([cover]);
    });
  });
});
