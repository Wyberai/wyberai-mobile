import Svg, { Text as SvgText, TSpan } from 'react-native-svg';
import { brand } from '@/lib/theme';

// SVG wordmark (not an <Image>) so the splash sequence and onboarding can
// animate it independently via a Reanimated wrapper — react-native-svg's
// <Text> renders with the same self-hosted GeneralSans-Bold already loaded
// by the root layout's useFonts(), so this matches the raster wordmark
// exactly rather than approximating it with a second font stack.
export function WyberWordmark({
  width = 140,
  color = brand.text,
  accentColor = brand.accent,
}: {
  width?: number;
  color?: string;
  accentColor?: string;
}) {
  // Matches the viewBox's own aspect ratio (52/280) — a mismatched height
  // baked in extra vertical letterboxing that only happened to go unnoticed
  // because SVG's default preserveAspectRatio (xMidYMid meet) masks it.
  const height = width * (52 / 280);
  return (
    <Svg width={width} height={height} viewBox="0 0 280 52">
      <SvgText
        x="0"
        y="38"
        fontFamily="GeneralSans-Bold"
        fontSize="40"
        fill={color}
        letterSpacing="-1"
      >
        Wyber<TSpan fill={accentColor}>Ai</TSpan>
      </SvgText>
    </Svg>
  );
}
