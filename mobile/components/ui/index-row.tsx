import { Pressable, View } from "react-native";
import { EdgePrint } from "./edge-print";

type IndexRowProps = {
  label: string;
  /** Edge print on the right: the current value, a count or a state. */
  value?: string;
  /** Opens the row; without it the row only shows its value. */
  onPress?: () => void;
  disabled?: boolean;
  /** The first row of an index: a heavier rule above it. */
  first?: boolean;
  /** A way out, such as Delete account: the label dims. */
  muted?: boolean;
  /** The value in full white, for a setting that is on. */
  lit?: boolean;
  /** Done on the spot, such as Sign out: no "›", since it opens nothing. */
  action?: boolean;
};

/**
 * One line of an index, like the back of a contact sheet: a label in edge
 * print on the left, its value on the right, "›" when it opens somewhere.
 */
export const IndexRow = ({
  label,
  value,
  onPress,
  disabled = false,
  first = false,
  muted = false,
  lit = false,
  action = false,
}: IndexRowProps) => {
  const arrow = Boolean(onPress) && !action;
  const className = [
    "flex-row items-center justify-between gap-4 border-b border-line py-4.25",
    first ? "border-t-2 border-t-text" : "",
    onPress ? "active:bg-sheet" : "",
    disabled ? "opacity-50" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const content = (
    <>
      {/* The label gets what the value leaves, so a long roll title shortens before its state does. */}
      <EdgePrint tone={muted ? "edge" : "text"} numberOfLines={1} className="flex-1">
        {label}
      </EdgePrint>
      {value || arrow ? (
        <EdgePrint tone={lit ? "text" : "edge"} numberOfLines={1} className="shrink">
          {[value, arrow ? "›" : null].filter(Boolean).join(" ")}
        </EdgePrint>
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={value ? `${label}, ${value}` : label} className={className}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={className}
    >
      {content}
    </Pressable>
  );
};
