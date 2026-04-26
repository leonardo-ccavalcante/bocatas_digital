import { Link, useLocation } from "wouter";
import { Home, QrCode, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface FooterNavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const FOOTER_NAV_ITEMS: FooterNavItem[] = [
  { label: "Inicio", href: "/", icon: <Home className="h-5 w-5" /> },
  { label: "Check-in", href: "/checkin", icon: <QrCode className="h-5 w-5" /> },
  { label: "Personas", href: "/personas", icon: <Users className="h-5 w-5" /> },
];

export default function MobileFooterNav() {
  const [location] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-white border-t border-black/10 shadow-lg">
      <div className="flex items-center justify-around h-16">
        {FOOTER_NAV_ITEMS.map((item) => {
          const active = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "flex flex-col items-center justify-center w-full h-16 cursor-pointer transition-colors",
                  active
                    ? "text-[#C41230] bg-[#C41230]/5"
                    : "text-[#5E5E5E] hover:bg-black/5"
                )}
                title={item.label}
              >
                {item.icon}
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
