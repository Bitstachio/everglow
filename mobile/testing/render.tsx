import { I18nProvider } from "@/providers/i18n-provider";
import { render, type RenderOptions } from "@testing-library/react-native";
import type { ReactElement } from "react";

/** RNTL render wrapped with the app i18n instance (required for `useTranslation`). */
export const renderWithI18n = (ui: ReactElement, options?: RenderOptions) =>
  render(ui, {
    ...options,
    wrapper: ({ children }) => {
      const Outer = options?.wrapper;
      return <I18nProvider>{Outer ? <Outer>{children}</Outer> : children}</I18nProvider>;
    },
  });
