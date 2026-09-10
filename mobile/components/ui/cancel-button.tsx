import AppButton from "./app-button";

type CancelButtonProps = {
  onPress: () => void;
};

const CancelButton = ({ onPress }: CancelButtonProps) => (
  <AppButton
    text="Cancel"
    onPress={onPress}
    disabled={false}
    loading={false}
    bgClasses="bg-ui-surface border border-ui-border dark:bg-dark-surface dark:border-dark-border"
    textClasses="text-text-muted dark:text-dark-text-muted font-medium text-base"
  />
);

export default CancelButton;
