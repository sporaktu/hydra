import { useContext } from "react";
import { ThemeContext } from "../contexts/SettingsContexts/ThemeContext";

export function useSetTheme() {
  const { useDifferentDarkTheme, systemColorScheme, setCurrentTheme } =
    useContext(ThemeContext);

  return (
    themeKey: string,
    colorScheme: "light" | "dark" | undefined = useDifferentDarkTheme
      ? systemColorScheme
      : undefined,
  ) => {
    setCurrentTheme(themeKey, colorScheme);
  };
}
