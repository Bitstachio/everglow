/**
 * Static abstract wash for the hero — CSS only, no animation.
 * Two soft circles (copper + purple), separated like Cohere’s color fields.
 */
export const HeroBackdrop = () => (
  <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
    <div className="hero-blob hero-blob-copper" />
    <div className="hero-blob hero-blob-purple" />
    <div className="hero-fade" />
  </div>
);
