import { AbilityBuilder } from "@casl/ability";
import { createPrismaAbility } from "@casl/prisma";
import { Injectable } from "@nestjs/common";
import { defineEventAbilities } from "src/events/events.abilities";
import { defineGalleryAbilities } from "src/galleries/galleries.abilities";
import { definePhotoAbilities } from "src/photos/photos.abilities";
import { PrismaService } from "src/prisma/prisma.service";
import { userWithDetailsInclude } from "src/users/users.types";
import { AbilityUserContext, AppAbility } from "./ability.types";

@Injectable()
export class AbilityFactory {
  constructor(private readonly prisma: PrismaService) {}

  createForUser(user: AbilityUserContext): AppAbility {
    const { can, build } = new AbilityBuilder<AppAbility>(createPrismaAbility);

    defineEventAbilities(can, user);
    defineGalleryAbilities(can, user);
    definePhotoAbilities(can, user);

    return build();
  }

  async createForCaller(callerId: string): Promise<AppAbility> {
    const isOnboarded = await this.isUserOnboarded(callerId);
    return this.createForUser({ id: callerId, isOnboarded });
  }

  private async isUserOnboarded(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: userWithDetailsInclude,
    });

    return !!user?.details;
  }
}
