import { AccessibilityActionEvent } from "react-native";
import useContextMenu from "./useContextMenu";

type Actions<ActionLabel extends string> = {
  label: ActionLabel;
  isAllowed?: boolean;
  isLongPressOption?: boolean;
  isAccessibilityAction?: boolean;
  handle: () => Promise<void>;
}[];

export default function useComponentActions<ActionLabel extends string>(
  actionsWithoutDefaults: Actions<ActionLabel>,
) {
  const openContextMenu = useContextMenu();

  const actions = actionsWithoutDefaults.map((action) => ({
    ...action,
    isAllowed: action.isAllowed ?? true,
    isLongPressOption: action.isLongPressOption ?? true,
    isAccessibilityAction: action.isAccessibilityAction ?? true,
  }));

  const accessibilityActions = actions
    .filter((action) => action.isAllowed && action.isAccessibilityAction)
    .map((action) => ({ name: action.label }));

  const handleAction = async (actionName: ActionLabel) => {
    await actions
      .find((action) => action.isAllowed && action.label === actionName)
      ?.handle?.();
  };

  const handleAccessibilityAction = async (e: AccessibilityActionEvent) => {
    const actionName = e.nativeEvent.actionName;
    await actions
      .find(
        (action) =>
          action.isAllowed &&
          action.isAccessibilityAction &&
          action.label === actionName,
      )
      ?.handle?.();
  };

  const longPressActions = actions.filter(
    (action) => action.isAllowed && action.isLongPressOption,
  );

  const handleLongPress = async () => {
    const result = await openContextMenu<ActionLabel[]>({
      options: longPressActions.map((action) => action.label),
    });
    if (result) {
      await longPressActions
        .find((action) => action.label === result)
        ?.handle();
    }
  };

  // Resolved long-press options for the native iOS context menu (Zeego), which
  // needs the handlers up front rather than resolving a label after selection.
  const longPressOptions = longPressActions.map((action) => ({
    label: action.label,
    handle: () => {
      action.handle();
    },
  }));

  return {
    accessibilityActions,
    handleAction,
    handleAccessibilityAction,
    handleLongPress,
    longPressOptions,
  };
}
