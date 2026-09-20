import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import type { Control } from "react-hook-form";
import type { JoinEventValues } from "../hooks/use-join-event-form";
import { H2 } from "@/components/ui/heading";
import { ThemedText } from "@/components/ui/themed-text";
import { useEffect, useState } from "react";
import { Modal, View } from "react-native";
import QRButton from "./qr-button";
import QRScanner from "./qr-scanner";

type JoinEventModalProps = {
  visible: boolean;
  onClose: () => void;
  control: Control<JoinEventValues>;
  isSubmitting: boolean;
  onSubmit: () => void;
  onScan: (link: string) => void;
};

const JoinEventModal = ({ visible, onClose, control, isSubmitting, onSubmit, onScan }: JoinEventModalProps) => {
  const [scannerVisible, setScannerVisible] = useState(false);

  // Reset scanner state when modal closes
  useEffect(() => {
    if (!visible) {
      setScannerVisible(false);
    }
  }, [visible]);

  const handleScanSuccess = (data: string) => {
    setScannerVisible(false);
    onScan(data);
  };

  const handleOpenScanner = () => {
    if (!isSubmitting) setScannerVisible(true);
  };

  // If scanner is visible, don't show the join modal
  if (scannerVisible) {
    return <QRScanner visible={scannerVisible} onClose={() => setScannerVisible(false)} onScan={handleScanSuccess} />;
  }

  return (
    <Modal animationType="slide" visible={visible} transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/45">
        <View className="p-6 gap-5 rounded-2xl bg-ui-background dark:bg-dark-background">
          <View className="gap-1">
            <H2>Join an Event</H2>
            <ThemedText>Choose how you would like to join the event shared with you.</ThemedText>
          </View>

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

          <Button title="Cancel" onPress={onClose} variant="outline" disabled={isSubmitting} />
        </View>
      </View>
    </Modal>
  );
};

export default JoinEventModal;
