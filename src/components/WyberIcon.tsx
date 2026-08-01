import Svg, { Rect, Path } from 'react-native-svg';
import { brand } from '@/lib/theme';

// Exact port of the real brand mark (src/components/shared/WyberLogo.tsx in
// the web repo) — a blue rounded-square badge with two white chevrons, NOT a
// literal "W". An earlier pass here shipped a hand-guessed zigzag stroke
// instead of this, because it couldn't vectorize the raster icon.png without
// image-analysis tooling — that was a real, visible logo bug, not a
// stopgap worth shipping quietly. Same viewBox/paths as the web mark, so any
// design change to one should be mirrored to the other by hand.
export function WyberIcon({
  size = 32,
  showBackground = true,
  markColor = brand.onAccent,
}: {
  size?: number;
  /** false when the icon already sits on a solid brand.accent background
   * (e.g. the full-bleed splash overlay) — the rounded-square badge would
   * otherwise render as an invisible blue-on-blue box. */
  showBackground?: boolean;
  markColor?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      {showBackground ? <Rect width={32} height={32} rx={8} fill={brand.accent} /> : null}
      <Path d="M20 7L11 16L20 25" stroke={markColor} strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
      <Path
        d="M23 11L28 16L23 21"
        stroke={markColor}
        strokeWidth={2.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.4}
      />
    </Svg>
  );
}
