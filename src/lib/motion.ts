/**
 * Reduce Motion, for the motion CSS can't reach. Stylesheets are held by the
 * floor in base.css; a scroll started from script ignores `scroll-behavior`,
 * so it asks here.
 *
 * @module lib/motion
 */

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** `behavior` for scrollTo / scrollIntoView: a glide, or a jump under Reduce Motion. */
export function scrollMotion(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}

/**
 * Whether an exit can be animated here: a real engine (not jsdom, whose
 * elements have no Web Animations) and no Reduce Motion. Without one, a thing
 * that closes simply unmounts, as it always did.
 */
export function canAnimateExit(): boolean {
  return (
    typeof Element !== 'undefined' &&
    typeof Element.prototype.getAnimations === 'function' &&
    !prefersReducedMotion()
  );
}
