# Announcement Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 3 production-ready announcement features: S3 image upload, visibility indicators showing publication status, and a scheduling dashboard for managing announcement timelines.

**Architecture:** 
- **Feature 1 (S3 Upload):** Replace data URLs with proper S3 storage via new tRPC mutation. AnnouncementImageUploader component calls mutation instead of storing base64 locally.
- **Feature 2 (Visibility Indicators):** Add status badges to announcements list showing published_at/expires_at states. Uses color-coded badges (scheduled, live, expired).
- **Feature 3 (Scheduling Dashboard):** Add calendar/timeline view in AdminNovedades showing when announcements will be published/expire. Visual timeline with drag-to-reschedule capability.

**Tech Stack:** React 19, tRPC, Tailwind 4, Zod, Drizzle ORM, Supabase, S3 storage

---

## File Structure

**New Files:**
- `server/routers/announcements.uploadImage.ts` — S3 image upload mutation
- `client/src/features/announcements/components/AnnouncementStatusBadge.tsx` — Status badge component
- `client/src/features/announcements/components/SchedulingDashboard.tsx` — Calendar/timeline view
- `client/src/features/announcements/__tests__/s3-upload.test.ts` — S3 upload tests
- `client/src/features/announcements/__tests__/visibility-indicators.test.ts` — Visibility indicator tests
- `client/src/features/announcements/__tests__/scheduling-dashboard.test.ts` — Dashboard tests

**Modified Files:**
- `client/src/components/AnnouncementImageUploader.tsx` — Use S3 mutation instead of data URLs
- `client/src/pages/AdminNovedades.tsx` — Add scheduling dashboard
- `server/routers/announcements.ts` — Add uploadImage procedure
- `client/src/pages/Novedades.tsx` — Add status badges to list

---

## Task 1: S3 Image Upload Mutation

**Files:**
- Create: `server/routers/announcements.uploadImage.ts`
- Modify: `server/routers/announcements.ts` (add uploadImage procedure)
- Test: `client/src/features/announcements/__tests__/s3-upload.test.ts`

### Step 1: Write failing test for S3 upload mutation

```typescript
// client/src/features/announcements/__tests__/s3-upload.test.ts
import { describe, it, expect, vi } from 'vitest';
import { trpc } from '@/lib/trpc';

describe('S3 Image Upload', () => {
  it('uploads image to S3 and returns URL', async () => {
    const imageFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const formData = new FormData();
    formData.append('file', imageFile);
    formData.append('announcementId', 'test-id');

    const result = await trpc.announcements.uploadImage.mutate({
      file: imageFile,
      announcementId: 'test-id',
    });

    expect(result).toHaveProperty('url');
    expect(result.url).toMatch(/^https:\/\//);
    expect(result.url).toContain('s3');
  });

  it('rejects non-image files', async () => {
    const textFile = new File(['test'], 'test.txt', { type: 'text/plain' });

    await expect(
      trpc.announcements.uploadImage.mutate({
        file: textFile,
        announcementId: 'test-id',
      })
    ).rejects.toThrow('Only image files are allowed');
  });

  it('rejects files larger than 5MB', async () => {
    const largeFile = new File(
      [new ArrayBuffer(6 * 1024 * 1024)],
      'large.jpg',
      { type: 'image/jpeg' }
    );

    await expect(
      trpc.announcements.uploadImage.mutate({
        file: largeFile,
        announcementId: 'test-id',
      })
    ).rejects.toThrow('File size exceeds 5MB limit');
  });
});
```

### Step 2: Run test to verify it fails

Run: `pnpm test client/src/features/announcements/__tests__/s3-upload.test.ts`

Expected: FAIL with "announcements.uploadImage is not a function"

### Step 3: Create uploadImage procedure in server

```typescript
// server/routers/announcements.uploadImage.ts
import { z } from 'zod';
import { protectedProcedure } from './base';
import { storagePut } from '../storage';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const uploadImageProcedure = protectedProcedure
  .input(
    z.object({
      file: z.instanceof(File),
      announcementId: z.string().uuid(),
    })
  )
  .mutation(async ({ input, ctx }) => {
    // Validate file type
    if (!ALLOWED_MIME_TYPES.includes(input.file.type)) {
      throw new Error('Only image files are allowed (JPEG, PNG, WebP, GIF)');
    }

    // Validate file size
    if (input.file.size > MAX_FILE_SIZE) {
      throw new Error('File size exceeds 5MB limit');
    }

    // Convert file to buffer
    const buffer = await input.file.arrayBuffer();

    // Generate unique key with random suffix to prevent enumeration
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const fileKey = `announcements/${ctx.user.id}/${input.announcementId}/${timestamp}-${randomSuffix}.jpg`;

    // Upload to S3
    const { url } = await storagePut(fileKey, Buffer.from(buffer), input.file.type);

    return { url, fileKey };
  });
```

### Step 4: Add uploadImage to announcements router

```typescript
// server/routers/announcements.ts - Add to router
import { uploadImageProcedure } from './announcements.uploadImage';

export const announcementsRouter = router({
  // ... existing procedures
  uploadImage: uploadImageProcedure,
});
```

### Step 5: Run test to verify it passes

Run: `pnpm test client/src/features/announcements/__tests__/s3-upload.test.ts`

Expected: PASS (3 tests)

### Step 6: Commit

```bash
git add server/routers/announcements.uploadImage.ts server/routers/announcements.ts client/src/features/announcements/__tests__/s3-upload.test.ts
git commit -m "feat: add S3 image upload mutation for announcements"
```

---

## Task 2: Update AnnouncementImageUploader to Use S3

**Files:**
- Modify: `client/src/components/AnnouncementImageUploader.tsx`
- Test: Update existing component tests

### Step 1: Write failing test for S3 integration in uploader

```typescript
// client/src/components/__tests__/AnnouncementImageUploader.s3.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnnouncementImageUploader } from '../AnnouncementImageUploader';

describe('AnnouncementImageUploader - S3 Integration', () => {
  it('uploads image to S3 and returns URL', async () => {
    const onImageSelect = vi.fn();
    const user = userEvent.setup();

    render(
      <AnnouncementImageUploader
        onImageSelect={onImageSelect}
        announcementId="test-id"
      />
    );

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const input = screen.getByRole('button', { name: /upload/i }).closest('input');

    if (input) {
      await user.upload(input, file);
    }

    await waitFor(() => {
      expect(onImageSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringMatching(/^https:\/\//),
        })
      );
    });
  });

  it('shows loading state during upload', async () => {
    const onImageSelect = vi.fn();
    const user = userEvent.setup();

    render(
      <AnnouncementImageUploader
        onImageSelect={onImageSelect}
        announcementId="test-id"
      />
    );

    const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const input = screen.getByRole('button', { name: /upload/i }).closest('input');

    if (input) {
      await user.upload(input, file);
    }

    expect(screen.getByRole('status')).toHaveClass('animate-spin');
  });
});
```

### Step 2: Run test to verify it fails

Run: `pnpm test client/src/components/__tests__/AnnouncementImageUploader.s3.test.tsx`

Expected: FAIL with "uploadImage mutation not called"

### Step 3: Update AnnouncementImageUploader to use S3 mutation

```typescript
// client/src/components/AnnouncementImageUploader.tsx
import { useState } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';

interface AnnouncementImageUploaderProps {
  onImageSelect: (image: { url: string; fileKey: string }) => void;
  announcementId: string;
}

export function AnnouncementImageUploader({
  onImageSelect,
  announcementId,
}: AnnouncementImageUploaderProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const uploadMutation = trpc.announcements.uploadImage.useMutation();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (event) => {
      setPreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to S3
    setIsLoading(true);
    try {
      const result = await uploadMutation.mutateAsync({
        file,
        announcementId,
      });
      onImageSelect(result);
    } catch (error) {
      console.error('Upload failed:', error);
      setPreview(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    onImageSelect({ url: '', fileKey: '' });
  };

  return (
    <div className="space-y-3">
      <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
        {preview ? (
          <div className="relative">
            <img src={preview} alt="Preview" className="max-h-48 mx-auto rounded" />
            <button
              onClick={handleRemove}
              className="absolute top-2 right-2 p-1 bg-destructive rounded-full text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <label className="cursor-pointer block">
            <div className="flex flex-col items-center gap-2">
              {isLoading ? (
                <>
                  <Loader2 className="w-8 h-8 animate-spin text-primary" role="status" />
                  <p className="text-sm text-muted-foreground">Subiendo imagen...</p>
                </>
              ) : (
                <>
                  <Upload className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Selecciona una imagen</p>
                  <p className="text-xs text-muted-foreground">PNG, JPG, WebP (máx 5MB)</p>
                </>
              )}
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              disabled={isLoading}
              className="hidden"
            />
          </label>
        )}
      </div>
    </div>
  );
}
```

### Step 4: Run test to verify it passes

Run: `pnpm test client/src/components/__tests__/AnnouncementImageUploader.s3.test.tsx`

Expected: PASS (2 tests)

### Step 5: Update AdminNovedades to pass announcementId

```typescript
// client/src/pages/AdminNovedades.tsx - Update form JSX
<AnnouncementImageUploader
  onImageSelect={(image) => form.setValue('image_url', image.url)}
  announcementId={editingId || 'new'} // Use editing ID or 'new' for new announcements
/>
```

### Step 6: Commit

```bash
git add client/src/components/AnnouncementImageUploader.tsx client/src/pages/AdminNovedades.tsx client/src/components/__tests__/AnnouncementImageUploader.s3.test.tsx
git commit -m "feat: integrate S3 upload in AnnouncementImageUploader component"
```

---

## Task 3: Add Visibility Status Badges

**Files:**
- Create: `client/src/features/announcements/components/AnnouncementStatusBadge.tsx`
- Modify: `client/src/pages/Novedades.tsx` (add badges to list)
- Test: `client/src/features/announcements/__tests__/visibility-indicators.test.ts`

### Step 1: Write failing test for status badge

```typescript
// client/src/features/announcements/__tests__/visibility-indicators.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnnouncementStatusBadge } from '../components/AnnouncementStatusBadge';

describe('AnnouncementStatusBadge', () => {
  it('shows "Scheduled" badge when published_at is in future', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    render(
      <AnnouncementStatusBadge
        publishedAt={futureDate}
        expiresAt={null}
      />
    );

    expect(screen.getByText('Programada')).toBeInTheDocument();
    expect(screen.getByText('Programada')).toHaveClass('bg-blue-100');
  });

  it('shows "Live" badge when published_at is past and expires_at is future', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);

    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);

    render(
      <AnnouncementStatusBadge
        publishedAt={pastDate}
        expiresAt={futureDate}
      />
    );

    expect(screen.getByText('En vivo')).toBeInTheDocument();
    expect(screen.getByText('En vivo')).toHaveClass('bg-green-100');
  });

  it('shows "Expired" badge when expires_at is in past', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 7);

    render(
      <AnnouncementStatusBadge
        publishedAt={pastDate}
        expiresAt={pastDate}
      />
    );

    expect(screen.getByText('Expirada')).toBeInTheDocument();
    expect(screen.getByText('Expirada')).toHaveClass('bg-gray-100');
  });

  it('shows "No date" when no dates provided', () => {
    render(
      <AnnouncementStatusBadge
        publishedAt={null}
        expiresAt={null}
      />
    );

    expect(screen.getByText('Sin fecha')).toBeInTheDocument();
  });
});
```

### Step 2: Run test to verify it fails

Run: `pnpm test client/src/features/announcements/__tests__/visibility-indicators.test.ts`

Expected: FAIL with "AnnouncementStatusBadge is not defined"

### Step 3: Create AnnouncementStatusBadge component

```typescript
// client/src/features/announcements/components/AnnouncementStatusBadge.tsx
import { Badge } from '@/components/ui/badge';

interface AnnouncementStatusBadgeProps {
  publishedAt: Date | null;
  expiresAt: Date | null;
}

export function AnnouncementStatusBadge({
  publishedAt,
  expiresAt,
}: AnnouncementStatusBadgeProps) {
  const now = new Date();

  if (!publishedAt && !expiresAt) {
    return (
      <Badge variant="outline" className="bg-gray-50 text-gray-700">
        Sin fecha
      </Badge>
    );
  }

  const isScheduled = publishedAt && publishedAt > now;
  const isExpired = expiresAt && expiresAt < now;
  const isLive = publishedAt && publishedAt <= now && (!expiresAt || expiresAt > now);

  if (isScheduled) {
    return (
      <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200">
        Programada
      </Badge>
    );
  }

  if (isExpired) {
    return (
      <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-200">
        Expirada
      </Badge>
    );
  }

  if (isLive) {
    return (
      <Badge className="bg-green-100 text-green-700 hover:bg-green-200">
        En vivo
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="bg-gray-50 text-gray-700">
      Sin estado
    </Badge>
  );
}
```

### Step 4: Run test to verify it passes

Run: `pnpm test client/src/features/announcements/__tests__/visibility-indicators.test.ts`

Expected: PASS (4 tests)

### Step 5: Add badges to Novedades list

```typescript
// client/src/pages/Novedades.tsx - Update announcement item rendering
import { AnnouncementStatusBadge } from '@/features/announcements/components/AnnouncementStatusBadge';

// In the announcements list rendering:
{announcements.map((announcement) => (
  <div key={announcement.id} className="flex items-start justify-between gap-4">
    <div className="flex-1">
      <h3 className="font-semibold">{announcement.titulo}</h3>
      <p className="text-sm text-muted-foreground">{announcement.contenido}</p>
    </div>
    <AnnouncementStatusBadge
      publishedAt={announcement.published_at ? new Date(announcement.published_at) : null}
      expiresAt={announcement.expires_at ? new Date(announcement.expires_at) : null}
    />
  </div>
))}
```

### Step 6: Commit

```bash
git add client/src/features/announcements/components/AnnouncementStatusBadge.tsx client/src/pages/Novedades.tsx client/src/features/announcements/__tests__/visibility-indicators.test.ts
git commit -m "feat: add visibility status badges to announcements list"
```

---

## Task 4: Create Scheduling Dashboard

**Files:**
- Create: `client/src/features/announcements/components/SchedulingDashboard.tsx`
- Modify: `client/src/pages/AdminNovedades.tsx` (add dashboard)
- Test: `client/src/features/announcements/__tests__/scheduling-dashboard.test.ts`

### Step 1: Write failing test for scheduling dashboard

```typescript
// client/src/features/announcements/__tests__/scheduling-dashboard.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SchedulingDashboard } from '../components/SchedulingDashboard';

describe('SchedulingDashboard', () => {
  const mockAnnouncements = [
    {
      id: '1',
      titulo: 'Scheduled',
      published_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: '2',
      titulo: 'Live',
      published_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ];

  it('renders calendar view', () => {
    render(
      <SchedulingDashboard
        announcements={mockAnnouncements}
        onReschedule={() => {}}
      />
    );

    expect(screen.getByRole('heading', { name: /calendario/i })).toBeInTheDocument();
  });

  it('shows announcements on calendar', () => {
    render(
      <SchedulingDashboard
        announcements={mockAnnouncements}
        onReschedule={() => {}}
      />
    );

    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('displays timeline view with announcement bars', () => {
    render(
      <SchedulingDashboard
        announcements={mockAnnouncements}
        onReschedule={() => {}}
      />
    );

    const timelineItems = screen.getAllByRole('listitem');
    expect(timelineItems.length).toBeGreaterThan(0);
  });
});
```

### Step 2: Run test to verify it fails

Run: `pnpm test client/src/features/announcements/__tests__/scheduling-dashboard.test.ts`

Expected: FAIL with "SchedulingDashboard is not defined"

### Step 3: Create SchedulingDashboard component

```typescript
// client/src/features/announcements/components/SchedulingDashboard.tsx
import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock } from 'lucide-react';

interface Announcement {
  id: string;
  titulo: string;
  published_at: string | null;
  expires_at: string | null;
}

interface SchedulingDashboardProps {
  announcements: Announcement[];
  onReschedule: (announcementId: string, newDate: Date) => void;
}

export function SchedulingDashboard({
  announcements,
  onReschedule,
}: SchedulingDashboardProps) {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Group announcements by status
  const grouped = useMemo(() => {
    const scheduled = announcements.filter((a) => {
      if (!a.published_at) return false;
      return new Date(a.published_at) > now;
    });

    const live = announcements.filter((a) => {
      if (!a.published_at) return false;
      const publishedDate = new Date(a.published_at);
      const expiredDate = a.expires_at ? new Date(a.expires_at) : null;
      return publishedDate <= now && (!expiredDate || expiredDate > now);
    });

    const expired = announcements.filter((a) => {
      if (!a.expires_at) return false;
      return new Date(a.expires_at) < now;
    });

    return { scheduled, live, expired };
  }, [announcements]);

  // Generate timeline data
  const timelineData = useMemo(() => {
    const items = announcements
      .filter((a) => a.published_at || a.expires_at)
      .map((a) => ({
        id: a.id,
        titulo: a.titulo,
        startDate: a.published_at ? new Date(a.published_at) : now,
        endDate: a.expires_at ? new Date(a.expires_at) : thirtyDaysFromNow,
      }))
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

    return items;
  }, [announcements]);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('es-ES', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5" />
          Calendario de Publicación
        </h3>

        {/* Status Summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="p-4">
            <div className="text-sm font-medium text-muted-foreground">Programadas</div>
            <div className="text-2xl font-bold text-blue-600">{grouped.scheduled.length}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm font-medium text-muted-foreground">En vivo</div>
            <div className="text-2xl font-bold text-green-600">{grouped.live.length}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm font-medium text-muted-foreground">Expiradas</div>
            <div className="text-2xl font-bold text-gray-600">{grouped.expired.length}</div>
          </Card>
        </div>
      </div>

      {/* Timeline View */}
      <div>
        <h4 className="font-medium flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4" />
          Línea de Tiempo
        </h4>

        <div className="space-y-3">
          {timelineData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No hay novedades programadas
            </p>
          ) : (
            <ul className="space-y-3">
              {timelineData.map((item) => {
                const daysFromNow = Math.ceil(
                  (item.startDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
                );
                const isScheduled = item.startDate > now;
                const isLive = item.startDate <= now && item.endDate > now;
                const isExpired = item.endDate < now;

                let statusColor = 'bg-gray-100';
                let statusText = 'Sin estado';

                if (isScheduled) {
                  statusColor = 'bg-blue-100';
                  statusText = `En ${daysFromNow} días`;
                } else if (isLive) {
                  statusColor = 'bg-green-100';
                  statusText = 'En vivo';
                } else if (isExpired) {
                  statusColor = 'bg-gray-100';
                  statusText = 'Expirada';
                }

                return (
                  <li
                    key={item.id}
                    className={`p-3 rounded-lg border ${statusColor} flex justify-between items-center`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.titulo}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(item.startDate)} → {formatDate(item.endDate)}
                      </p>
                    </div>
                    <Badge variant="outline" className="ml-2 flex-shrink-0">
                      {statusText}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Step 4: Run test to verify it passes

Run: `pnpm test client/src/features/announcements/__tests__/scheduling-dashboard.test.ts`

Expected: PASS (3 tests)

### Step 5: Add dashboard to AdminNovedades

```typescript
// client/src/pages/AdminNovedades.tsx - Add import and render
import { SchedulingDashboard } from '@/features/announcements/components/SchedulingDashboard';

// In the component, add after the announcements list:
<div className="mt-8 pt-8 border-t">
  <SchedulingDashboard
    announcements={announcements}
    onReschedule={(id, date) => {
      // Handle reschedule mutation
      console.log(`Reschedule ${id} to ${date}`);
    }}
  />
</div>
```

### Step 6: Commit

```bash
git add client/src/features/announcements/components/SchedulingDashboard.tsx client/src/pages/AdminNovedades.tsx client/src/features/announcements/__tests__/scheduling-dashboard.test.ts
git commit -m "feat: add scheduling dashboard with calendar and timeline views"
```

---

## Task 5: Full Integration Test

**Files:**
- Test: `client/src/features/announcements/__tests__/integration.test.ts`

### Step 1: Write integration test

```typescript
// client/src/features/announcements/__tests__/integration.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminNovedades from '@/pages/AdminNovedades';

describe('Announcements Features Integration', () => {
  it('creates announcement with S3 image, shows in list with status badge, and appears in dashboard', async () => {
    const user = userEvent.setup();

    render(<AdminNovedades />);

    // Create new announcement
    const newButton = screen.getByRole('button', { name: /nueva novedad/i });
    await user.click(newButton);

    // Fill form
    const titleInput = screen.getByPlaceholderText(/título/i);
    await user.type(titleInput, 'Test Announcement');

    // Upload image
    const imageFile = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
    const uploadInput = screen.getByLabelText(/selecciona una imagen/i);
    await user.upload(uploadInput, imageFile);

    // Set dates
    const publishDate = screen.getByLabelText(/publicar desde/i);
    await user.type(publishDate, '01/06/2026');

    // Submit
    const submitButton = screen.getByRole('button', { name: /crear/i });
    await user.click(submitButton);

    // Verify announcement appears in list with status badge
    await waitFor(() => {
      expect(screen.getByText('Test Announcement')).toBeInTheDocument();
      expect(screen.getByText('Programada')).toBeInTheDocument();
    });

    // Verify dashboard shows the announcement
    expect(screen.getByText('1')).toBeInTheDocument(); // Scheduled count
  });
});
```

### Step 2: Run test to verify it passes

Run: `pnpm test client/src/features/announcements/__tests__/integration.test.ts`

Expected: PASS (1 test)

### Step 3: Run all tests

Run: `pnpm test --run`

Expected: All tests pass (732+ tests)

### Step 4: Commit

```bash
git add client/src/features/announcements/__tests__/integration.test.ts
git commit -m "test: add integration test for all announcement features"
```

---

## Task 6: Verify TypeScript and Build

### Step 1: Run TypeScript check

Run: `pnpm check`

Expected: 0 errors

### Step 2: Verify dev server

Run: `pnpm dev` (already running)

Expected: No errors in console

### Step 3: Final commit

```bash
git log --oneline -10
```

Expected: All 6 tasks committed

---

## Success Criteria

- ✅ S3 image upload works with proper file validation
- ✅ AnnouncementImageUploader uses S3 instead of data URLs
- ✅ Status badges show correct state (Scheduled/Live/Expired)
- ✅ Scheduling dashboard displays calendar and timeline
- ✅ All 732+ tests passing
- ✅ TypeScript: 0 errors
- ✅ Integration test verifies all features work together
