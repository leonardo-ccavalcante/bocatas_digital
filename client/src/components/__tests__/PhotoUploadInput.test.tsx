/**
 * PhotoUploadInput — real validation tests (Mythos DIO-07/08).
 *
 * Runs in jsdom (matched by vitest.config.ts environmentMatchGlobs).
 *
 * Strategy: render the component, fire a change event with a synthetic File,
 * and stub global FileReader + Image so async dimension validation resolves
 * synchronously inside the same microtask tick. Tests assert:
 *   (1) >10MB file → Spanish error shown, onError called, onPhotoSelected NOT called
 *   (2) text/plain file → Spanish format error shown, onError called
 *   (3) valid jpeg ≥640x480 → component enters preview state (Confirmar Foto visible)
 *
 * Stubs are installed per-test and restored in afterEach.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { PhotoUploadInput } from '../PhotoUploadInput';

// Save/restore originals
let OriginalFileReader: typeof FileReader;
let OriginalImage: typeof Image;

beforeEach(() => {
  OriginalFileReader = global.FileReader;
  OriginalImage = global.Image;
});

afterEach(() => {
  cleanup();
  global.FileReader = OriginalFileReader;
  global.Image = OriginalImage;
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Stub FileReader: calls onload synchronously when readAsDataURL is invoked
// ---------------------------------------------------------------------------
function installSyncFileReader(dataUrl = 'data:image/jpeg;base64,fake') {
  // @ts-expect-error — global stub
  global.FileReader = class SyncFileReader {
    onload: ((e: ProgressEvent<FileReader>) => void) | null = null;
    onerror: ((e: ProgressEvent<FileReader>) => void) | null = null;
    result = dataUrl;
    readAsDataURL(_f: File) {
      this.onload?.({ target: { result: dataUrl } } as unknown as ProgressEvent<FileReader>);
    }
  };
}

// ---------------------------------------------------------------------------
// Stub Image: calls onload synchronously when src is set;
// exposes width/height via img.width/img.height
// ---------------------------------------------------------------------------
function installSyncImage(width: number, height: number, error = false) {
  // @ts-expect-error — global stub
  global.Image = class SyncImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    width = width;
    height = height;
    set src(_val: string) {
      if (error) {
        this.onerror?.();
      } else {
        this.onload?.();
      }
    }
    get src() { return ''; }
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PhotoUploadInput', () => {
  it('rejects a file larger than 10MB: shows Spanish error, calls onError, onPhotoSelected NOT called', async () => {
    // Size check is synchronous — no stub needed
    const onPhotoSelected = vi.fn();
    const onError = vi.fn();

    render(<PhotoUploadInput onPhotoSelected={onPhotoSelected} onError={onError} />);

    const input = document.querySelector(
      'input[accept="image/jpeg,image/png,image/webp"]',
    ) as HTMLInputElement;
    expect(input).not.toBeNull();

    // File that reports size > 10 MB
    const bigFile = new File(['x'], 'big.jpg', { type: 'image/jpeg' });
    Object.defineProperty(bigFile, 'size', { value: 10 * 1024 * 1024 + 1 });

    fireEvent.change(input, { target: { files: [bigFile] } });

    await waitFor(() => {
      expect(screen.getByText(/archivo muy grande/i)).toBeInTheDocument();
    });

    expect(onError).toHaveBeenCalledOnce();
    expect((onError.mock.calls[0] as string[])[0]).toMatch(/10MB/i);
    expect(onPhotoSelected).not.toHaveBeenCalled();
  });

  it('rejects a text/plain file: shows Spanish format error, calls onError', async () => {
    const onPhotoSelected = vi.fn();
    const onError = vi.fn();

    render(<PhotoUploadInput onPhotoSelected={onPhotoSelected} onError={onError} />);

    const input = document.querySelector(
      'input[accept="image/jpeg,image/png,image/webp"]',
    ) as HTMLInputElement;

    const textFile = new File(['hello'], 'doc.txt', { type: 'text/plain' });

    fireEvent.change(input, { target: { files: [textFile] } });

    await waitFor(() => {
      expect(screen.getByText(/formato no válido/i)).toBeInTheDocument();
    });

    expect(onError).toHaveBeenCalledOnce();
    expect((onError.mock.calls[0] as string[])[0]).toMatch(/JPG|PNG|WebP/i);
    expect(onPhotoSelected).not.toHaveBeenCalled();
  });

  it('accepts a valid jpeg ≥640x480: component enters preview state', async () => {
    // Install synchronous stubs so the async dimension check resolves in the
    // same microtask flush that waitFor polls on.
    installSyncFileReader('data:image/jpeg;base64,fakejpeg');
    installSyncImage(800, 600);

    const onPhotoSelected = vi.fn();
    const onError = vi.fn();

    render(<PhotoUploadInput onPhotoSelected={onPhotoSelected} onError={onError} />);

    const input = document.querySelector(
      'input[accept="image/jpeg,image/png,image/webp"]',
    ) as HTMLInputElement;

    const validFile = new File(['fake'], 'photo.jpg', { type: 'image/jpeg' });

    fireEvent.change(input, { target: { files: [validFile] } });

    // When validation passes and preview base64 is loaded, the component renders
    // the preview state with "Confirmar Foto" button.
    await waitFor(() => {
      expect(screen.getByText('Confirmar Foto')).toBeInTheDocument();
    });

    expect(onError).not.toHaveBeenCalled();
  });
});
