import React from "react";
import { Platform } from "react-native";
import * as ContextMenu from "zeego/context-menu";

export type NativeContextMenuAction = {
  label: string;
  handle: () => void;
  destructive?: boolean;
};

type NativeContextMenuProps = {
  actions: NativeContextMenuAction[];
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
};

/**
 * Wraps `children` in a native UIKit context menu (press-and-hold with blur +
 * preview) on iOS. On Android the children are rendered unchanged so callers
 * keep their existing long-press action sheet.
 */
export default function NativeContextMenu({
  actions,
  onOpenChange,
  children,
}: NativeContextMenuProps) {
  if (Platform.OS !== "ios") {
    return <>{children}</>;
  }

  return (
    <ContextMenu.Root onOpenChange={onOpenChange}>
      <ContextMenu.Trigger>{children}</ContextMenu.Trigger>
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
