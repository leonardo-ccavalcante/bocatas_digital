import type { SVGProps } from "react";

interface ProgramGlyphProps extends SVGProps<SVGSVGElement> {
  slug: string;
  className?: string;
}

/**
 * Monochrome editorial glyphs — one per program slug.
 * Renders a semantic <svg> using `currentColor` so the parent controls color.
 */
export function ProgramGlyph({ slug, className = "h-6 w-6", ...rest }: ProgramGlyphProps) {
  const common = {
    fill: "none" as const,
    stroke: "currentColor" as const,
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (slug) {
    case "comedor_social":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...common} {...rest}>
          <path d="M5 3v8a2 2 0 0 0 2 2v8" />
          <path d="M9 3v6" />
          <path d="M7 3v6" />
          <path d="M17 3c-1.5 0-3 1.5-3 4s1.5 4 3 4v10" />
        </svg>
      );
    case "ropero":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...common} {...rest}>
          <path d="M9 4l3 2 3-2 5 4-2 3-3-1v8H6v-8L3 11 1 8z" />
        </svg>
      );
    case "ducha_aseo":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...common} {...rest}>
          <path d="M12 3v4" />
          <circle cx="12" cy="10" r="4" />
          <path d="M9 14l-1 6" />
          <path d="M12 14v6" />
          <path d="M15 14l1 6" />
        </svg>
      );
    case "programa_familias":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...common} {...rest}>
          <circle cx="8" cy="8" r="2.5" />
          <circle cx="16" cy="8" r="2.5" />
          <path d="M3 19c0-3 2.5-5 5-5s5 2 5 5" />
          <path d="M11 19c0-3 2.5-5 5-5s5 2 5 5" />
        </svg>
      );
    case "acompanamiento":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...common} {...rest}>
          <path d="M4 12l3-3 3 3 3-3 4 4 3-3" />
          <path d="M4 16h16" />
        </svg>
      );
    case "talleres":
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...common} {...rest}>
          <path d="M4 20l8-14 4 7" />
          <path d="M14 13l3-1 4 7H8" />
          <circle cx="9" cy="9" r="1" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true" {...common} {...rest}>
          <circle cx="12" cy="12" r="6" />
        </svg>
      );
  }
}
