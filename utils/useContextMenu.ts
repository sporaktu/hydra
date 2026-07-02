import {
  ActionSheetOptions,
  useActionSheet,
} from "@expo/react-native-action-sheet";
import { useContext } from "react";

import { ThemeContext } from "../contexts/SettingsContexts/ThemeContext";
import { ActionSheetBgContext } from "../contexts/ActionSheetBgContext";
import { hapticSelection } from "./haptics";

type OpenContextMenuFn = <Options extends string[]>(
  actionSheetOptions: ActionSheetOptions & { options: Options },
) => Promise<Options[number] | null>;

export default function useContextMenu() {
  const { setIsActionSheetShowing } = useContext(ActionSheetBgContext);
  const { showActionSheetWithOptions } = useActionSheet();
  const { theme } = useContext(ThemeContext);

  const openContextMenu: OpenContextMenuFn = (actionSheetOptions) => {
    hapticSelection();
    setIsActionSheetShowing(true);
    return new Promise((resolve) => {
      const cancelButtonIndex = actionSheetOptions.options.length;
      showActionSheetWithOptions(
        {
          ...actionSheetOptions,
          options: [...actionSheetOptions.options, "Cancel"],
          cancelButtonIndex,
          userInterfaceStyle: theme.systemModeStyle,
        },
        async (buttonIndex) => {
          setIsActionSheetShowing(false);
          if (buttonIndex === undefined || buttonIndex === cancelButtonIndex) {
            return resolve(null);
          }
          resolve(actionSheetOptions.options[buttonIndex]);
        },
      );
    });
  };

  return openContextMenu;
}
