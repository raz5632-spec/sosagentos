import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

// Hebrew font bundled with the app (assets/Rubik.ttf). __dirname works because
// the api compiles to CommonJS; from dist/content/ this resolves to the app root.
const FONT_PATH = join(__dirname, "..", "..", "assets", "Rubik.ttf");

export interface Slide {
  title: string;
  body: string;
}

// Brand palette (S.O.S.) — deep indigo → violet gradient, warm accent.
const BG_TOP = "#1a1636";
const BG_BOT = "#3b1d6e";
const ACCENT = "#f5a524";
const TEXT = "#ffffff";
const MUTED = "#c9c3e6";

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!,
  );
}

/** Wrap text into lines of at most `max` characters (word-aware, RTL-safe). */
function wrap(text: string, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max) {
      if (cur) lines.push(cur.trim());
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) lines.push(cur.trim());
  return lines;
}

/** Render one 1080x1080 slide (RTL Hebrew) to a PNG buffer. */
export function renderSlide(slide: Slide, index: number, total: number): Buffer {
  const titleLines = wrap(slide.title, 22).slice(0, 3);
  const bodyLines = wrap(slide.body, 30).slice(0, 8);

  const svgLines: string[] = [];
  // Title block (large, accent), starting a bit above center.
  let y = 360;
  for (const line of titleLines) {
    svgLines.push(
      `<text x="980" y="${y}" text-anchor="end" direction="rtl" font-size="64" font-weight="700" fill="${ACCENT}">${escapeXml(line)}</text>`,
    );
    y += 82;
  }
  y += 40;
  for (const line of bodyLines) {
    svgLines.push(
      `<text x="980" y="${y}" text-anchor="end" direction="rtl" font-size="42" font-weight="500" fill="${TEXT}">${escapeXml(line)}</text>`,
    );
    y += 60;
  }

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${BG_TOP}"/>
      <stop offset="1" stop-color="${BG_BOT}"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1080" fill="url(#bg)"/>
  <rect x="100" y="150" width="60" height="10" rx="5" fill="${ACCENT}"/>
  <text x="980" y="140" text-anchor="end" direction="rtl" font-size="34" font-weight="700" fill="${TEXT}">S.O.S · אימון מכירות</text>
  ${svgLines.join("\n  ")}
  <text x="980" y="1000" text-anchor="end" direction="rtl" font-size="30" font-weight="500" fill="${MUTED}">שקף ${index} מתוך ${total}</text>
</svg>`;

  const resvg = new Resvg(svg, {
    font: { fontFiles: [FONT_PATH], defaultFontFamily: "Rubik", loadSystemFonts: false },
    background: BG_TOP,
  });
  return Buffer.from(resvg.render().asPng());
}

/** Parse a copy draft ("שקף 1: ...") into structured slides. */
export function parseSlides(draft: string): Slide[] {
  const parts = draft.split(/שקף\s*\d+\s*:/).map((p) => p.trim()).filter(Boolean);
  const slides: Slide[] = [];
  for (const part of parts) {
    const lines = part.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    slides.push({ title: lines[0].replace(/^\[|\]$/g, ""), body: lines.slice(1).join(" ") });
  }
  return slides.slice(0, 6);
}
