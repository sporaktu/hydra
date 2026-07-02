import { useContext, useEffect, useState } from "react";
import { ColorValue, RefreshControl, RefreshControlProps } from "react-native";

import { ThemeContext } from "../../contexts/SettingsContexts/ThemeContext";

/**
 * RefreshControl whose spinner is tinted to the theme's text color.
 *
 * The tintColor prop is broken on first render in React Native 0.81.5 — the
 * spinner keeps its default color unless tintColor is applied a beat after
 * mount, so it's set on a 500ms delay. We can't device-test RN 0.83 to confirm
 * the upstream fix landed, so the workaround is kept verbatim rather than
 * dropped. https://github.com/facebook/react-native/issues/53987
 */
export default function ThemedRefreshControl(
  props: Omit<RefreshControlProps, "tintColor">,
) {
  const { theme } = useContext(ThemeContext);

  const [tintColor, setTintColor] = useState<ColorValue>();
  useEffect(() => {
    setTimeout(() => {
      setTintColor(theme.text);
    }, 500);
  }, []);

  return <RefreshControl tintColor={tintColor} {...props} />;
}
