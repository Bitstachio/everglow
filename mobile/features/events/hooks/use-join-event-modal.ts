import { useEffect, useState } from "react";

export const useJoinEventModal = (visible: boolean, onJoinLink: (link: string) => void) => {
  const [inviteLink, setInviteLink] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setInviteLink("");
      setError(null);
    }
  }, [visible]);

  const handleInviteLinkChange = (text: string) => {
    setInviteLink(text);
    setError(null);
  };

  const handleInviteLinkSubmit = () => {
    if (!inviteLink.trim()) {
      setError("Please paste the invitation URL.");
      return;
    }
    onJoinLink(inviteLink.trim());
  };

  return {
    inviteLink,
    error,
    handleInviteLinkChange,
    handleInviteLinkSubmit,
  };
};
