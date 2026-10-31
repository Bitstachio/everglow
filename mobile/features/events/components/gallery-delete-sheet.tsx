import { useTranslation } from "react-i18next";
import { BottomSheet } from "@/components/ui/bottom-sheet/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Slip } from "@/components/ui/slip";
import type { PhotoResponseDto } from "../types";

export const GalleryDeleteSheet = ({
  targets,
  busy,
  onClose,
  onConfirm,
}: {
  targets: PhotoResponseDto[] | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) => {
  const { t } = useTranslation("roll");
  return (
    <BottomSheet visible={!!targets?.length} onClose={onClose}>
      <Slip title={t("gallery.deleteTitle", { count: targets?.length ?? 0 })} body={t("gallery.deleteBody")}>
        <Button title={t("viewer.deleteConfirm")} variant="danger" isLoading={busy} onPress={onConfirm} />
        <Button title={t("viewer.deleteCancel")} variant="secondary" disabled={busy} onPress={onClose} />
      </Slip>
    </BottomSheet>
  );
};
