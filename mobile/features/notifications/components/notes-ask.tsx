import { useEffect, useEffectEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Slip } from "@/components/ui/slip";
import { requestNotificationPermission } from "../lib/notification-permission";
import { mayOfferNotes, rememberNotNow } from "../lib/notes-offer";
import { readPushPermission } from "../lib/push";

type NotesAskProps = {
  /** The person just joined this roll from an envelope. */
  justJoined: boolean;
  /** The arrival note ("You're on the roll · 25th"), printed on the slip's edge. */
  edge?: string | null;
  /** The slip opened or closed, so the roll can hide its own arrival note meanwhile. */
  onVisibleChange?: (visible: boolean) => void;
};

/**
 * 06.6: asks about notes when someone joins a roll. Never at launch, and only
 * while the system has not asked yet; once it has, the person decides in
 * Settings. After "Not now", a join 30 days later offers it again: until the
 * app has asked, iOS has no Notifications row in Settings to turn it on with.
 */
export const NotesAsk = ({ justJoined, edge, onVisibleChange }: NotesAskProps) => {
  const { t } = useTranslation("join");
  const [visible, setVisible] = useState(false);
  const [isAsking, setIsAsking] = useState(false);
  // Kept from the moment it opens: the roll's arrival note goes after a few seconds, the slip stays.
  const [edgeLabel, setEdgeLabel] = useState<string | undefined>();

  const show = (next: boolean) => {
    setVisible(next);
    onVisibleChange?.(next);
  };
  const open = useEffectEvent(() => {
    setEdgeLabel(edge ?? undefined);
    show(true);
  });

  useEffect(() => {
    if (!justJoined || !mayOfferNotes()) return;
    let cancelled = false;
    readPushPermission()
      .then((permission) => {
        if (!cancelled && permission === "undetermined") open();
      })
      .catch(() => {
        // Can't tell: don't ask.
      });
    return () => {
      cancelled = true;
    };
  }, [justJoined]);

  const notNow = () => {
    rememberNotNow();
    show(false);
  };

  const turnOn = async () => {
    setIsAsking(true);
    try {
      // Allowed: this phone registers on its own (use-push-registration).
      await requestNotificationPermission();
    } catch {
      // The system couldn't ask: the next join may.
    } finally {
      setIsAsking(false);
      show(false);
    }
  };

  return (
    <BottomSheet testID="notes-ask" visible={visible} onClose={notNow}>
      <Slip edge={edgeLabel} title={t("notes.title")} body={t("notes.body")}>
        <Button title={t("notes.turnOn")} mark="✓" onPress={() => void turnOn()} isLoading={isAsking} />
        <Button title={t("notes.notNow")} variant="ghost" onPress={notNow} disabled={isAsking} />
      </Slip>
    </BottomSheet>
  );
};
