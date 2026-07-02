/**
 * The haptics policy helpers (docs/specs/03-interaction-overhaul.md, item 4)
 * exist so sibling actions always feel the same and intensities aren't picked
 * ad-hoc at each call site. These tests pin each helper to the exact
 * expo-haptics call it's supposed to make.
 */
import * as Haptics from "expo-haptics";

import { hapticAction, hapticEngage, hapticSelection } from "../haptics";

jest.mock("expo-haptics", () => ({
  __esModule: true,
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

it("hapticEngage fires a light impact", () => {
  hapticEngage();
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.impactAsync).toHaveBeenCalledWith(
    Haptics.ImpactFeedbackStyle.Light,
  );
  expect(Haptics.selectionAsync).not.toHaveBeenCalled();
});

it("hapticAction fires a medium impact", () => {
  hapticAction();
  expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.impactAsync).toHaveBeenCalledWith(
    Haptics.ImpactFeedbackStyle.Medium,
  );
  expect(Haptics.selectionAsync).not.toHaveBeenCalled();
});

it("hapticSelection fires selection feedback, not an impact", () => {
  hapticSelection();
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  expect(Haptics.impactAsync).not.toHaveBeenCalled();
});
