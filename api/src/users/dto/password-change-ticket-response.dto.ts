import { ApiProperty } from "@nestjs/swagger";

export class PasswordChangeTicketResponseDto {
  @ApiProperty({
    description: "Auth0-hosted password change URL. Open in the system browser; do not embed in a WebView.",
    example: "https://your-tenant.us.auth0.com/u/reset-verify?ticket=…",
  })
  ticketUrl: string;
}
