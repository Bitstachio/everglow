import { AbilityBuilder } from "@casl/ability";
import { createPrismaAbility } from "@casl/prisma";
import { Injectable } from "@nestjs/common";
import { defineEventAbilities } from "src/events/events.abilities";
import { defineGalleryAbilities } from "src/galleries/galleries.abilities";
import { AbilityUserContext, AppAbility } from "./ability.types";

@Injectable()
export class AbilityFactory {
  createForUser(user: AbilityUserContext): AppAbility {
    const { can, build } = new AbilityBuilder<AppAbility>(createPrismaAbility);

    defineEventAbilities(can, user);
    defineGalleryAbilities(can, user);

    return build();
  }
}
