import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Slip } from "@/components/ui/slip";
import { registerThisDevice } from "../lib/device-registration";
import { markAskedAboutNotes, wasAskedAboutNotes } from "../lib/notes-asked";
import { askPushPermission, readPushPermission } from "../lib/push";

/**
 * 06.6: the one question, the first time someone joins a roll. Never at
 * launch. Only while the system has not been asked yet; after that, the
 * person decides in Settings.
 */
export const NotesAsk = () => {
  const { t } = useTranslation("join");
  const { arrival } = useLocalSearchParams<{ arrival?: string }>();
  const [visible, setVisible] = useState(false);
  const [isAsking, setIsAsking] = useState(false);

  useEffect(() => {
    if (arrival !== "joined" || wasAskedAboutNotes()) return;
    let cancelled = false;
    readPushPermission()
      .then((permission) => {
        if (!cancelled && permission === "undetermined") setVisible(true);
      })
      .catch(() => {
        // Can't tell: don't ask.
      });
    return () => {
      cancelled = true;
    };
  }, [arrival]);

  const close = () => {
    markAskedAboutNotes();
    setVisible(false);
  };

  const turnOn = async () => {
    setIsAsking(true);
    try {
      if (await askPushPermission()) await registerThisDevice();
    } catch {
      // Registration retries on the next launch.
    } finally {
      setIsAsking(false);
      close();
    }
  };

  return (
    <BottomSheet testID="notes-ask" visible={visible} onClose={close}>
      <Slip title={t("notes.title")} body={t("notes.body")}>
        <Button title={t("notes.turnOn")} mark="✓" onPress={() => void turnOn()} isLoading={isAsking} />
        <Button title={t("notes.notNow")} variant="secondary" onPress={close} disabled={isAsking} />
      </Slip>
    </BottomSheet>
  );
};
