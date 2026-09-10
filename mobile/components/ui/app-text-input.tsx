import { TextInput } from "react-native";

type AppTextInputProps = {
  value: string;
  placeholder?: string;
  onChangeText: (text: string) => void;
};

const AppTextInput = ({ value, placeholder = "", onChangeText }: AppTextInputProps) => (
  <TextInput
    value={value}
    placeholder={placeholder}
    onChangeText={onChangeText}
    placeholderTextColor="currentColor"
    autoCapitalize="none"
    autoCorrect={false}
    className="
      border border-ui-border 
      rounded-xl 
      px-4 py-3 
      text-base text-text-main 
      dark:border-dark-border 
      dark:text-dark-text 
      dark:placeholder:text-dark-text-muted
    "
  />
);

export default AppTextInput;
