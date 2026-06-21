import { createContext, useCallback, useRef } from "react";

type SubredditSwitcherContextType = {
  openSubredditSwitcher: () => void;
  registerOpener: (opener: () => void) => void;
};

const initialSubredditSwitcherContext: SubredditSwitcherContextType = {
  openSubredditSwitcher: () => {},
  registerOpener: () => {},
};

export const SubredditSwitcherContext =
  createContext<SubredditSwitcherContextType>(initialSubredditSwitcherContext);

export function SubredditSwitcherProvider({
  children,
}: React.PropsWithChildren) {
  const openerRef = useRef<() => void>(() => {});

  const registerOpener = useCallback((opener: () => void) => {
    openerRef.current = opener;
  }, []);

  const openSubredditSwitcher = useCallback(() => {
    openerRef.current();
  }, []);

  return (
    <SubredditSwitcherContext.Provider
      value={{ openSubredditSwitcher, registerOpener }}
    >
      {children}
    </SubredditSwitcherContext.Provider>
  );
}
