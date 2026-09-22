import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { ThemedText } from "@/components/ui/themed-text";
import type { Control } from "react-hook-form";
import type { JoinEventValues } from "../types";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { QRButton } from "./qr-button";
import { QRScanner } from "./qr-scanner";

type JoinEventSheetProps = {
  visible: boolean;
  onClose: () => void;
  control: Control<JoinEventValues>;
  isSubmitting: boolean;
  onSubmit: () => void;
  onScan: (link: string) => void;
};

export const JoinEventSheet = ({ visible, onClose, control, isSubmitting, onSubmit, onScan }: JoinEventSheetProps) => {
  const [scannerVisible, setScannerVisible] = useState(false);

  // Reset scanner state when the sheet closes
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- clear transient scanner when parent hides sheet */
    if (!visible) {
      setScannerVisible(false);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [visible]);

  const handleClose = () => {
    if (!isSubmitting) onClose();
  };

  const handleScanSuccess = (data: string) => {
    setScannerVisible(false);
    onScan(data);
  };

  const handleOpenScanner = () => {
    if (!isSubmitting) setScannerVisible(true);
  };

  // If scanner is visible, don't show the join sheet
  if (scannerVisible) {
    return <QRScanner visible={scannerVisible} onClose={() => setScannerVisible(false)} onScan={handleScanSuccess} />;
  }

  return (
    <BottomSheet
      testID="join-event-sheet"
      visible={visible}
      onClose={handleClose}
      title="Join an Event"
      dismissAccessibilityLabel="Dismiss join event"
      closeAccessibilityLabel="Close join event"
    >
      <ThemedText>Choose how you would like to join the event shared with you.</ThemedText>

      <QRButton onPress={handleOpenScanner} />

      <View className="gap-2">
        <ThemedText>Or paste the invite link</ThemedText>
        <FormField
          control={control}
          name="invitationUrl"
          placeholder="https://events.everglow.app/invite/example123"
          accessibilityLabel="Invitation URL or token"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!isSubmitting}
          onSubmitEditing={onSubmit}
          returnKeyType="go"
        />
        <Button title="Join with Link" onPress={onSubmit} isLoading={isSubmitting} disabled={isSubmitting} />
      </View>
    </BottomSheet>
  );
};
