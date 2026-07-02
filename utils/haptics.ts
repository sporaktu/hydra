import * as Haptics from "expo-haptics";

/**
 * Haptics policy (docs/specs/03-interaction-overhaul.md, item 4).
 *
 * Three semantic helpers so sibling actions always feel the same and
 * intensities aren't picked ad-hoc at each call site. Prefer these over
 * calling expo-haptics directly.
 *
 * - hapticEngage()    Light impact. A gesture crossed an action threshold but
 *                     nothing has committed yet — e.g. a swipe passing its
 *                     engage point.
 * - hapticAction()    Medium impact. A state-changing action committed — e.g.
 *                     pull-to-refresh firing.
 * - hapticSelection() Selection feedback. Choosing from a menu or flipping a
 *                     toggle — e.g. tab long-press quick menus, the feed-audio
 *                     FAB, opening a context menu.
 */

export function hapticEngage(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function hapticAction(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export function hapticSelection(): void {
  Haptics.selectionAsync();
}
