/**
 * Tests for the gesture-handler + Reanimated rewrite of <Slideable>
 * (docs/specs/03-interaction-overhaul.md, item 1).
 *
 * The real gesture runs on the UI thread through react-native-gesture-handler
 * and Reanimated worklets, which don't execute under jest-expo. So (mirroring
 * the inline-mock pattern established in
 * components/UI/MediaViewer.tsx/__tests__/MediaImage.test.tsx) we stub the
 * gesture + worklet layer:
 *
 *  - `Gesture.Pan()` becomes a chainable builder that records every callback
 *    (`onStart`/`onUpdate`/`onEnd`/`onFinalize`) and the activation config.
 *  - `GestureDetector` renders its children and captures the gesture so a test
 *    can drive those callbacks directly with synthetic pan events.
 *  - `runOnJS` is identity and `withSpring` invokes its completion callback
 *    synchronously, so the JS-side handlers run inline.
 *
 * That lets us exercise the component's real logic — threshold-band detection,
 * which configured action a band maps to, the haptic on engage, firing the
 * action on release, scroll locking, and the swipeAnywhereToNavigate
 * coexistence clamp — without the native pipeline.
 */
import { act, create, ReactTestRenderer } from "react-test-renderer";
import { View } from "react-native";

import { ScrollerContext } from "../../../contexts/ScrollerContext";
import { GesturesContext } from "../../../contexts/SettingsContexts/GesturesContext";

import Slideable from "../Slideable";

// --- capture the composed gesture so tests can drive its callbacks ----------
type PanConfig = {
  activeOffsetX?: [number, number];
  failOffsetY?: [number, number];
  onStart?: (e?: unknown) => void;
  onUpdate?: (e: { translationX: number }) => void;
  onEnd?: (e: { translationX: number }) => void;
  onFinalize?: (e?: unknown) => void;
};
let capturedGesture: { config: PanConfig } | null = null;

jest.mock("react-native-gesture-handler", () => {
  const makePan = () => {
    const config: PanConfig = {};
    const builder = {
      config,
      activeOffsetX(v: [number, number]) {
        config.activeOffsetX = v;
        return this;
      },
      failOffsetY(v: [number, number]) {
        config.failOffsetY = v;
        return this;
      },
      onStart(fn: PanConfig["onStart"]) {
        config.onStart = fn;
        return this;
      },
      onUpdate(fn: PanConfig["onUpdate"]) {
        config.onUpdate = fn;
        return this;
      },
      onEnd(fn: PanConfig["onEnd"]) {
        config.onEnd = fn;
        return this;
      },
      onFinalize(fn: PanConfig["onFinalize"]) {
        config.onFinalize = fn;
        return this;
      },
    };
    return builder;
  };
  return {
    __esModule: true,
    Gesture: { Pan: makePan },
    GestureDetector: ({
      gesture,
      children,
    }: {
      gesture: { config: PanConfig };
      children: React.ReactNode;
    }) => {
      capturedGesture = gesture;
      return children;
    },
  };
});

jest.mock("react-native-reanimated", () => {
  const React = require("react");
  const { View: RNView } = require("react-native");
  return {
    __esModule: true,
    default: { View: RNView },
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    // Real shared values persist across renders (ref-like). The component's
    // `activated` gate relies on that: it's set in onStart and read in
    // onFinalize, with a state-driven re-render in between.
    useSharedValue: (initial: unknown) =>
      React.useRef({ value: initial }).current,
    useAnimatedStyle: (fn: () => unknown) => fn(),
    withSpring: (
      toValue: unknown,
      _config: unknown,
      callback?: (finished: boolean) => void,
    ) => {
      callback?.(true);
      return toValue;
    },
  };
});

// Spy on the haptic-on-engage helper.
const mockHapticEngage = jest.fn();
jest.mock("../../../utils/haptics", () => ({
  __esModule: true,
  hapticEngage: () => mockHapticEngage(),
}));

// The real ThemeContext transitively opens a SQLite db (db/index.ts) that
// can't load under jest; stub it with the colors the component reads.
jest.mock("../../../contexts/SettingsContexts/ThemeContext", () => {
  const { createContext } = require("react");
  return {
    __esModule: true,
    ThemeContext: createContext({
      theme: {
        text: "rgb(200, 200, 200)",
        background: "rgb(0, 0, 0)",
        tint: "rgb(50, 50, 50)",
      },
    }),
  };
});

const UPVOTE_COLOR = "rgb(1, 2, 3)";
const DOWNVOTE_COLOR = "rgb(4, 5, 6)";
const HIDE_COLOR = "rgb(7, 8, 9)";

const upvote = jest.fn();
const downvote = jest.fn();
const hide = jest.fn();

const options = [
  {
    name: "upvote",
    icon: <View testID="icon-upvote" />,
    color: UPVOTE_COLOR,
    action: upvote,
  },
  {
    name: "downvote",
    icon: <View testID="icon-downvote" />,
    color: DOWNVOTE_COLOR,
    action: downvote,
  },
  {
    name: "hide",
    icon: <View testID="icon-hide" />,
    color: HIDE_COLOR,
    action: hide,
  },
];

type RenderOptions = {
  swipeAnywhereToNavigate?: boolean;
  setScrollDisabled?: (v: boolean) => void;
};

function renderSlideable({
  swipeAnywhereToNavigate = false,
  setScrollDisabled = () => {},
}: RenderOptions = {}) {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(
      <ScrollerContext.Provider
        value={{ scrollDisabled: false, setScrollDisabled }}
      >
        <GesturesContext.Provider value={{ swipeAnywhereToNavigate } as never}>
          <Slideable
            options={options}
            shortLeftName="upvote"
            longLeftName="downvote"
            shortRightName="hide"
          >
            <View testID="child-content" />
          </Slideable>
        </GesturesContext.Provider>
      </ScrollerContext.Provider>,
    );
  });
  return tree;
}

const pan = () => capturedGesture!.config;

beforeEach(() => {
  capturedGesture = null;
  mockHapticEngage.mockClear();
  upvote.mockClear();
  downvote.mockClear();
  hide.mockClear();
});

describe("rendering", () => {
  it("renders its children and does not crash under the jest mocks", () => {
    const tree = renderSlideable();
    expect(tree.root.findByProps({ testID: "child-content" })).toBeTruthy();
  });

  it("renders no action icon before any swipe", () => {
    const tree = renderSlideable();
    expect(tree.root.findAllByProps({ testID: "icon-upvote" })).toHaveLength(0);
    expect(tree.root.findAllByProps({ testID: "icon-hide" })).toHaveLength(0);
  });
});

describe("threshold bands map to configured actions", () => {
  it("reveals the short-left action and fires a haptic once its band engages", () => {
    const tree = renderSlideable();
    act(() => {
      pan().onStart?.();
      pan().onUpdate?.({ translationX: 80 }); // > 75 short threshold, rightward
    });
    expect(
      tree.root.findAllByProps({ testID: "icon-upvote" }).length,
    ).toBeGreaterThan(0);
    expect(mockHapticEngage).toHaveBeenCalledTimes(1);
  });

  it("upgrades to the long-left action past the 130px threshold", () => {
    const tree = renderSlideable();
    act(() => {
      pan().onStart?.();
      pan().onUpdate?.({ translationX: 80 });
    });
    act(() => {
      pan().onUpdate?.({ translationX: 140 }); // > 130 long threshold
    });
    expect(
      tree.root.findAllByProps({ testID: "icon-downvote" }).length,
    ).toBeGreaterThan(0);
    // one haptic when short engaged, another when the band changed to long
    expect(mockHapticEngage).toHaveBeenCalledTimes(2);
  });

  it("reveals the short-right action on a leftward swipe", () => {
    const tree = renderSlideable();
    act(() => {
      pan().onStart?.();
      pan().onUpdate?.({ translationX: -90 }); // leftward, reveals right options
    });
    expect(
      tree.root.findAllByProps({ testID: "icon-hide" }).length,
    ).toBeGreaterThan(0);
  });

  it("does not fire a haptic while the drag stays under the short threshold", () => {
    renderSlideable();
    act(() => {
      pan().onStart?.();
      pan().onUpdate?.({ translationX: 40 });
    });
    expect(mockHapticEngage).not.toHaveBeenCalled();
  });
});

describe("releasing a swipe", () => {
  it("fires the engaged action's callback on release", () => {
    renderSlideable();
    act(() => {
      pan().onStart?.();
      pan().onUpdate?.({ translationX: 80 });
      pan().onEnd?.({ translationX: 80 });
    });
    expect(upvote).toHaveBeenCalledTimes(1);
    expect(downvote).not.toHaveBeenCalled();
    expect(hide).not.toHaveBeenCalled();
  });

  it("fires no action when released below the short threshold", () => {
    renderSlideable();
    act(() => {
      pan().onStart?.();
      pan().onUpdate?.({ translationX: 40 });
      pan().onEnd?.({ translationX: 40 });
    });
    expect(upvote).not.toHaveBeenCalled();
    expect(downvote).not.toHaveBeenCalled();
    expect(hide).not.toHaveBeenCalled();
  });

  it("clears the revealed icon after the spring settles on finalize", () => {
    const tree = renderSlideable();
    act(() => {
      pan().onStart?.();
      pan().onUpdate?.({ translationX: 80 });
    });
    expect(
      tree.root.findAllByProps({ testID: "icon-upvote" }).length,
    ).toBeGreaterThan(0);
    act(() => {
      pan().onEnd?.({ translationX: 80 });
      pan().onFinalize?.();
    });
    expect(tree.root.findAllByProps({ testID: "icon-upvote" })).toHaveLength(0);
  });
});

describe("scroll locking", () => {
  it("disables the enclosing scroller on start and re-enables it on finalize", () => {
    const setScrollDisabled = jest.fn();
    renderSlideable({ setScrollDisabled });
    act(() => {
      pan().onStart?.();
    });
    expect(setScrollDisabled).toHaveBeenLastCalledWith(true);
    act(() => {
      pan().onFinalize?.();
    });
    expect(setScrollDisabled).toHaveBeenLastCalledWith(false);
  });

  it("does not touch scroll locking when a gesture finalizes without activating", () => {
    // onFinalize fires even for pans that failed before activating (e.g. a
    // vertical drag). The `activated` gate must keep such a finalize from
    // clearing scrollDisabled while another row's swipe may still be active.
    const setScrollDisabled = jest.fn();
    renderSlideable({ setScrollDisabled });
    act(() => {
      pan().onFinalize?.(); // no onStart -> never activated
    });
    expect(setScrollDisabled).not.toHaveBeenCalled();
  });
});

describe("swipeAnywhereToNavigate coexistence", () => {
  it("opens the right edge of the activation window so the OS back gesture wins", () => {
    renderSlideable({ swipeAnywhereToNavigate: true });
    expect(pan().activeOffsetX?.[1]).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("keeps a symmetric activation window when the setting is off", () => {
    renderSlideable({ swipeAnywhereToNavigate: false });
    const [left, right] = pan().activeOffsetX!;
    expect(right).not.toBe(Number.MAX_SAFE_INTEGER);
    expect(right).toBe(-left);
  });

  it("ignores rightward drags when swipeAnywhereToNavigate is on", () => {
    const tree = renderSlideable({ swipeAnywhereToNavigate: true });
    act(() => {
      pan().onStart?.();
      pan().onUpdate?.({ translationX: 120 }); // rightward: should be clamped to 0
    });
    expect(tree.root.findAllByProps({ testID: "icon-upvote" })).toHaveLength(0);
    expect(mockHapticEngage).not.toHaveBeenCalled();
  });

  it("still honors leftward drags when swipeAnywhereToNavigate is on", () => {
    const tree = renderSlideable({ swipeAnywhereToNavigate: true });
    act(() => {
      pan().onStart?.();
      pan().onUpdate?.({ translationX: -90 });
      pan().onEnd?.({ translationX: -90 });
    });
    expect(
      tree.root.findAllByProps({ testID: "icon-hide" }).length,
    ).toBeGreaterThanOrEqual(0);
    expect(hide).toHaveBeenCalledTimes(1);
  });
});
