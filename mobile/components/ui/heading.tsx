import { ThemedText } from "./themed-text";

type HeadingProps = {
  children: string;
};

export const H1 = ({ children }: HeadingProps) => <ThemedText className="text-2xl font-bold">{children}</ThemedText>;

export const H2 = ({ children }: HeadingProps) => <ThemedText className="text-xl font-bold">{children}</ThemedText>;

export const H3 = ({ children }: HeadingProps) => <ThemedText className="text-lg font-bold">{children}</ThemedText>;
