import { ExecutionContext } from "@nestjs/common";
import { ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { AuthenticatedUser } from "./auth.types";
import { CurrentUser } from "./current-user.decorator";

function getDecoratorFactory<T>(
  decorator: (...args: unknown[]) => ParameterDecorator,
): (data: unknown, ctx: ExecutionContext) => T {
  class TestHost {
    handler(@decorator() _value: unknown) {}
  }

  const metadata = Reflect.getMetadata(ROUTE_ARGS_METADATA, TestHost, "handler") as Record<
    string,
    { factory: (data: unknown, ctx: ExecutionContext) => T }
  >;

  return metadata[Object.keys(metadata)[0]].factory;
}

describe("CurrentUser", () => {
  const factory = getDecoratorFactory<AuthenticatedUser>(CurrentUser);

  const authenticatedUser: AuthenticatedUser = {
    id: "11111111-1111-1111-1111-111111111111",
    sub: "auth0|abc123",
  };

  function createExecutionContext(user: AuthenticatedUser): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as ExecutionContext;
  }

  it("returns the authenticated user from the request", () => {
    const ctx = createExecutionContext(authenticatedUser);

    const result = factory(undefined, ctx);

    expect(result).toBe(authenticatedUser);
  });

  it("ignores decorator data and still returns the request user", () => {
    const ctx = createExecutionContext(authenticatedUser);

    const result = factory("ignored-decorator-data", ctx);

    expect(result).toBe(authenticatedUser);
  });
});
