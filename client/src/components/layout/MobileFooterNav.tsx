import { Link, useLocation } from "wouter";
import { Home, QrCode, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BocatasRole } from "./ProtectedRoute";

interface FooterNavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  /** Omitted → visible to every role (mirrors AppShell NAV_ITEMS). */
  roles?: BocatasRole[];
}

const FOOTER_NAV_ITEMS: FooterNavItem[] = [
  { label: "Inicio", href: "/", icon: <Home className="h-5 w-5" /> },
  {
    label: "Check-in",
    href: "/checkin",
    icon: <QrCode className="h-5 w-5" />,
    roles: ["voluntario", "admin", "superadmin"],
  },
  {
    label: "Personas",
    href: "/personas",
    icon: <Users className="h-5 w-5" />,
    roles: ["voluntario", "admin", "superadmin"],
  },
];

export default function MobileFooterNav({ role }: { role: BocatasRole }) {
  const [location] = useLocation();
  const items = FOOTER_NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(role)
  );

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-background border-t border-border shadow-lg"
      aria-label="Navegación principal"
    >
      <div className="flex items-center justify-around h-16">
        {items.map((item) => {
          const active =
            location === item.href ||
            (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 min-w-[64px] h-16 px-2 cursor-pointer transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
                title={item.label}
                aria-current={active ? "page" : undefined}
              >
                <span className="shrink-0">{item.icon}</span>
                <span className={cn("text-[10px] leading-none", active ? "font-semibold" : "font-medium")}>{item.label}</span>
                {active && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mt-0.5" aria-hidden="true" />
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
