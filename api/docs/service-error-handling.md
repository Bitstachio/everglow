# Service Layer Error Handling Strategies

When a Prisma operation fails (e.g. record not found, unique constraint violation), the error needs to be caught and translated into a meaningful HTTP response. There are four main approaches, each with different tradeoffs.

---

## 1. Try/Catch in Individual Service Methods

Each service method wraps its Prisma call and catches `PrismaClientKnownRequestError` directly.

```ts
async update(id: string, dto: UpdateUserDto): Promise<User> {
  try {
    return await this.prisma.user.update({ where: { id }, data: dto });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      throw new NotFoundException(USER_SERVICE_ERRORS.NOT_FOUND(id));
    }
    throw e;
  }
}
```

**Pros**

- Single DB round trip
- Custom, contextual error messages

**Cons**

- Noisy boilerplate repeated across every method
- Easy to forget to re-throw unexpected errors
- Pollutes service logic with infrastructure concerns

---

## 2. Global Prisma Exception Filter

A NestJS `ExceptionFilter` intercepts `PrismaClientKnownRequestError` globally and maps known error codes to HTTP exceptions.

```ts
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const statusMap: Record<string, number> = {
      P2025: 404,
      P2002: 409,
    };

    const status = statusMap[exception.code] ?? 500;
    response.status(status).json({ message: "Database error", code: exception.code });
  }
}
```

**Pros**

- Zero boilerplate in service methods
- Single DB round trip
- Centralized Prisma error handling

**Cons**

- Error messages are generic — the filter has no domain context (no `id`, no resource name)
- All `P2025` errors produce the same message regardless of which entity was not found
- Couples HTTP layer behavior to Prisma internals globally

---

## 3. Double Round Trip with findOne Guard (Recommended)

A `findOne` method acts as a guard, throwing a `NotFoundException` before the mutating operation is attempted. If the record doesn't exist, it never reaches the update or delete.

```ts
async findOne(id: string): Promise<User> {
  const user = await this.prisma.user.findUnique({ where: { id } });

  if (!user) throw new NotFoundException(USER_SERVICE_ERRORS.NOT_FOUND(id));

  return user;
}

async update(id: string, dto: UpdateUserDto): Promise<User> {
  await this.findOne(id);
  return this.prisma.user.update({ where: { id }, data: dto });
}

async remove(id: string): Promise<void> {
  await this.findOne(id);
  await this.prisma.user.delete({ where: { id } });
}
```

**Pros**

- Clean, readable service logic
- Custom, contextual error messages
- No try/catch boilerplate
- `findOne` is reusable across methods

**Cons**

- Two DB round trips per mutating operation
- In practice, negligible for most operations (indexed primary key lookups are fast)

---

## 4. Hybrid: findOne Guard + Global Filter as Safety Net (Best of Both)

Use the `findOne` guard pattern as the primary strategy for expected failures, and add a global Prisma exception filter only as a fallback for unexpected errors.

```ts
// Global filter catches anything that slips through
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    // Generic fallback — should rarely be hit
    response.status(500).json({ message: "Unexpected database error" });
  }
}
```

**Pros**

- Expected failures handled explicitly with meaningful messages
- Unexpected Prisma errors still produce a clean 500 rather than leaking stack traces
- Service layer stays readable

**Cons**

- Slight overhead of the extra round trip (acceptable for the clarity gained)

---

## Summary

| Approach                         | Round Trips | Custom Messages | Boilerplate |
| -------------------------------- | ----------- | --------------- | ----------- |
| Try/catch per method             | 1           | Yes             | High        |
| Global exception filter          | 1           | No              | None        |
| findOne guard                    | 2           | Yes             | Low         |
| findOne + global filter (hybrid) | 2           | Yes             | Low         |

For most applications, the hybrid approach is the right default. The double round trip is not a meaningful performance concern for typical user profile operations, and the readability and expressiveness of explicit service-layer error handling outweighs the cost of the extra query.
