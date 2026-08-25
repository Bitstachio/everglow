import { createPrismaAbility, PrismaQuery, Subjects } from "@casl/prisma";
import { Event, EventAccess, Photo, User } from "generated/prisma/client";
import { EventAction } from "src/events/events.abilities";
import { PhotoAction } from "src/photos/photos.abilities";

export type AbilityUserContext = {
  id: string;
  isOnboarded: boolean;
};

export type AppSubjects = Subjects<{
  User: User;
  Event: Event;
  EventAccess: EventAccess;
  Photo: Photo;
}>;

export type AppAction = EventAction | PhotoAction;

export type AppAbility = ReturnType<typeof createPrismaAbility<[AppAction, AppSubjects], PrismaQuery>>;
