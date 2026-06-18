import { createPrismaAbility, PrismaQuery, Subjects } from "@casl/prisma";
import { Event, EventAccess, User } from "generated/prisma/client";
import { EventAction } from "src/events/events.abilities";

export type AbilityUserContext = {
  id: string;
  isOnboarded: boolean;
};

export type AppSubjects = Subjects<{
  User: User;
  Event: Event;
  EventAccess: EventAccess;
}>;

export type AppAction = EventAction;

export type AppAbility = ReturnType<typeof createPrismaAbility<[AppAction, AppSubjects], PrismaQuery>>;
