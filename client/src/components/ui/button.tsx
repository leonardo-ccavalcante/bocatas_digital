import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Base: pill shape, Inter font, min-height 44px, smooth transitions
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-4 focus-visible:ring-[#C41230]/30 focus-visible:ring-offset-1 aria-invalid:ring-destructive/20 aria-invalid:border-destructive select-none",
  {
    variants: {
      variant: {
        // Bocatas primary: red gradient
        default:
          "bg-gradient-to-r from-[#C41230] to-[#e51538] text-white shadow-md hover:from-[#a30e26] hover:to-[#C41230] hover:shadow-lg active:scale-[0.98]",
        destructive:
          "bg-destructive text-white shadow-sm hover:bg-destructive/90 focus-visible:ring-destructive/30",
        // Outline: red border, transparent bg
        outline:
          "border-2 border-[#C41230] bg-transparent text-[#C41230] hover:bg-[#C41230]/5 active:scale-[0.98]",
        // Secondary: white with subtle shadow
        secondary:
          "bg-white text-foreground border border-border shadow-sm hover:bg-muted hover:border-[#C41230]/30 hover:text-[#C41230] active:scale-[0.98]",
        ghost:
          "hover:bg-accent hover:text-accent-foreground active:scale-[0.98]",
        link: "text-[#C41230] underline-offset-4 hover:underline rounded-none",
      },
      size: {
        default: "h-11 px-6 py-2.5 has-[>svg]:px-4",
        sm: "h-9 px-4 py-2 text-xs has-[>svg]:px-3",
        lg: "h-13 px-8 py-3 text-base has-[>svg]:px-6",
        icon: "size-10",
        "icon-sm": "size-8",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
