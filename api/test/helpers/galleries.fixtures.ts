import { Gallery } from "generated/prisma/client";
import { DEFAULT_GALLERY_NAME } from "src/galleries/galleries.constants";
import { TEST_EVENT_ID } from "./events.fixtures";
import { TEST_NOW } from "./users.fixtures";

export const TEST_GALLERY_ID = "aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa";

export const buildGallery = (overrides: Partial<Gallery> = {}): Gallery => ({
  id: TEST_GALLERY_ID,
  eventId: TEST_EVENT_ID,
  name: DEFAULT_GALLERY_NAME,
  createdAt: TEST_NOW,
  updatedAt: TEST_NOW,
  ...overrides,
});

export const expectedGalleryResponse = (gallery: Gallery) => ({
  id: gallery.id,
  eventId: gallery.eventId,
  name: gallery.name,
  createdAt: gallery.createdAt.toISOString(),
  updatedAt: gallery.updatedAt.toISOString(),
});
