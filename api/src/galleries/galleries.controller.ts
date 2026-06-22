import { Controller, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags, ApiUnauthorizedResponse } from "@nestjs/swagger";
import { JwtAuthGuard } from "src/auth/jwt-auth.guard";
import { GalleriesService } from "./galleries.service";

@ApiTags("galleries")
@ApiBearerAuth("access-token")
@Controller()
@UseGuards(JwtAuthGuard)
@ApiUnauthorizedResponse({ description: "Missing or invalid access token" })
export class GalleriesController {
  constructor(private readonly galleriesService: GalleriesService) {}
}
