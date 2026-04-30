# Implementation Plan: Logo Navigation + Mobile Footer

**Date:** 2026-04-26  
**Features:** Logo click navigation to home + Mobile footer navigation  
**Status:** Ready for execution

---

## Overview

Two complementary features to improve mobile navigation:

1. **Feature A:** Make Bocatas logo clickable → navigates to home (if not already there)
2. **Feature B:** Add fixed mobile footer with Home/Check-in/Personas icons

Both features are implemented in AppShell.tsx and related components.

---

## Feature A: Logo Click Navigation

### Task A1: Add Click Handler to Desktop Logo

**File:** `client/src/components/layout/AppShell.tsx`  
**Location:** Line 133-173 (Desktop sidebar logo section)

**Steps:**
1. Import `useLocation` hook from wouter (already imported)
2. Add state: `const [location] = useLocation();`
3. Create handler function:
   ```typescript
   const handleLogoClick = () => {
     if (location !== "/") {
       navigate("/");
     }
   };
   ```
4. Wrap logo div (lines 140-152) with `<button>` or add `onClick` to parent
5. Add `cursor-pointer hover:opacity-80` classes for visual feedback
6. Test: Click logo on different pages, verify navigation only happens when not on home

**Verification:**
- ✅ Logo is clickable (cursor changes to pointer)
- ✅ Clicking on home page does nothing
- ✅ Clicking on other pages navigates to home
- ✅ No console errors

---

### Task A2: Add Click Handler to Mobile Logo

**File:** `client/src/components/layout/AppShell.tsx`  
**Location:** Line 244-250 (Mobile header logo)

**Steps:**
1. Add same `handleLogoClick` function (or reuse from Task A1)
2. Wrap mobile header logo (lines 244-250) with clickable element
3. Add `cursor-pointer hover:opacity-80` classes
4. Test on mobile viewport

**Verification:**
- ✅ Mobile logo is clickable
- ✅ Same navigation behavior as desktop
- ✅ Works on all mobile sizes

---

## Feature B: Mobile Footer Navigation

### Task B1: Create MobileFooterNav Component

**File:** Create `client/src/components/layout/MobileFooterNav.tsx`

**Content:**
```typescript
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
```

**Verification:**
- ✅ Component renders without errors
- ✅ Icons display correctly
- ✅ Active state shows current page
- ✅ Only visible on mobile (`md:hidden` works)

---

### Task B2: Add MobileFooterNav to AppShell

**File:** `client/src/components/layout/AppShell.tsx`

**Steps:**
1. Import MobileFooterNav component at top
2. Add component inside mobile section (after main content, before closing div)
3. Location: After line 348 `</main>` closing tag, before line 349 `</div>` closing tag

**Code to add:**
```typescript
<MobileFooterNav />
```

**Verification:**
- ✅ Footer appears on mobile
- ✅ Footer is hidden on desktop (md:hidden works)
- ✅ Footer is fixed at bottom
- ✅ Navigation works

---

### Task B3: Adjust Main Content Padding

**File:** `client/src/components/layout/AppShell.tsx`

**Steps:**
1. Find main content section (line 346: `<main className="flex-1 overflow-y-auto">`)
2. Add mobile-specific padding-bottom to prevent content overlap
3. Update className to include `md:pb-0 pb-16` (pb-16 = 64px, matches footer height)

**Before:**
```typescript
<main className="flex-1 overflow-y-auto">
```

**After:**
```typescript
<main className="flex-1 overflow-y-auto pb-16 md:pb-0">
```

**Verification:**
- ✅ Content doesn't get hidden behind footer on mobile
- ✅ Desktop layout unchanged (md:pb-0)
- ✅ No double padding on desktop
- ✅ Scrollable content shows properly

---

## Testing Checklist

### Desktop Testing
- ✅ Logo click navigation works
- ✅ Mobile footer is hidden
- ✅ Sidebar navigation unchanged
- ✅ All pages load correctly

### Mobile Testing (all sizes)
- ✅ Logo click navigation works
- ✅ Mobile footer appears at bottom
- ✅ Footer icons are clickable
- ✅ Active state shows current page
- ✅ Content not hidden behind footer
- ✅ No layout shifts when navigating
- ✅ Footer stays fixed when scrolling

### Responsive Testing
- ✅ iPhone SE (375px)
- ✅ iPhone 12 (390px)
- ✅ iPad (768px - footer should hide)
- ✅ Desktop (1024px+)

---

## Verification Steps

After each task:
1. Run `pnpm test` to ensure no regressions
2. Check browser console for errors
3. Test on actual mobile device or DevTools mobile emulation
4. Verify responsive behavior at breakpoints

---

## Success Criteria

**Feature A:**
- ✅ Logo is clickable on all pages
- ✅ Clicking logo navigates to home (if not already there)
- ✅ No page refresh when already on home
- ✅ Works on both desktop and mobile

**Feature B:**
- ✅ Footer appears only on mobile
- ✅ Footer is fixed at bottom (doesn't scroll away)
- ✅ 3 navigation icons: Home, Check-in, Personas
- ✅ Active state shows current page
- ✅ No content hidden behind footer
- ✅ Responsive on all mobile sizes
- ✅ Desktop layout completely unchanged

**Overall:**
- ✅ All 554 tests still passing
- ✅ 0 new failures or regressions
- ✅ No console errors
- ✅ Code follows existing patterns in AppShell.tsx

---

## Files to Modify

1. **Create:** `client/src/components/layout/MobileFooterNav.tsx` (new component)
2. **Modify:** `client/src/components/layout/AppShell.tsx` (logo click + footer integration)

---

## Rollback Plan

If issues arise:
1. Revert AppShell.tsx changes
2. Delete MobileFooterNav.tsx
3. Restore from previous checkpoint

---

## Notes

- Use existing Lucide React icons (Home, QrCode, Users)
- Follow existing color scheme: `#C41230` (primary red), `#5E5E5E` (gray)
- Match existing border/shadow styles
- Maintain accessibility (aria-labels, semantic HTML)
- No breaking changes to existing functionality
