export const eventWithCallerAccessInclude = (userId: string) =>
  ({
    eventAccesses: { where: { userId } },
  }) as const;

export type EventWithCallerAccessInclude = ReturnType<typeof eventWithCallerAccessInclude>;
