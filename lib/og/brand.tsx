/**
 * Shared building blocks for everything rendered through `next/og` (icons,
 * Open Graph image, PWA manifest screenshots).
 *
 * Satori only implements a subset of CSS, so these helpers stick to flexbox,
 * solid/linear-gradient backgrounds and absolutely positioned boxes. Vector art
 * is passed in as a base64 `data:` URI rather than inline `<svg>` children,
 * which is the most reliably supported path through Satori's image pipeline.
 */

export const BRAND = {
  orange: "#ff6a2b",
  orangeDeep: "#e8500a",
  orangeSoft: "#ffa16b",
  bg: "#09090b",
  surface: "#121216",
  surfaceRaised: "#1b1b21",
  border: "#27272d",
  fg: "#fafafa",
  muted: "#a1a1aa",
} as const;

/** The logo mark as a standalone SVG document. */
export function markSvg({
  bg = "transparent",
  radius = 0,
  stroke = BRAND.fg,
  accent = BRAND.orange,
  /** Extra padding around the 48-unit artboard, in artboard units. */
  inset = 0,
}: {
  bg?: string;
  radius?: number;
  stroke?: string;
  accent?: string;
  inset?: number;
} = {}) {
  const total = 48 + inset * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${total}" height="${total}">
  <rect width="${total}" height="${total}" rx="${radius}" fill="${bg}"/>
  <g transform="translate(${inset} ${inset})">
    <path d="M12 7H36A7 7 0 0 1 43 14V30A7 7 0 0 1 36 37H21L12 44.5V37A7 7 0 0 1 5 30V14A7 7 0 0 1 12 7Z" fill="none" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M23 17.4C20 15 16.6 13.8 12.8 13.8V25.6C16.6 25.6 20 26.8 23 29.2Z" fill="${stroke}"/>
    <path d="M25 17.4C28 15 31.4 13.8 35.2 13.8V25.6C31.4 25.6 28 26.8 25 29.2Z" fill="${accent}"/>
  </g>
</svg>`;
}

export function svgDataUri(svg: string) {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function markDataUri(opts?: Parameters<typeof markSvg>[0]) {
  return svgDataUri(markSvg(opts));
}

/**
 * A stand-in comic page. Real page art can't be embedded (the archives live on
 * the user's device), so screenshots use abstract panel grids that read as
 * comic pages at thumbnail size without pretending to be someone's artwork.
 */
export function panelPageSvg(seed: number, w = 300, h = 460) {
  const pad = 14;
  const gap = 10;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  // A few deterministic layouts so adjacent pages don't look identical.
  const layouts = [
    [
      [0, 0, 1, 0.34],
      [0, 0.34, 0.5, 0.33],
      [0.5, 0.34, 0.5, 0.33],
      [0, 0.67, 1, 0.33],
    ],
    [
      [0, 0, 0.55, 0.42],
      [0.55, 0, 0.45, 0.42],
      [0, 0.42, 1, 0.3],
      [0, 0.72, 0.35, 0.28],
      [0.35, 0.72, 0.65, 0.28],
    ],
    [
      [0, 0, 1, 0.5],
      [0, 0.5, 0.33, 0.5],
      [0.33, 0.5, 0.34, 0.5],
      [0.67, 0.5, 0.33, 0.5],
    ],
  ];
  const layout = layouts[seed % layouts.length];

  // Inked panels, not empty boxes: at thumbnail size the difference between
  // "a comic page" and "a loading skeleton" is almost entirely tonal weight.
  const INKS = ["#3f3f46", "#52525b", "#71717a", "#27272a", "#5b616b"];

  const panels = layout
    .map(([x, y, pw, ph], i) => {
      const px = pad + x * innerW + (x > 0 ? gap / 2 : 0);
      const py = pad + y * innerH + (y > 0 ? gap / 2 : 0);
      const rw = pw * innerW - (x > 0 ? gap / 2 : 0) - (x + pw < 1 ? gap / 2 : 0);
      const rh = ph * innerH - (y > 0 ? gap / 2 : 0) - (y + ph < 1 ? gap / 2 : 0);

      // One panel per page carries the brand accent, the rest are neutral ink.
      const accent = (seed + i) % 5 === 1;
      const fill = accent ? BRAND.orange : INKS[(seed * 3 + i * 7) % INKS.length];

      const parts = [
        `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${rw.toFixed(1)}" height="${rh.toFixed(1)}" rx="3" fill="${fill}"/>`,
      ];

      // Roomy panels get a speech balloon — the single strongest visual cue
      // that this is a comic rather than a wireframe.
      if (rw > innerW * 0.3 && rh > innerH * 0.18 && (seed + i) % 3 !== 2) {
        const bw = Math.min(rw * 0.46, 92);
        const bh = Math.min(rh * 0.3, 34);
        const bx = px + rw * ((seed + i) % 2 === 0 ? 0.08 : 0.46);
        const by = py + rh * 0.09;
        parts.push(
          `<rect x="${bx.toFixed(1)}" y="${by.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="${(bh / 2).toFixed(1)}" fill="#fafafa"/>`,
          `<path d="M${(bx + bw * 0.24).toFixed(1)} ${(by + bh).toFixed(1)}l${(bh * 0.34).toFixed(1)} ${(bh * 0.42).toFixed(1)}l${(bh * 0.1).toFixed(1)} ${(-bh * 0.42).toFixed(1)}z" fill="#fafafa"/>`,
          `<rect x="${(bx + bw * 0.16).toFixed(1)}" y="${(by + bh * 0.36).toFixed(1)}" width="${(bw * 0.68).toFixed(1)}" height="${Math.max(2, bh * 0.13).toFixed(1)}" rx="1" fill="${fill}" fill-opacity="0.45"/>`,
        );
      }

      // A horizon line gives the flat fill some sense of depth.
      if (rh > innerH * 0.22) {
        parts.push(
          `<rect x="${px.toFixed(1)}" y="${(py + rh * 0.68).toFixed(1)}" width="${rw.toFixed(1)}" height="${(rh * 0.32).toFixed(1)}" fill="#18181b" fill-opacity="0.22"/>`,
        );
      }

      return parts.join("");
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <rect width="${w}" height="${h}" fill="#f4f4f5"/>
  ${panels}
</svg>`;
}

export function panelPageUri(seed: number, w?: number, h?: number) {
  return svgDataUri(panelPageSvg(seed, w, h));
}
