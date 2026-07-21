import { createContext, useCallback, useMemo } from "react";
import { useMMKVBoolean } from "react-native-mmkv";

const initialValues = {
  showUsername: true,
  hideTabsOnScroll: false,
};

const initialTabSettingsContext = {
  ...initialValues,
  toggleShowUsername: (_newValue?: boolean) => {},
  toggleHideTabsOnScroll: (_newValue?: boolean) => {},
};

export const TabSettingsContext = createContext(initialTabSettingsContext);

export function TabSettingsProvider({ children }: React.PropsWithChildren) {
  const [storedShowUsername, setShowUsername] = useMMKVBoolean("showUsername");
  const showUsername = storedShowUsername ?? initialValues.showUsername;

  const [storedHideTabsOnScroll, setHideTabsOnScroll] =
    useMMKVBoolean("hideTabsOnScroll");
  const hideTabsOnScroll =
    storedHideTabsOnScroll ?? initialValues.hideTabsOnScroll;

  const toggleShowUsername = useCallback(
    (newValue = !showUsername) => setShowUsername(newValue),
    [showUsername, setShowUsername],
  );

  const toggleHideTabsOnScroll = useCallback(
    (newValue = !hideTabsOnScroll) => setHideTabsOnScroll(newValue),
    [hideTabsOnScroll, setHideTabsOnScroll],
  );

  const value = useMemo(
    () => ({
      showUsername: showUsername ?? initialValues.showUsername,
      toggleShowUsername,
      hideTabsOnScroll,
      toggleHideTabsOnScroll,
    }),
    [
      showUsername,
      toggleShowUsername,
      hideTabsOnScroll,
      toggleHideTabsOnScroll,
    ],
  );

  return (
    <TabSettingsContext.Provider value={value}>
      {children}
    </TabSettingsContext.Provider>
  );
}
