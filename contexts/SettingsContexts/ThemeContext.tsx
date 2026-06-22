import { setStatusBarStyle } from "expo-status-bar";
import { createContext, useEffect, useState } from "react";
import { useMMKVBoolean, useMMKVString } from "react-native-mmkv";

import Themes, {
  DEFAULT_THEME,
  CustomTheme,
  NEW_CUSTOM_THEME,
} from "../../constants/Themes";
import { getCustomTheme } from "../../db/functions/CustomThemes";
import { ColorSchemeName, useColorScheme } from "react-native";

const initialThemeContext = {
  systemColorScheme: "light" as "light" | "dark",
  lightTheme: DEFAULT_THEME.key,
  darkTheme: DEFAULT_THEME.key,
  currentTheme: DEFAULT_THEME.key,
  setCurrentTheme: (_: string, _colorScheme: "light" | "dark" = "light") => {},
  useDifferentDarkTheme: false,
  setUseDifferentDarkTheme: (_: boolean) => {},
  theme: DEFAULT_THEME,
  baseTheme: DEFAULT_THEME,
  cantUseTheme: (_: string) => false,
  customThemeData: NEW_CUSTOM_THEME,
  setCustomThemeData: (_: CustomTheme) => {},
};

export const ThemeContext = createContext(initialThemeContext);

export function ThemeProvider({ children }: React.PropsWithChildren) {
  const scheme = useColorScheme();
  const systemColorScheme = scheme === "unspecified" ? "light" : scheme;

  const [storedCurrentTheme, setStoredTheme] = useMMKVString("theme");
  const [storedDarkTheme, setStoredDarkTheme] = useMMKVString("darkTheme");

  const [customThemeData, setCustomThemeData] = useState(
    initialThemeContext.customThemeData,
  );

  const [storedUseDifferentDarkTheme, setUseDifferentDarkTheme] =
    useMMKVBoolean("useDifferentDarkTheme");
  const useDifferentDarkTheme =
    storedUseDifferentDarkTheme ?? initialThemeContext.useDifferentDarkTheme;

  const lightTheme = storedCurrentTheme ?? initialThemeContext.currentTheme;
  const darkTheme = storedDarkTheme ?? initialThemeContext.currentTheme;
  const currentTheme =
    (systemColorScheme === "light" || !useDifferentDarkTheme
      ? storedCurrentTheme
      : storedDarkTheme) ?? initialThemeContext.currentTheme;

  // Every theme is free, so any theme can always be used.
  const cantUseTheme = (_themeKey: string) => false;

  const setCurrentTheme = (
    themeKey: string,
    colorScheme: ColorSchemeName | undefined = useDifferentDarkTheme
      ? systemColorScheme
      : "unspecified",
  ) => {
    if (colorScheme === "unspecified" || colorScheme === "light") {
      setStoredTheme(themeKey);
    } else {
      setStoredDarkTheme(themeKey);
    }
  };

  let theme = DEFAULT_THEME;
  let baseTheme = DEFAULT_THEME;
  if (currentTheme in Themes) {
    theme = Themes[currentTheme as keyof typeof Themes];
    baseTheme = Themes[currentTheme as keyof typeof Themes];
  } else {
    const customTheme = getCustomTheme(currentTheme);
    if (customTheme && customTheme.extends in Themes) {
      theme = {
        ...Themes[customTheme.extends as keyof typeof Themes],
        ...customTheme,
        isPro: true,
      };
    }
  }
  theme = { ...theme, ...customThemeData };

  useEffect(() => {
    setStatusBarStyle(theme.statusBar);
  }, [theme.statusBar]);

  return (
    <ThemeContext.Provider
      value={{
        systemColorScheme,
        lightTheme,
        darkTheme,
        currentTheme,
        setCurrentTheme,
        useDifferentDarkTheme,
        setUseDifferentDarkTheme,
        theme,
        baseTheme,
        cantUseTheme,
        customThemeData,
        setCustomThemeData,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
