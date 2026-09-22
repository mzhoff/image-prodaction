// Lightweight media slots: no downloads or video decoding until real showcase
// assets are supplied. The silhouettes are intentionally decorative placeholders.
export function AuthPromoGallery() {
  return <div className="auth-promo-gallery" aria-hidden="true">
    {['sky', 'peach', 'lilac', 'mint', 'rose', 'blue'].map((tone) => (
      <div key={tone} className={`auth-promo-card auth-promo-card-${tone}`}>
        <div className="auth-promo-card-media"><span /><i /></div>
        <div className="auth-promo-card-caption"><span /><span /></div>
      </div>
    ))}
  </div>;
}
