import { createPrismaAbility, PrismaQuery, Subjects } from "@casl/prisma";
import { Event, EventAccess, Gallery, Photo, User } from "generated/prisma/client";
import { EventAction } from "src/events/events.abilities";
import { GalleryAction } from "src/galleries/galleries.abilities";
import { PhotoAction } from "src/photos/photos.abilities";

export type AbilityUserContext = {
  id: string;
  isOnboarded: boolean;
};

export type AppSubjects = Subjects<{
  User: User;
  Event: Event;
  EventAccess: EventAccess;
  Gallery: Gallery;
  Photo: Photo;
}>;

export type AppAction = EventAction | GalleryAction | PhotoAction;

export type AppAbility = ReturnType<typeof createPrismaAbility<[AppAction, AppSubjects], PrismaQuery>>;
