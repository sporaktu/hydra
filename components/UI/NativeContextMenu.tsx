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
   * Applied to the native menu view and its trigger view on iOS, which
   * otherwise wrap the children in plain block views. Needed when the
   * children rely on flexing inside their parent (e.g. an image in a row of
   * images).
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

  const flatStyle = StyleSheet.flatten(style);

  return (
    <ContextMenu.Root
      onOpenChange={onOpenChange}
      // zeego types Root with its web shape, which has no `style`; the iOS
      // Root does read it and applies it to the native menu view.
      {...({ style: rootStyle(flatStyle) } as Partial<
        React.ComponentProps<typeof ContextMenu.Root>
      >)}
    >
      <ContextMenu.Trigger
        // zeego types the trigger's style as the web (CSS) and native shapes
        // intersected; on iOS it is applied as a plain RN view style.
        style={
          flatStyle as React.ComponentProps<typeof ContextMenu.Trigger>["style"]
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

/**
 * zeego renders the native menu view with `flexGrow: 0` in front of the
 * caller's style, and in Yoga an explicit flexGrow beats whatever the `flex`
 * shorthand implies. So `flex: 1` would leave the native view at grow 0 /
 * basis 0, i.e. zero width in a row. Expand the shorthand into explicit
 * longhands so the caller's intent actually overrides zeego's default.
 */
function rootStyle(style: ViewStyle | undefined): ViewStyle | undefined {
  if (!style) return undefined;
  const { flex, ...rest } = style;
  if (typeof flex !== "number") return style;
  return {
    flexGrow: flex,
    flexShrink: flex > 0 ? 1 : 0,
    flexBasis: 0,
    ...rest,
  };
}
