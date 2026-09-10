import AppButton from "./app-button";

type PrimaryButtonProps = {
  text: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

const PrimaryButton = ({ text, onPress, disabled, loading }: PrimaryButtonProps) => (
  <AppButton
    text={text}
    onPress={onPress}
    disabled={disabled}
    loading={loading}
    bgClasses="bg-brand-primary dark:bg-brand-primary-dark"
    textClasses="text-white font-semibold text-base"
  />
);

export default PrimaryButton;
