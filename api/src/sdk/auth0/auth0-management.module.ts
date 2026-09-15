import { Global, Module } from "@nestjs/common";
import { Auth0ManagementService } from "./auth0-management.service";

@Global()
@Module({
  providers: [Auth0ManagementService],
  exports: [Auth0ManagementService],
})
export class Auth0ManagementModule {}
