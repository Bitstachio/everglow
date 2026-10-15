import { type ReactNode } from "react";
import { Text, type TextProps } from "react-native";

type PencilNoteProps = Omit<TextProps, "children"> & {
  children: ReactNode;
  /** `pencil` for a note on the ground; `ink` for details written on paper. Default: pencil. */
  tone?: "pencil" | "ink";
  className?: string;
};

/**
 * Handwriting in Nanum Pen Script. At most one pencil note per screen, and
 * never the only place a fact appears: the note repeats what the screen says.
 */
export const PencilNote = ({ children, tone = "pencil", className = "", ...props }: PencilNoteProps) => (
  <Text
    className={["font-hand", tone === "pencil" ? "text-note text-pencil" : "text-filled-in text-ink-blue", className]
      .filter(Boolean)
      .join(" ")}
    {...props}
  >
    {children}
  </Text>
);
