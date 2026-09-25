import { createPrismaAbility, PrismaQuery, Subjects } from "@casl/prisma";
import { Event, EventAccess, Photo, Report, User } from "generated/prisma/client";
import { EventAction } from "src/events/events.abilities";
import { ReportAction } from "src/moderation/reports.abilities";
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
  Report: Report;
}>;

export type AppAction = EventAction | PhotoAction | ReportAction;

export type AppAbility = ReturnType<typeof createPrismaAbility<[AppAction, AppSubjects], PrismaQuery>>;
