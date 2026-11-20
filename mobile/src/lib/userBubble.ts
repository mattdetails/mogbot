import { bubbleColors, colorwayOf, keyLookFor } from '@shipstudio/companion-protocol';
import { useColors } from './appearance';

/**
 * Your bubble in an agent's chat: that agent's key colour, its words in
 * whichever of white and near-black reads better (`bubbleColors`, shared with
 * the desk). Without an agent (a preview), the theme's own bubble.
 */
export function useUserBubble(agent?: { name: string } | null) {
  const colors = useColors();
  if (!agent) return { fill: colors.surfaceBubbleUser, ink: colors.textOnBubbleUser };
  const b = bubbleColors(
    colorwayOf(keyLookFor(agent as Parameters<typeof keyLookFor>[0]).colorway).face
  );
  return { fill: b.fill, ink: b.ink };
}
