import React from "react";
import { Platform, StyleProp, StyleSheet, ViewStyle } from "react-native";
import * as ContextMenu from "zeego/context-menu";

export type NativeContextMenuAction = {
  label: string;
  handle: () => void;
  destructive?: boolean;
};

type NativeContextMenuProps = {
  actions: NativeContextMenuAction[];
  onOpenChange?: (open: boolean) => void;
  /**
   * Applied to the native trigger view on iOS, which otherwise wraps the
   * children in a plain block view. Needed when the children rely on flexing
   * inside their parent (e.g. an image in a row of images).
   */
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/**
 * Wraps `children` in a native UIKit context menu (press-and-hold with blur +
 * preview) on iOS. On Android the children are rendered unchanged so callers
 * keep their existing long-press action sheet.
 *
 * Menus nest: when one of these sits inside another (an image inside a
 * comment, say), a press-and-hold on the inner one opens the inner menu.
 */
export default function NativeContextMenu({
  actions,
  onOpenChange,
  style,
  children,
}: NativeContextMenuProps) {
  if (Platform.OS !== "ios") {
    return <>{children}</>;
  }

  return (
    <ContextMenu.Root onOpenChange={onOpenChange}>
      <ContextMenu.Trigger
        // zeego types the trigger's style as the web (CSS) and native shapes
        // intersected; on iOS it is applied as a plain RN view style.
        style={
          StyleSheet.flatten(style) as React.ComponentProps<
            typeof ContextMenu.Trigger
          >["style"]
        }
      >
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Content>
        {actions.map((action, index) => (
          <ContextMenu.Item
            key={`${index}-${action.label}`}
            destructive={action.destructive}
            onSelect={action.handle}
          >
            <ContextMenu.ItemTitle>{action.label}</ContextMenu.ItemTitle>
          </ContextMenu.Item>
        ))}
      </ContextMenu.Content>
    </ContextMenu.Root>
  );
}
