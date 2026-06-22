import { createContext } from "react";

interface SubscriptionContextType {
  /**
   * All features are free. `isPro` is kept as an always-true flag so the rest
   * of the app can continue to gate behavior on it without a paid tier.
   */
  isPro: boolean;
  /**
   * There is no longer a paid customer record. Features that previously called
   * the hosted Hydra backend with a customer id have been removed, so this is
   * always null.
   */
  customerId: string | null;
}

const initialSubscriptionContext: SubscriptionContextType = {
  isPro: true,
  customerId: null,
};

export const SubscriptionsContext = createContext(initialSubscriptionContext);

export function SubscriptionsProvider({ children }: React.PropsWithChildren) {
  return (
    <SubscriptionsContext.Provider value={initialSubscriptionContext}>
      {children}
    </SubscriptionsContext.Provider>
  );
}
