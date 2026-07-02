import { useRecyclingState } from "@shopify/flash-list";
import { Image, ImageSource } from "expo-image";
import { View } from "react-native";
import {
  GestureDetector,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from "react-native-gesture-handler";
import { useSafeAreaFrame } from "react-native-safe-area-context";
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withTiming,
} from "react-native-reanimated";
import { runOnJS } from "react-native-worklets";

export type ImageItem = {
  type: "image";
  source: string | ImageSource[];
};

export type MediaImageProps = {
  item: ImageItem;
  setIsScrollLocked: (isScrollLocked: boolean) => void;
};

const ZOOM_SCALE = 3;
const TIMING = { duration: 250, easing: Easing.out(Easing.ease) };

// A real finger move never shifts the touch centroid this far in one frame; a
// centroid snap from adding/removing a finger does. On a snap we skip the pan
// term for that frame so the focal jump doesn't translate the image.
const FOCAL_SNAP_THRESHOLD = 50;

export function MediaImage({ item, setIsScrollLocked }: MediaImageProps) {
  const { width, height } = useSafeAreaFrame();

  const scale = useSharedValue(1);
  const isZoomed = useSharedValue(false);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  // Last pinch focal, used to derive the two-finger pan delta between frames.
  const prevFocalX = useSharedValue(0);
  const prevFocalY = useSharedValue(0);

  /**
   * Only decode the full-resolution original once the user actually zooms.
   * By default expo-image downscales the decode to fit the container, which
   * keeps memory bounded inside the paging viewer. Zooming needs the extra
   * detail, so we latch this on the first zoom and never turn it back off —
   * flipping `allowDownscaling` re-decodes the already-loaded source in place,
   * so the downscaled bitmap stays on screen until the full-res one is ready.
   *
   * The reset callback fires when the cell recycles onto a new source, so the
   * gesture transform starts fresh for the next image.
   */
  const [needsFullRes, setNeedsFullRes] = useRecyclingState(
    false,
    [item.source],
    () => {
      scale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      isZoomed.value = false;
    },
  );

  // Zooming locks the paging lists (both axes) so pans move the image instead of
  // paging, and latches the full-res decode. Runs off the UI-thread `isZoomed`
  // so it only crosses to JS on a zoom in/out transition.
  const applyZoomState = (zoomed: boolean) => {
    setIsScrollLocked(zoomed);
    if (zoomed) {
      setNeedsFullRes(true);
    }
  };

  useAnimatedReaction(
    () => isZoomed.value,
    (zoomed, previous) => {
      if (zoomed !== previous) {
        runOnJS(applyZoomState)(zoomed);
      }
    },
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const doubleTapGesture = useTapGesture({
    maxDistance: 20,
    numberOfTaps: 2,
    onActivate: (event) => {
      if (isZoomed.value) {
        scale.value = withTiming(1, TIMING);
        isZoomed.value = false;
        translateX.value = withTiming(0, TIMING);
        translateY.value = withTiming(0, TIMING);
      } else {
        const focalX = event.x - width / 2;
        const focalY = event.y - height / 2;
        const pointX = (focalX - translateX.value) / scale.value;
        const pointY = (focalY - translateY.value) / scale.value;
        const maxX = (width * (ZOOM_SCALE - 1)) / 2;
        const maxY = (height * (ZOOM_SCALE - 1)) / 2;
        scale.value = withTiming(ZOOM_SCALE, TIMING);
        isZoomed.value = true;
        translateX.value = withTiming(
          Math.min(Math.max(focalX - pointX * ZOOM_SCALE, -maxX), maxX),
          TIMING,
        );
        translateY.value = withTiming(
          Math.min(Math.max(focalY - pointY * ZOOM_SCALE, -maxY), maxY),
          TIMING,
        );
      }
    },
  });

  const panGesture = usePanGesture({
    averageTouches: true,
    enabled: isZoomed,
    maxPointers: 1,
    onUpdate: (event) => {
      const maxX = (width * (scale.value - 1)) / 2;
      const maxY = (height * (scale.value - 1)) / 2;
      translateX.value = Math.min(
        Math.max(translateX.value + event.changeX, -maxX),
        maxX,
      );
      translateY.value = Math.min(
        Math.max(translateY.value + event.changeY, -maxY),
        maxY,
      );
    },
    onDeactivate: (event) => {
      if (Math.abs(event.velocityX) < 100 && Math.abs(event.velocityY) < 100)
        return;
      const maxX = (width * (scale.value - 1)) / 2;
      const maxY = (height * (scale.value - 1)) / 2;
      translateX.value = withDecay({
        velocity: event.velocityX,
        clamp: [-maxX, maxX],
        deceleration: 0.998,
      });
      translateY.value = withDecay({
        velocity: event.velocityY,
        clamp: [-maxY, maxY],
        deceleration: 0.998,
      });
    },
  });

  const pinchGesture = usePinchGesture({
    onActivate: (event) => {
      prevFocalX.value = event.focalX - width / 2;
      prevFocalY.value = event.focalY - height / 2;
    },
    onUpdate: (event) => {
      const focalX = event.focalX - width / 2;
      const focalY = event.focalY - height / 2;

      // Incremental zoom + pan around the pinch focal. We pivot off the per-frame
      // scaleChange and the focal *movement* since last frame (the two-finger pan
      // delta), rather than an absolute baseline, so simultaneous pan and zoom
      // both work and there's no stale state to drift.
      //
      // The exception is a focal snap from adding/removing a finger: the centroid
      // teleports, which would otherwise pan the image by the jump. On a snap we
      // anchor to the *current* focal instead of the previous one, dropping the
      // pan term for that single frame (zoom still applies cleanly around it).
      const snapped =
        Math.abs(focalX - prevFocalX.value) > FOCAL_SNAP_THRESHOLD ||
        Math.abs(focalY - prevFocalY.value) > FOCAL_SNAP_THRESHOLD;
      const baseX = snapped ? focalX : prevFocalX.value;
      const baseY = snapped ? focalY : prevFocalY.value;
      prevFocalX.value = focalX;
      prevFocalY.value = focalY;

      const newScale = Math.min(
        Math.max(scale.value * event.scaleChange, 1),
        10,
      );
      // Use the realized ratio so clamping at the scale limits doesn't over-shift.
      const change = newScale / scale.value;
      const maxX = (width * (newScale - 1)) / 2;
      const maxY = (height * (newScale - 1)) / 2;
      translateX.value = Math.min(
        Math.max(focalX - (baseX - translateX.value) * change, -maxX),
        maxX,
      );
      translateY.value = Math.min(
        Math.max(focalY - (baseY - translateY.value) * change, -maxY),
        maxY,
      );
      scale.value = newScale;
      isZoomed.value = newScale > 1;
    },
    onDeactivate: () => {
      if (scale.value < 1.1) {
        scale.value = withTiming(1, TIMING);
        isZoomed.value = false;
        translateX.value = withTiming(0, TIMING);
        translateY.value = withTiming(0, TIMING);
      }
    },
  });

  const pinchPan = useSimultaneousGestures(
    doubleTapGesture,
    panGesture,
    pinchGesture,
  );

  const highestResSource =
    typeof item.source === "string"
      ? item.source
      : item.source[item.source.length - 1];

  return (
    <GestureDetector gesture={pinchPan}>
      <View collapsable={false} style={{ width, height, overflow: "hidden" }}>
        <Animated.View style={[animatedStyle, { width, height }]}>
          <Image
            source={highestResSource}
            /**
             * Show the same best-fit resolution the feed already cached while the
             * full-size original downloads, instead of a black screen. expo-image
             * picks the placeholder source that best fits the container — the same
             * choice the feed's ImageViewer made — so it's an instant cache hit.
             * The high-res `source` then loads underneath for crisp zoom.
             */
            placeholder={
              typeof item.source === "string" ? undefined : item.source
            }
            placeholderContentFit="contain"
            style={{ width, height }}
            contentFit="contain"
            transition={150}
            allowDownscaling={!needsFullRes}
            recyclingKey={
              typeof highestResSource === "string"
                ? highestResSource
                : highestResSource.uri
            }
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
