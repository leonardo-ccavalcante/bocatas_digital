/**
 * F184 (RC-03) — the signed-acta photo must travel through tRPC
 * (families.attachSignedActa) as base64, never through the browser Supabase
 * client: family-documents is private with no storage policies, so every
 * anon-key upload 403s and the OCR close-out never unlocks.
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, waitFor, fireEvent } from "@testing-library/react";

const { mockAttach, mockCompressImage, mockStorageUpload } = vi.hoisted(() => ({
  mockAttach: vi.fn(),
  mockCompressImage: vi.fn(),
  mockStorageUpload: vi.fn(),
}));

vi.mock("../hooks/useReparto", () => ({
  useAttachSignedActa: () => ({ mutateAsync: mockAttach }),
}));

vi.mock("@/features/persons/utils/imageUtils", () => ({
  compressImage: mockCompressImage,
}));

// Regression lock: if the component ever re-imports the browser client, this
// mock keeps the test loadable and the not-called assertion catches it.
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ upload: mockStorageUpload }) } }),
}));

vi.mock("@/features/families/utils/signedUrl", () => ({ getSignedDocUrl: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SignedActaUpload } from "../components/SignedActaUpload";

afterEach(cleanup);

const ROUND = "3c7cc0eb-1111-4111-8111-111111111111";
const SLOT = "22222222-2222-4222-8222-222222222222";

describe("SignedActaUpload (RC-03)", () => {
  it("sends the compressed photo as base64 through attachSignedActa, never via browser Storage", async () => {
    mockCompressImage.mockResolvedValue("QkFTRTY0");
    mockAttach.mockResolvedValue({ slot_id: SLOT });
    mockStorageUpload.mockResolvedValue({ error: null });

    const { container } = render(
      <SignedActaUpload roundId={ROUND} slotId={SLOT} day="2026-09-01" turno="manana" />
    );

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File(["photo"], "acta.jpg", { type: "image/jpeg" })] },
    });

    await waitFor(() => {
      expect(mockAttach).toHaveBeenCalledWith({ round_id: ROUND, slot_id: SLOT, base64: "QkFTRTY0" });
    });
    expect(mockStorageUpload).not.toHaveBeenCalled();
    const { toast } = await import("sonner");
    expect(toast.success).toHaveBeenCalledWith("Acta firmada guardada");
  });

  it("uses a real camera button, not a capture= hint the desktop ignores (#178)", () => {
    const { container, getByText } = render(
      <SignedActaUpload roundId={ROUND} slotId={SLOT} day="2026-09-01" turno="manana" />
    );
    // No file input relies on the advisory `capture` attribute any more.
    expect(container.querySelector("input[capture]")).toBeNull();
    // The getUserMedia camera trigger (CameraCaptureButton) is rendered.
    expect(getByText(/Fotografiar acta firmada/)).toBeTruthy();
  });
});
