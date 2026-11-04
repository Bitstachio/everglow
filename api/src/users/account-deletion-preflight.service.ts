import { Injectable } from "@nestjs/common";
import { PinoLogger } from "nestjs-pino";
import { ApiException } from "src/common/errors/api.exception";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { AppleSiwaService } from "src/sdk/apple/apple-siwa.service";
import { ACCOUNT_DELETION_SCOPES, APPLE_ACCOUNT_DELETION_SCOPES } from "src/sdk/auth0/auth0-management.constants";
import { Auth0ManagementService } from "src/sdk/auth0/auth0-management.service";
import { isAppleProviderSub } from "./users.constants";

/** Why a deletion could not finish right now, for the log line. */
export type AccountDeletionBlocker =
  | "auth0_credentials_missing"
  | "auth0_token_refused"
  | "auth0_probe_failed"
  | "auth0_scope_missing"
  | "apple_unconfigured"
  | "apple_key_unusable";

/**
 * Checks that a deletion can finish before anything about it is written
 * (docs/account-deletion.md §7). The saga's irreversible steps come before its
 * external ones, so a deletion that starts and then finds Auth0 or Apple
 * unusable strands the person: rolls gone, login still there, account locked.
 * Checking first turns that into a 503 with nothing changed.
 *
 * What it checks is what fails for reasons no retry fixes: the management
 * credentials, the token they get and its scopes, and for an Apple identity
 * the Sign in with Apple key. An Auth0 or Apple outage after the check is
 * still possible, and the saga resumes from where it stopped.
 */
@Injectable()
export class AccountDeletionPreflightService {
  constructor(
    private readonly auth0Management: Auth0ManagementService,
    private readonly appleSiwa: AppleSiwaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  /** Throws 503 ACCOUNT_DELETION_UNAVAILABLE when the deletion could not finish. */
  async assertCanFinish(user: { id: string; providerSub: string; auth0DeletedAt: Date | null }): Promise<void> {
    // Auth0 already cleared: only database work is left.
    if (user.auth0DeletedAt) return;

    const apple = isAppleProviderSub(user.providerSub);
    const blockers: AccountDeletionBlocker[] = [];
    let missingScopes: string[] | undefined;

    const access = await this.auth0Management.checkAccess(
      apple ? APPLE_ACCOUNT_DELETION_SCOPES : ACCOUNT_DELETION_SCOPES,
    );
    if (!access.ok) {
      blockers.push(`auth0_${access.reason}`);
      if (access.reason === "scope_missing") missingScopes = access.missingScopes;
    }
    if (apple) {
      const problem = this.appleSiwa.revocationProblem();
      if (problem) blockers.push(`apple_${problem}`);
    }
    if (blockers.length === 0) return;

    this.logger.error(
      { event: ALERT_EVENTS.ACCOUNT_DELETION_UNAVAILABLE, userId: user.id, blockers, missingScopes, apple },
      "Account deletion refused before it started: it could not have finished",
    );
    throw new ApiException("ACCOUNT_DELETION_UNAVAILABLE");
  }
}
