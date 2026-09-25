import { OrphanSource, OrphanSourceRegistry } from "./orphan-source.registry";
import { ORPHAN_SOURCE_ERRORS } from "./storage.constants";

describe("OrphanSourceRegistry", () => {
  let registry: OrphanSourceRegistry;

  const sourceFor = (prefix: string): OrphanSource => ({
    prefix,
    isOwnedKey: () => true,
    findReferencedKeys: () => Promise.resolve([]),
  });

  beforeEach(() => {
    registry = new OrphanSourceRegistry();
  });

  it("starts empty and returns sources in registration order", () => {
    expect(registry.getAll()).toEqual([]);

    const photos = sourceFor("photos/");
    const avatars = sourceFor("avatars/");
    registry.register(photos);
    registry.register(avatars);

    expect(registry.getAll()).toEqual([photos, avatars]);
  });

  // Without the trailing slash "photos" would also list "photos-archive/...".
  it.each(["", "photos", "photos/nested"])("rejects the prefix %p, which does not end with a slash", (prefix) => {
    expect(() => registry.register(sourceFor(prefix))).toThrow(ORPHAN_SOURCE_ERRORS.INVALID_PREFIX(prefix));
  });

  it("rejects a prefix that is already registered", () => {
    registry.register(sourceFor("photos/"));

    expect(() => registry.register(sourceFor("photos/"))).toThrow(
      ORPHAN_SOURCE_ERRORS.OVERLAPPING_PREFIX("photos/", "photos/"),
    );
  });

  // Either nesting would list the same objects under two sources and judge
  // them against the wrong table.
  it.each([
    ["photos/", "photos/covers/"],
    ["photos/covers/", "photos/"],
  ])("rejects %p once %p is registered", (prefix, existing) => {
    registry.register(sourceFor(existing));

    expect(() => registry.register(sourceFor(prefix))).toThrow(
      ORPHAN_SOURCE_ERRORS.OVERLAPPING_PREFIX(prefix, existing),
    );
    expect(registry.getAll()).toHaveLength(1);
  });
});
