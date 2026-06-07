import { AbilityBuilder } from "@casl/ability";
import { createPrismaAbility, PrismaQuery, Subjects } from "@casl/prisma";
import { Injectable } from "@nestjs/common";
import type { User } from "../../generated/prisma/client.js";

export type AppSubjects = Subjects<{
  User: User;
}>;

export type AppAbility = ReturnType<typeof createPrismaAbility<[string, AppSubjects], PrismaQuery>>;

@Injectable()
export class AbilityFactory {
  // Commented out variables for this PR to avoid lint errors
  createForUser(/*user: User*/) {
    const { /* can ,*/ build } = new AbilityBuilder<AppAbility>(createPrismaAbility);

    // TODO: Set up permissions

    return build();
  }
}
