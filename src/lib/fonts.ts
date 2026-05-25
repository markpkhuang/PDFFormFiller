/**
 * Font registry shared between preview and export.
 *
 * The browser preview uses CSS font names directly. At export time, pdf-lib
 * embeds the matching Standard 14 PDF font. By using the SAME small set of
 * font families on both sides, on-screen and exported text wrap and lay out
 * identically (within rendering tolerance).
 *
 * Bold/italic variants are selected at export by mapping (family, bold,
 * italic) → StandardFont enum.
 */

import { StandardFonts } from "pdf-lib";

export interface FontDef {
  /** Display label in the UI. */
  label: string;
  /** CSS font-family stack used in the preview. */
  css: string;
  /** Map (bold, italic) → pdf-lib StandardFont. */
  variants: {
    regular: StandardFonts;
    bold: StandardFonts;
    italic: StandardFonts;
    boldItalic: StandardFonts;
  };
}

export const FONT_REGISTRY: Record<string, FontDef> = {
  Helvetica: {
    label: "Helvetica",
    css: "Helvetica, Arial, sans-serif",
    variants: {
      regular: StandardFonts.Helvetica,
      bold: StandardFonts.HelveticaBold,
      italic: StandardFonts.HelveticaOblique,
      boldItalic: StandardFonts.HelveticaBoldOblique,
    },
  },
  "Times Roman": {
    label: "Times Roman",
    css: "'Times New Roman', Times, serif",
    variants: {
      regular: StandardFonts.TimesRoman,
      bold: StandardFonts.TimesRomanBold,
      italic: StandardFonts.TimesRomanItalic,
      boldItalic: StandardFonts.TimesRomanBoldItalic,
    },
  },
  Courier: {
    label: "Courier",
    css: "'Courier New', Courier, monospace",
    variants: {
      regular: StandardFonts.Courier,
      bold: StandardFonts.CourierBold,
      italic: StandardFonts.CourierOblique,
      boldItalic: StandardFonts.CourierBoldOblique,
    },
  },
};

export const DEFAULT_FONT = "Helvetica";

export function getStandardFontForStyle(
  family: string,
  bold: boolean,
  italic: boolean,
): StandardFonts {
  const def = FONT_REGISTRY[family] ?? FONT_REGISTRY[DEFAULT_FONT];
  if (bold && italic) return def.variants.boldItalic;
  if (bold) return def.variants.bold;
  if (italic) return def.variants.italic;
  return def.variants.regular;
}
