/**
 * Static abstract wash for the hero — CSS only, no animation.
 * Soft ribbons in the amber-copper palette, denser on the right like Stripe’s hero.
 */
export const HeroBackdrop = () => (
  <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
    <div className="hero-ribbon hero-ribbon-a" />
    <div className="hero-ribbon hero-ribbon-b" />
    <div className="hero-ribbon hero-ribbon-c" />
    <div className="hero-ribbon hero-ribbon-d" />
    <div className="hero-fade" />
  </div>
);
