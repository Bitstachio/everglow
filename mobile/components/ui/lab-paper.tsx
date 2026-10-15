import { type ReactNode } from "react";
import { Text, View } from "react-native";

/*
 * Shared parts of the lab's paper: the envelope, the ticket and the lab card.
 * Paper is the only light surface, and it always lies on the dark ground.
 */

type PaperProps = {
  children: ReactNode;
  /** Lay the paper slightly askew, like an object on a table. Default: left. */
  tilt?: "left" | "slight" | "right" | false;
  className?: string;
};

const TILT_CLASSES = { left: "-rotate-2", slight: "-rotate-1", right: "rotate-1" } as const;

export const Paper = ({ children, tilt = "left", className = "" }: PaperProps) => (
  <View
    className={["rounded-paper bg-paper px-5 pb-5 pt-5 shadow-paper", tilt ? TILT_CLASSES[tilt] : "", className]
      .filter(Boolean)
      .join(" ")}
  >
    {children}
  </View>
);

/** The printed head of a paper: what it is on the left, its number on the right, a rule beneath. */
export const PaperHead = ({ title, number }: { title: string; number?: string }) => (
  <View className="flex-row items-baseline justify-between border-b-2 border-paper-ink pb-2">
    <Text className="font-mono-semibold text-edge-print uppercase text-paper-ink">{title}</Text>
    {number ? <Text className="font-mono text-edge-print uppercase text-paper-ink-2">{number}</Text> : null}
  </View>
);

/** A printed label with a value filled in by hand, on a ruled line. */
export const PaperField = ({ label, value }: { label: string; value?: ReactNode }) => (
  <View className="flex-row items-baseline gap-3 border-b border-paper-rule pb-1 pt-2.5">
    <Text className="w-19 font-mono text-edge-print uppercase text-paper-ink-2">{label}</Text>
    <Text className="flex-1 font-hand text-filled-in text-ink-blue" numberOfLines={1}>
      {value ?? " "}
    </Text>
  </View>
);

/** A printed square box, empty or filled. */
export const PaperBox = ({ checked }: { checked: boolean }) => (
  <View className={`size-3.5 border-2 border-paper-ink ${checked ? "bg-paper-ink" : ""}`.trim()} />
);
