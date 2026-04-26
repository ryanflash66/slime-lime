/* global React */
/*
  <Bottle> — Slime Lime square juice bottle mockup.
  SVG renders glass body, metal twist cap, flower-blob cap sticker, and a
  blob-edged front label with brand + flavor + subtitle. Recolorable per SKU.

  Props:
    juice        liquid color (hex) — also tints the cap sticker by default
    capSticker   override cap-sticker color
    accent       label flavor-name + bg accent (defaults to a darker juice)
    brand        top label text  (default "SLIME LIME")
    flavor       big flavor name (e.g. "Lemon · Lime")
    subtitle     small caps subtitle (e.g. "CLEAN FOCUS")
    stats        bottom-of-label line (default "75MG · 5G · 12FL OZ")
    height       rendered height in px (default 360)
*/

function _slBlobPath(cx, cy, r, bumps = 5, bumpRatio = 0.22, rot = 0) {
  // alternating inner/outer radii sampled around the circle, joined by quadratic curves.
  const n = bumps * 2;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2 + rot;
    const rad = i % 2 === 0 ? r * (1 + bumpRatio) : r * (1 - bumpRatio * 0.35);
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  let d = '';
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const next = pts[(i + 1) % pts.length];
    const mx = (p[0] + next[0]) / 2;
    const my = (p[1] + next[1]) / 2;
    if (i === 0) d += `M ${mx.toFixed(2)} ${my.toFixed(2)} `;
    else d += `Q ${p[0].toFixed(2)} ${p[1].toFixed(2)} ${mx.toFixed(2)} ${my.toFixed(2)} `;
  }
  // close to first midpoint
  const first = pts[0], last = pts[pts.length - 1];
  const mx0 = (last[0] + first[0]) / 2;
  const my0 = (last[1] + first[1]) / 2;
  d += `Q ${last[0].toFixed(2)} ${last[1].toFixed(2)} ${mx0.toFixed(2)} ${my0.toFixed(2)} Z`;
  return d;
}

function Bottle({
  juice = '#CAE00F',
  capSticker,
  accent,
  brand = 'SLIME LIME',
  flavor = 'Lemon · Lime',
  subtitle = 'CLEAN FOCUS',
  stats = '75MG  ·  5G SUGAR  ·  12FL OZ',
  height = 360,
  uid = Math.random().toString(36).slice(2, 8),
}) {
  const W = 220, H = 540;
  const stickerColor = capSticker || juice;
  const labelAccent = accent || juice;

  // Blob shapes
  const capStickerD = _slBlobPath(110, 50, 22, 5, 0.32);
  const labelD = _slBlobPath(110, 360, 78, 6, 0.14);

  return (
    <svg viewBox={`0 0 ${W} ${H}`}
         width="auto" height={height}
         style={{ display: 'block', overflow: 'visible' }}
         xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* Juice gradient — translucent at top (meniscus), dense in the body */}
        <linearGradient id={`juice-${uid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={juice} stopOpacity="0.55"/>
          <stop offset="0.05" stopColor={juice} stopOpacity="0.85"/>
          <stop offset="0.5" stopColor={juice} stopOpacity="1"/>
          <stop offset="1" stopColor={juice} stopOpacity="0.95"/>
        </linearGradient>
        {/* Glass refraction on left edge — bright vertical streak */}
        <linearGradient id={`shineL-${uid}`} x1="0" x2="1">
          <stop offset="0" stopColor="rgba(255,255,255,0.6)"/>
          <stop offset="0.4" stopColor="rgba(255,255,255,0.18)"/>
          <stop offset="1" stopColor="rgba(255,255,255,0)"/>
        </linearGradient>
        {/* Soft right-edge highlight */}
        <linearGradient id={`shineR-${uid}`} x1="0" x2="1">
          <stop offset="0" stopColor="rgba(255,255,255,0)"/>
          <stop offset="1" stopColor="rgba(255,255,255,0.4)"/>
        </linearGradient>
        {/* Inner darker tint at bottom (dense juice) */}
        <linearGradient id={`bottom-${uid}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="rgba(0,0,0,0)"/>
          <stop offset="1" stopColor="rgba(0,0,0,0.28)"/>
        </linearGradient>
        {/* Cap chrome */}
        <linearGradient id={`cap-${uid}`} x1="0" x2="1">
          <stop offset="0" stopColor="#6a6a6a"/>
          <stop offset="0.15" stopColor="#bdbdbd"/>
          <stop offset="0.4" stopColor="#fafafa"/>
          <stop offset="0.58" stopColor="#dddddd"/>
          <stop offset="0.82" stopColor="#8a8a8a"/>
          <stop offset="1" stopColor="#4e4e4e"/>
        </linearGradient>
        {/* Bottle silhouette clip path so highlights stay inside the body */}
        <clipPath id={`bottle-clip-${uid}`}>
          <path d="
            M 30 510
            L 30 145
            Q 30 130 38 122
            L 56 96
            Q 60 90 60 84
            L 60 78
            Q 60 72 66 72
            L 154 72
            Q 160 72 160 78
            L 160 84
            Q 160 90 164 96
            L 182 122
            Q 190 130 190 145
            L 190 510
            Q 190 520 180 520
            L 40 520
            Q 30 520 30 510 Z"/>
        </clipPath>
      </defs>

      {/* drop shadow under bottle */}
      <ellipse cx="110" cy="525" rx="92" ry="8" fill="rgba(0,0,0,0.45)" filter="blur(2px)"/>

      {/* === BOTTLE BODY === */}
      {/* clear-glass tint behind juice fill (gives silhouette a thin glass edge) */}
      <path d="
        M 30 510
        L 30 145
        Q 30 130 38 122
        L 56 96
        Q 60 90 60 84
        L 60 78
        Q 60 72 66 72
        L 154 72
        Q 160 72 160 78
        L 160 84
        Q 160 90 164 96
        L 182 122
        Q 190 130 190 145
        L 190 510
        Q 190 520 180 520
        L 40 520
        Q 30 520 30 510 Z"
        fill={`url(#juice-${uid})`}
        stroke="rgba(0,0,0,0.22)"
        strokeWidth="1.2"/>

      {/* dense juice at bottom */}
      <rect x="30" y="320" width="160" height="200"
            fill={`url(#bottom-${uid})`}
            clipPath={`url(#bottle-clip-${uid})`}/>

      {/* meniscus highlight (juice surface) */}
      <ellipse cx="110" cy="138" rx="78" ry="5"
               fill="rgba(255,255,255,0.45)"
               clipPath={`url(#bottle-clip-${uid})`}/>
      <ellipse cx="110" cy="142" rx="78" ry="3"
               fill="rgba(0,0,0,0.18)"
               clipPath={`url(#bottle-clip-${uid})`}/>

      {/* big left-edge refraction streak */}
      <rect x="34" y="120" width="14" height="380"
            fill={`url(#shineL-${uid})`}
            clipPath={`url(#bottle-clip-${uid})`}/>
      {/* secondary thin left highlight */}
      <rect x="52" y="160" width="2" height="320"
            fill="rgba(255,255,255,0.22)"
            clipPath={`url(#bottle-clip-${uid})`}/>
      {/* right edge highlight */}
      <rect x="170" y="120" width="18" height="380"
            fill={`url(#shineR-${uid})`}
            clipPath={`url(#bottle-clip-${uid})`}/>
      {/* faint top shoulder highlight */}
      <path d="M 56 96 Q 60 90 60 84 L 160 84 Q 160 90 164 96 Z"
            fill="rgba(255,255,255,0.18)"/>
      {/* base ground reflection */}
      <ellipse cx="110" cy="514" rx="68" ry="3"
               fill="rgba(255,255,255,0.18)"
               clipPath={`url(#bottle-clip-${uid})`}/>

      {/* === CAP === */}
      {/* cap body */}
      <rect x="60" y="38" width="100" height="40" rx="3" fill={`url(#cap-${uid})`}/>
      {/* cap top edge shine */}
      <rect x="60" y="38" width="100" height="5" rx="2" fill="rgba(255,255,255,0.55)"/>
      {/* cap ridges */}
      {Array.from({ length: 12 }).map((_, i) => (
        <rect key={i} x={64 + i * 8} y="46" width="2" height="26" fill="rgba(0,0,0,0.18)"/>
      ))}
      {/* cap bottom shadow line where it meets neck */}
      <rect x="60" y="74" width="100" height="4" fill="rgba(0,0,0,0.28)"/>

      {/* === CAP STICKER (flower blob) === */}
      <path d={capStickerD} fill="#ffffff"/>
      <path d={_slBlobPath(110, 50, 16, 5, 0.32)} fill={stickerColor}/>

      {/* === FRONT LABEL === */}
      {/* outer blob */}
      <path d={labelD} fill="#ffffff" stroke="rgba(0,0,0,0.06)" strokeWidth="0.5"/>
      {/* small label header */}
      <text x="110" y="305" textAnchor="middle"
            fontFamily="'Space Grotesk', sans-serif"
            fontWeight="700" fontSize="9"
            letterSpacing="2"
            fill="#0E0F0A">
        {brand}
      </text>
      {/* big flavor name (chunky display) */}
      <text x="110" y="355" textAnchor="middle"
            fontFamily="'Bricolage Grotesque', 'Space Grotesk', sans-serif"
            fontWeight="800" fontSize="22"
            letterSpacing="-1"
            fill={labelAccent}>
        {flavor.split(' · ')[0] || flavor}
      </text>
      {flavor.includes(' · ') && (
        <text x="110" y="378" textAnchor="middle"
              fontFamily="'Bricolage Grotesque', 'Space Grotesk', sans-serif"
              fontWeight="800" fontSize="22"
              letterSpacing="-1"
              fill={labelAccent}>
          {flavor.split(' · ')[1]}
        </text>
      )}
      {/* subtitle */}
      <text x="110" y={flavor.includes(' · ') ? 400 : 380} textAnchor="middle"
            fontFamily="'Space Grotesk', sans-serif"
            fontWeight="600" fontSize="9"
            letterSpacing="2.4"
            fill="#0E0F0A">
        {subtitle.toUpperCase()}
      </text>
      {/* stats line at base of label */}
      <text x="110" y="425" textAnchor="middle"
            fontFamily="'JetBrains Mono', monospace"
            fontWeight="500" fontSize="6.5"
            letterSpacing="1.4"
            fill="rgba(14,15,10,0.72)">
        {stats}
      </text>
    </svg>
  );
}

window.Bottle = Bottle;
