import CancelButton from "@/components/ui/AppButton/CancelButton/CancelButton";
import PrimaryButton from "@/components/ui/AppButton/PrimaryButton/PrimaryButton";
import AppTextInput from "@/components/ui/AppTextInput/AppTextInput";
import { H2 } from "@/components/ui/ThemedText/Heading/Heading";
import { ThemedText } from "@/components/ui/ThemedText/ThemedText";
import { useEffect, useState } from "react";
import { Modal, View } from "react-native";
import { useJoinEventModal } from "../../hooks/useJoinEventModal";
import QRButton from "../QRButton/QRButton";
import QRScanner from "../QRScanner/QRScanner";

type JoinEventModalProps = {
  visible: boolean;
  onClose: () => void;
  onJoinLink: (link: string) => void;
};

const JoinEventModal = ({ visible, onClose, onJoinLink }: JoinEventModalProps) => {
  const { inviteLink, error, handleInviteLinkChange, handleInviteLinkSubmit } = useJoinEventModal(visible, onJoinLink);
  const [scannerVisible, setScannerVisible] = useState(false);

  // Reset scanner state when modal closes
  useEffect(() => {
    if (!visible) {
      setScannerVisible(false);
    }
  }, [visible]);

  const handleScanSuccess = (data: string) => {
    setScannerVisible(false);
    // Close the join modal and pass the scanned data
    onClose();
    onJoinLink(data);
  };

  const handleOpenScanner = () => {
    setScannerVisible(true);
  };

  // If scanner is visible, don't show the join modal
  if (scannerVisible) {
    return <QRScanner visible={scannerVisible} onClose={() => setScannerVisible(false)} onScan={handleScanSuccess} />;
  }

  return (
    <Modal animationType="slide" visible={visible} transparent>
      <View className="flex-1 justify-end bg-black/45">
        <View className="p-6 gap-5 rounded-2xl bg-ui-background dark:bg-dark-background">
          <View className="gap-1">
            <H2>Join an Event</H2>
            <ThemedText>Choose how you'd like to join the event shared with you.</ThemedText>
          </View>

          <QRButton onPress={handleOpenScanner} />

          <View className="gap-2">
            <ThemedText>Or paste the invite link</ThemedText>
            <AppTextInput
              value={inviteLink}
              placeholder="https://events.everglow.app/invite/example123"
              onChangeText={handleInviteLinkChange}
            />
            {error ? <ThemedText className="text-red-500">{error}</ThemedText> : null}
            <PrimaryButton text="Join with Link" onPress={handleInviteLinkSubmit} />
          </View>

          <CancelButton onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
};

export default JoinEventModal;
