/**
 * SessionNotaEntregaButton.tsx — E1 Task 13
 *
 * Thin wrapper around GenerateDocumentButton that generates the "Hoja de firmas"
 * (nota de entrega) DOCX for a specific delivery session.
 *
 * Data-model note: the nota de entrega is generated per family within a session
 * (each family that receives a delivery gets its own signature sheet). The
 * program-session view passes both the session being closed and the individual
 * family for whom the nota is needed. If a single aggregate nota per session is
 * required in the future, the `familyId` prop would point to the
 * representative/first family in the round — the GenerateDocumentButton contract
 * requires familyId and this component preserves that contract unchanged.
 */

import { GenerateDocumentButton } from "@/features/families/components/GenerateDocumentButton";

interface SessionNotaEntregaButtonProps {
  familyId: string;
  sessionId?: string;
}

export function SessionNotaEntregaButton({
  familyId,
  sessionId,
}: SessionNotaEntregaButtonProps) {
  const blockingError = sessionId
    ? null
    : "Selecciona una sesión cerrada para generar la hoja de firmas.";

  return (
    <GenerateDocumentButton
      familyId={familyId}
      slug="nota_entrega"
      sessionId={sessionId}
      label="Hoja de firmas"
      blockingError={blockingError}
    />
  );
}
