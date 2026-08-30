/**
 * checkin.qrVerify — QR-scan integrity gate for verifyAndInsert.
 *
 * Extracted from checkin.ts (max-lines) and hardened for #171 / F090:
 *  - A metodo:'qr_scan' MUST carry a qrValue to verify. Verification only ran
 *    `if (qrValue !== undefined)`, so a qr_scan without qrValue inserted an
 *    attendance labelled as scanned with NO HMAC check. Manual/anonymous flows
 *    set metodo explicitly; demo (unsigned practice QR, writes nothing) is exempt.
 *  - When a qrValue IS present, verify format, person-match, and the HMAC.
 */
import { TRPCError } from "@trpc/server";
import { parseQrPayload, verifySig } from "../../shared/qr/payload";
import { ENV } from "../_core/env";
import { logProcedureAction } from "../_core/logging-middleware";
import type { TrpcContext } from "../_core/context";

type QrScanInput = {
  metodo: string;
  qrValue?: string;
  isDemoMode: boolean;
  personId: string;
};

export async function assertQrScanVerified(input: QrScanInput, ctx: TrpcContext): Promise<void> {
  if (input.metodo === "qr_scan" && input.qrValue === undefined && !input.isDemoMode) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Falta el código QR para un check-in por escaneo.",
    });
  }

  // Manual-search, anonymous, and demo paths omit qrValue → nothing to verify.
  if (input.qrValue === undefined) return;

  const parsed = parseQrPayload(input.qrValue);
  if (!parsed) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Formato de QR inválido" });
  }
  // Ensure the UUID in the payload matches what the client claims.
  if (parsed.uuid.toLowerCase() !== input.personId.toLowerCase()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "El QR no corresponde a la persona indicada" });
  }
  const secret = ENV.qrSigningSecret;
  if (!secret || secret.length < 32) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "QR signing secret not configured" });
  }
  const valid = await verifySig(parsed.uuid, parsed.sig, secret);
  if (!valid) {
    logProcedureAction(ctx, "Checkin: Invalid QR signature rejected", { personId: input.personId });
    throw new TRPCError({ code: "FORBIDDEN", message: "Firma del QR inválida o adulterada" });
  }
}
