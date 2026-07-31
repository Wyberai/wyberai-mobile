import Svg, { Path } from 'react-native-svg';
import { brand } from '@/lib/theme';

// Geometric "W" mark — abstract, not a trace of the raster icon.png (which
// can't be vectorized without image-analysis tooling this session doesn't
// have). Two overlapping chevrons on a rounded square, in the brand accent —
// reads as a "W" at any size, and is a real SVG so it can be Reanimated
// independently of the raster icon (splash sequence, onboarding).
export function WyberIcon({ size = 32, color = brand.accent }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Path
        d="M6 10L11 22L16 13L21 22L26 10"
        stroke={color}
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
