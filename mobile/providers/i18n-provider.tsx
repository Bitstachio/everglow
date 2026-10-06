import i18n from "@/i18n";
import { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

type I18nProviderProps = {
  children: ReactNode;
};

/** Supplies the shared i18next instance to the React tree (and tests that wrap with it). */
export const I18nProvider = ({ children }: I18nProviderProps) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);
