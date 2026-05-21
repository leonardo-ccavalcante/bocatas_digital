/**
 * useRecordSignature — TanStack Query v5 mutation hook for
 * entregas.recordSignature (via the @trpc/react-query adapter).
 *
 * On success: toast + invalidate the deliveries list so firma_url is reflected.
 * PII note: never log signatureDataUrl or signerPersonId.
 */
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export function useRecordSignature(familiaId?: string) {
  const utils = trpc.useUtils();

  return trpc.entregas.recordSignature.useMutation({
    onSuccess: () => {
      toast.success("Firma registrada correctamente");
      void utils.entregas.getDeliveries.invalidate(
        familiaId ? { familiaId } : undefined
      );
    },
    onError: (err) => {
      toast.error(
        err.message || "Error al registrar la firma. Inténtalo de nuevo."
      );
    },
  });
}
