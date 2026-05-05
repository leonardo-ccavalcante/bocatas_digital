# Root Cause Analysis: ExportFamiliesModal Render Issue

> **Archived 2026-05-05** (was 204 lines, distilled to ≤150).
> Documents a debugging case from 2026-04-13. The fix has shipped.

## The bug

`ExportFamiliesModal` text broke at every character ("Actualización Completa" → A-c-t-u-a-l-i-z-a-c-i-ó-n…) when aggressive flex constraints (`min-w-0`) were applied. A previous "fix" had removed `break-words` and `min-w-0` — that worked but was symptom-based.

## The actual root cause

**Architectural anti-pattern:** wrapping a full `Card` (which is `display: flex flex-col`) inside a `Label` (which is `display: flex items-center gap-2`).

```tsx
// FRAGILE
<Label htmlFor={mode} className="flex-1 cursor-pointer">
  <Card>
    <CardTitle>...</CardTitle>
    <CardDescription>...</CardDescription>
  </Card>
</Label>
```

Why this is unstable:
1. `Label` is global `display: flex` (designed for `<label><input/></label>`).
2. `Card` is also `display: flex flex-col` (column container).
3. Nesting flex inside flex makes the parent's `flex-1` cascade constraints into the child's text — any `min-w-0` upstream forces text to break at the character level.

## Verification that no other modal had this pattern

- **`ImportFamiliesModal`** (stable) — uses `<label>` for a simple file input; `<Card>` rendered as a sibling, not a child of Label.
- **`DocumentUploadModal`** (stable) — explicit row pattern `flex items-start gap-4` with `min-w-0 flex-1` and `shrink-0` siblings; no nested flex.
- **`ExportFamiliesModal`** — the only modal wrapping `Card` inside `Label`. Unique in the codebase.

## The fix

```tsx
// AFTER
<div className="flex-1 cursor-pointer" onClick={() => setSelectedMode(mode)}>
  <Card>...</Card>
</div>
```

`onClick` preserves the click semantics; `RadioGroupItem` continues to handle form state. No flex nesting, no inherited shrink constraints, no character-level text break.

## Verification

- All 754 tests passing (at fix time)
- Zero TypeScript errors
- Click behavior identical
- Text wraps naturally with future CSS changes

## Architectural lessons captured

**Anti-pattern (avoid):**
```tsx
<Label className="flex-1">
  <Card>...</Card>     // ❌ DON'T — nested flex containers
</Label>
```

**Pattern 1 — simple input label (use):**
```tsx
<Label htmlFor="input-id">
  <Input id="input-id" />
</Label>
```

**Pattern 2 — card selection with neutral wrapper (use):**
```tsx
<div className="flex-1 cursor-pointer" onClick={handleSelect}>
  <Card>...</Card>
</div>
```

**Pattern 3 — explicit flex row (use):**
```tsx
<div className="flex items-start gap-4">
  <div className="min-w-0 flex-1">{/* content */}</div>
  <div className="shrink-0">{/* actions */}</div>
</div>
```

## Recommendations (still apply)

1. **Code review check**: when reviewing modals, look for `<Label>` wrapping `<Card>`.
2. **Component docs**: state explicitly that `Label` is for label + control pairs only.
3. **Pattern library**: standardize the neutral-`div`-with-onClick approach for card selection.

## Takeaway

Symptom fixes mask architectural problems. Removing `break-words` made the symptom go away but left the bomb armed for the next CSS change. Systematic debugging (read the symptom carefully → compare with stable peers → find the structural difference) is what surfaced the actual root cause.

This is one of the cases that informed the karpathy lens "fix root causes correctly, not the fastest path" applied to all later remediation work.
