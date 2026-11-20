/**
 * react-native-gesture-handler for tests that draw the chat but don't drag
 * anything: `Gesture` builders chain and do nothing, `GestureDetector` draws
 * its child, every other export is a plain View.
 *   jest.mock('react-native-gesture-handler', () => require('./gestureStub').gestureHandler());
 */
export function gestureHandler() {
  const RN = jest.requireActual<typeof import('react-native')>('react-native');
  const chain: unknown = new Proxy(() => chain, { get: () => chain, apply: () => chain });
  const parts: Record<string, unknown> = {
    __esModule: true,
    Gesture: new Proxy({}, { get: () => () => chain }),
    GestureDetector: ({ children }: { children: unknown }) => children,
  };
  return new Proxy(parts, { get: (t, k) => (k in t ? t[k as string] : RN.View) });
}
