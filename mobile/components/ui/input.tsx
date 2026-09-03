import React, { useState } from "react";
import { TextInput, TextInputProps, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useColorScheme } from "@/hooks/use-color-scheme";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  secureTextEntry?: boolean;
}

export const Input = ({ label, error, secureTextEntry, ...props }: InputProps) => {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  return (
    <View style={styles.container}>
      {label && <Text style={[styles.label, isDark ? styles.labelDark : styles.labelLight]}>{label}</Text>}
      <View style={styles.inputContainer}>
        <TextInput
          style={[styles.input, isDark ? styles.inputDark : styles.inputLight, error && styles.inputError]}
          placeholderTextColor={isDark ? "#9CA3AF" : "#6B7280"}
          secureTextEntry={secureTextEntry && !isPasswordVisible}
          {...props}
        />
        {secureTextEntry && (
          <TouchableOpacity style={styles.eyeButton} onPress={() => setIsPasswordVisible(!isPasswordVisible)}>
            <Text style={isDark ? styles.eyeDark : styles.eyeLight}>{isPasswordVisible ? "👁️" : "👁️‍🗨️"}</Text>
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    width: "100%",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  labelLight: {
    color: "#374151",
  },
  labelDark: {
    color: "#E5E7EB",
  },
  inputContainer: {
    position: "relative",
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  inputLight: {
    backgroundColor: "#FFFFFF",
    borderColor: "#D1D5DB",
    color: "#1F2937",
  },
  inputDark: {
    backgroundColor: "#1F2937",
    borderColor: "#374151",
    color: "#F3F4F6",
  },
  inputError: {
    borderColor: "#EF4444",
  },
  error: {
    color: "#EF4444",
    fontSize: 12,
    marginTop: 4,
  },
  eyeButton: {
    position: "absolute",
    right: 16,
    top: 12,
    padding: 4,
  },
  eyeLight: {
    fontSize: 20,
    opacity: 0.6,
  },
  eyeDark: {
    fontSize: 20,
    opacity: 0.8,
  },
});
