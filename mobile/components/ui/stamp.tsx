import { Text, View } from "react-native";

type StampProps = {
  /** The stamped word, for example "Join". */
  title: string;
  /** The line under it, for example "The roll". */
  subtitle?: string;
  /** `stamp` on the invite; `pencil` for a returned envelope. Default: stamp. */
  tone?: "stamp" | "pencil";
  className?: string;
};

/**
 * A round rubber stamp. Decorative: it repeats the button or the reason in
 * the text beside it, so assistive tech skips it.
 */
export const Stamp = ({ title, subtitle, tone = "stamp", className = "" }: StampProps) => {
  const ink = tone === "stamp" ? "text-stamp" : "text-pencil";
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={[
        // A fixed 96pt, as drawn, so the words always fit inside the ring.
        "size-[96px] -rotate-12 items-center justify-center rounded-full border-3 px-2",
        tone === "stamp" ? "border-stamp" : "border-pencil",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        className={`font-mono-semibold text-leader-label uppercase ${ink}`}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          className={`font-mono text-frame-label uppercase ${ink}`}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
};
