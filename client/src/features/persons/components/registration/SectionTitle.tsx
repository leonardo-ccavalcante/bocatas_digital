interface SectionTitleProps {
  eyebrow: string;
  title: string;
  sub?: string;
}

/**
 * SectionTitle — editorial step heading ported from the v4 prototype.
 * Eyebrow (mono-uppercase) + display title + optional subtitle.
 */
export function SectionTitle({ eyebrow, title, sub }: SectionTitleProps) {
  return (
    <div className="mb-5">
      <p className="text-eyebrow text-muted-foreground">{eyebrow}</p>
      <h2 className="mt-1 text-h2 text-foreground">{title}</h2>
      {sub && <p className="mt-1 text-body-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}
