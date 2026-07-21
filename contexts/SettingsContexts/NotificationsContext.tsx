import { createContext } from "react";

/**
 * Push notifications (Inbox Alerts) relied on the hosted Hydra push backend and
 * have been removed along with the paid tier. This context is kept as an inert
 * stub so existing consumers continue to work without registering for push.
 */
const initialNotificationsContext = {
  notificationsEnabled: false,
  toggleNotifications: (_newValue?: boolean) => {},
};

export const NotificationsContext = createContext(initialNotificationsContext);

export function NotificationsProvider({ children }: React.PropsWithChildren) {
  return (
    <NotificationsContext.Provider value={initialNotificationsContext}>
      {children}
    </NotificationsContext.Provider>
  );
}
