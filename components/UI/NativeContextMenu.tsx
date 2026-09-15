import React from "react";
import { Platform, StyleProp, StyleSheet, ViewStyle } from "react-native";
import * as ContextMenu from "zeego/context-menu";
// Type-only deep import: the public ContextMenu.Root type is the web shape,
// which omits `style`; this is the shape zeego's iOS Root actually reads.
import type { MenuRootProps } from "zeego/lib/typescript/menu/types";

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
   * children in a plain block view. Its flex shorthand is also forwarded to
   * the native menu view so the whole wrapper takes its share of the parent.
   * Needed when the children rely on flexing inside their parent (e.g. an
   * image in a row of images).
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
  const rootProps: Pick<MenuRootProps, "style"> = {
    style: rootFlex(flatStyle),
  };

  return (
    <ContextMenu.Root onOpenChange={onOpenChange} {...rootProps}>
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
 * longhands, mirroring React Native's own expansion, so the caller's intent
 * overrides zeego's default. Only the flex longhands go to the menu view; the
 * rest of the style stays on the trigger so spacing and borders don't double.
 */
function rootFlex(style: ViewStyle | undefined): MenuRootProps["style"] {
  const flex = style?.flex;
  if (typeof flex !== "number") return undefined;
  if (flex > 0) return { flexGrow: flex, flexShrink: 1, flexBasis: 0 };
  if (flex === 0) return { flexGrow: 0, flexShrink: 0, flexBasis: "auto" };
  return { flexGrow: 0, flexShrink: 1, flexBasis: "auto" };
}
