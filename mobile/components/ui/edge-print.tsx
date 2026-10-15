import { type ReactNode } from "react";
import { Text, type TextProps } from "react-native";

type EdgePrintSize = "edge" | "frame-label";
type EdgePrintTone = "edge" | "text" | "pencil" | "paper";

type EdgePrintProps = Omit<TextProps, "children"> & {
  children: ReactNode;
  /** `edge` for metadata lines, `frame-label` under frames. Default: edge. */
  size?: EdgePrintSize;
  tone?: EdgePrintTone;
  className?: string;
};

const SIZE_CLASSES: Record<EdgePrintSize, string> = {
  edge: "text-edge-print",
  "frame-label": "text-frame-label",
};

const TONE_CLASSES: Record<EdgePrintTone, string> = {
  edge: "text-edge",
  text: "text-text",
  pencil: "text-pencil",
  paper: "text-paper-ink-2",
};

/**
 * Metadata printed like a film's edge: IBM Plex Mono, uppercase, tracked.
 * Counts, dates, frame numbers and labels. Wrap the key value in `EdgeValue`.
 */
export const EdgePrint = ({ children, size = "edge", tone = "edge", className = "", ...props }: EdgePrintProps) => (
  <Text className={`font-mono uppercase ${SIZE_CLASSES[size]} ${TONE_CLASSES[tone]} ${className}`.trim()} {...props}>
    {children}
  </Text>
);

/** The value inside an edge-print line, brighter and heavier: "1.2 / 3 GB". */
export const EdgeValue = ({ children }: { children: ReactNode }) => (
  <Text className="font-mono-semibold text-text">{children}</Text>
);
