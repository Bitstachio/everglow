/** The roll just left, waiting to be read once when Home is shown. */
let pending: string | null = null;

export const noteLeftRoll = (title: string) => {
  pending = title;
};

export const takeLeftRoll = (): string | null => {
  const title = pending;
  pending = null;
  return title;
};
