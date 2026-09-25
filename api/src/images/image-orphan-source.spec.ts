import { OrphanSourceRegistry } from "src/storage/orphan-source.registry";
import { ImageOrphanSource } from "./image-orphan-source";
import { buildImageS3Key, IMAGE_ORPHAN_MIN_AGE_MS, IMAGE_UPLOAD_CONFIRM_WINDOW_SECONDS } from "./images.constants";

class ThingImageOrphanSource extends ImageOrphanSource {
  constructor(registry: OrphanSourceRegistry) {
    super("thing-images/", registry);
  }

  findReferencedKeys(): Promise<string[]> {
    return Promise.resolve([]);
  }
}

describe("ImageOrphanSource", () => {
  const ownerId = "11111111-1111-1111-1111-111111111111";
  const uploadId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  let registry: OrphanSourceRegistry;
  let source: ThingImageOrphanSource;

  beforeEach(() => {
    registry = new OrphanSourceRegistry();
    source = new ThingImageOrphanSource(registry);
  });

  it("registers itself on module init", () => {
    source.onModuleInit();

    expect(registry.getAll()).toEqual([source]);
  });

  // Uploads are stateless: an object waiting for its confirm has no row yet,
  // and only its age tells it apart from an abandoned one.
  it("never lets the reconciler near an upload that can still be confirmed", () => {
    expect(source.minObjectAgeMs).toBe(IMAGE_ORPHAN_MIN_AGE_MS);
    expect(source.minObjectAgeMs).toBeGreaterThan(IMAGE_UPLOAD_CONFIRM_WINDOW_SECONDS * 1000);
  });

  it("owns exactly the keys minted under its prefix", () => {
    expect(source.isOwnedKey(buildImageS3Key("thing-images/", ownerId, uploadId))).toBe(true);
  });

  it.each([
    `thing-images/${ownerId}`,
    `thing-images/${ownerId}/${uploadId}/extra`,
    `thing-images/${ownerId}/not-a-uuid`,
    `thing-images/README.txt`,
    `other-images/${ownerId}/${uploadId}`,
    `nested/thing-images/${ownerId}/${uploadId}`,
  ])("does not own %p", (key) => {
    expect(source.isOwnedKey(key)).toBe(false);
  });
});
