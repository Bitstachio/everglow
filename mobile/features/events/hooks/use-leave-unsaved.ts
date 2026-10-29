import { useNavigation } from "expo-router";
import { usePreventRemove, type NavigationAction } from "expo-router/react-navigation";
import { useRef, useState } from "react";
import { Keyboard } from "react-native";

/**
 * 04.7 Leave unsaved: with anything filled in, leaving the new roll by the
 * close button, a swipe or the system back asks first. Once the roll is
 * loaded, `allowLeave` lets the screen go without asking.
 */
export const useLeaveUnsaved = (hasDraft: boolean) => {
  const navigation = useNavigation();
  const pending = useRef<NavigationAction | null>(null);
  const leaving = useRef(false);
  const [visible, setVisible] = useState(false);

  usePreventRemove(hasDraft, ({ data }) => {
    if (leaving.current) {
      navigation.dispatch(data.action);
      return;
    }
    Keyboard.dismiss();
    pending.current = data.action;
    setVisible(true);
  });

  return {
    visible,
    allowLeave: () => {
      leaving.current = true;
    },
    onKeepEditing: () => setVisible(false),
    onThrowAway: () => {
      setVisible(false);
      leaving.current = true;
      if (pending.current) navigation.dispatch(pending.current);
    },
  };
};
