/**
 * DetailEmptyState — shared honest empty state for ficha tabs that have no
 * backing endpoint yet. No fabricated rows.
 */
import type { LucideIcon } from "lucide-react";

interface DetailEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function DetailEmptyState({
  icon: Icon,
  title,
  description,
}: DetailEmptyStateProps) {
  return (
    <div className="bocatas-card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <Icon className="h-8 w-8 text-muted-foreground opacity-40" aria-hidden="true" />
      <p className="text-h3 text-foreground">{title}</p>
      <p className="max-w-sm text-body-sm text-muted-foreground">{description}</p>
    </div>
  );
}
