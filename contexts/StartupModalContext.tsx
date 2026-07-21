import React, {
  createContext,
  Dispatch,
  PropsWithChildren,
  SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";
import UpdateInfo, {
  LAST_SEEN_UPDATE_KEY,
  updateInfo,
} from "../components/Modals/StartupModals/UpdateInfo";
import { getStat, Stat } from "../db/functions/Stats";
import KeyStore from "../utils/KeyStore";
import PromptForReview, {
  STORE_REVIEW_REQUESTED_KEY,
} from "../components/Modals/StartupModals/PromptForReview";

export type ModalId = "updateInfo" | "promptForReview";

const initialState = {
  startupModal: null as ModalId | null,
  setStartupModal: (() => {}) as Dispatch<SetStateAction<ModalId | null>>,
};

export const StartupModalContext = createContext(initialState);

export function StartupModalProvider({ children }: PropsWithChildren) {
  const [startupModal, setStartupModal] = useState(initialState.startupModal);
  const hasShownStartupModal = useRef(false);

  const modals: { id: ModalId; wantsToShow: boolean }[] = [
    {
      id: "updateInfo",
      wantsToShow:
        KeyStore.getString(LAST_SEEN_UPDATE_KEY) !== updateInfo.updateKey,
    },
    {
      id: "promptForReview",
      wantsToShow:
        (getStat(Stat.APP_LAUNCHES) ?? 0) > 30 &&
        !KeyStore.getBoolean(STORE_REVIEW_REQUESTED_KEY),
    },
  ];

  const showTopPriorityModal = () => {
    const modal = modals.find((modal) => modal.wantsToShow);
    if (modal) {
      setStartupModal(modal.id);
    }
  };

  useEffect(() => {
    if (hasShownStartupModal.current) return;
    hasShownStartupModal.current = true;
    showTopPriorityModal();
  }, []);

  return (
    <StartupModalContext.Provider value={{ startupModal, setStartupModal }}>
      {startupModal === "updateInfo" && (
        <UpdateInfo onExit={() => setStartupModal(null)} />
      )}
      {startupModal === "promptForReview" && (
        <PromptForReview onExit={() => setStartupModal(null)} />
      )}
      {children}
    </StartupModalContext.Provider>
  );
}
