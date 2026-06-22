import { createPrismaAbility, PrismaQuery, Subjects } from "@casl/prisma";
import { Event, EventAccess, Gallery, User } from "generated/prisma/client";
import { EventAction } from "src/events/events.abilities";
import { GalleryAction } from "src/galleries/galleries.abilities";

export type AbilityUserContext = {
  id: string;
  isOnboarded: boolean;
};

export type AppSubjects = Subjects<{
  User: User;
  Event: Event;
  EventAccess: EventAccess;
  Gallery: Gallery;
}>;

export type AppAction = EventAction | GalleryAction;

export type AppAbility = ReturnType<typeof createPrismaAbility<[AppAction, AppSubjects], PrismaQuery>>;
