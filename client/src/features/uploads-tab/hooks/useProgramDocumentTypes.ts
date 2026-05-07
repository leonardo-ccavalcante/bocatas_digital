import { trpc } from "@/lib/trpc";

export function useProgramDocumentTypes(programaId: string) {
  return trpc.programDocumentTypes.list.useQuery(
    { programaId },
    { enabled: !!programaId },
  );
}
