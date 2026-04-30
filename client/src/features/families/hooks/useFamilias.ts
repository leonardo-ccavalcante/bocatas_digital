import { trpc } from "@/lib/trpc";

// ─── Family CRUD ──────────────────────────────────────────────────────────────
export function useFamiliasList(params?: {
  search?: string;
  estado?: "activa" | "baja" | "all";
  sin_alta_guf?: boolean;
  sin_informe_social?: boolean;
  page?: number;
  per_page?: number;
}) {
  return trpc.families.getAll.useQuery(params ?? {}, { staleTime: 30_000 });
}

export function useFamiliaById(id: string) {
  return trpc.families.getById.useQuery({ id }, { enabled: !!id, staleTime: 30_000 });
}

export function useCreateFamilia() {
  const utils = trpc.useUtils();
  return trpc.families.create.useMutation({
    onSuccess: () => { utils.families.getAll.invalidate(); },
  });
}

export function useUpdateFamiliaDocField() {
  const utils = trpc.useUtils();
  return trpc.families.updateDocField.useMutation({
    onSuccess: (_, vars) => { utils.families.getById.invalidate({ id: vars.id }); },
  });
}

export function useDeactivateFamilia() {
  const utils = trpc.useUtils();
  return trpc.families.deactivate.useMutation({
    onSuccess: (_, vars) => {
      utils.families.getById.invalidate({ id: vars.id });
      utils.families.getAll.invalidate();
    },
  });
}

export function useReactivateFamilia() {
  const utils = trpc.useUtils();
  return trpc.families.reactivate.useMutation({
    onSuccess: (_, vars) => {
      utils.families.getById.invalidate({ id: vars.id });
      utils.families.getAll.invalidate();
    },
  });
}

// ─── Deliveries ───────────────────────────────────────────────────────────────
export function useDeliveries(family_id: string) {
  // Use entregas router for delivery queries
  return trpc.entregas.getDeliveries.useQuery(
    { familiaId: family_id },
    { enabled: !!family_id, staleTime: 30_000 }
  );
}

export function useCreateDelivery() {
  const utils = trpc.useUtils();
  // Use entregas router for delivery mutations
  return trpc.entregas.createDelivery.useMutation({
    onSuccess: (data: any) => {
      utils.entregas.getDeliveries.invalidate({ familiaId: data.data?.familia_id });
    },
  });
}

// ─── GUF ──────────────────────────────────────────────────────────────────────
export function useUpdateGuf() {
  const utils = trpc.useUtils();
  return trpc.families.updateGuf.useMutation({
    onSuccess: (_, vars) => { utils.families.getById.invalidate({ id: vars.id }); },
  });
}

export function useGufSystemDefault() {
  return trpc.families.getGufSystemDefault.useQuery(undefined, { staleTime: 60_000 });
}

// ─── Informes Sociales ────────────────────────────────────────────────────────
export function useInformesSociales(filter?: "all" | "pendientes" | "por_renovar" | "al_dia") {
  return trpc.families.getInformesSociales.useQuery(
    filter ? { filter } : undefined,
    { staleTime: 30_000 }
  );
}

// ─── Compliance ───────────────────────────────────────────────────────────────
export function useComplianceStats() {
  return trpc.families.getComplianceStats.useQuery(undefined, { staleTime: 30_000 });
}

export function usePendingItems(family_id?: string) {
  return trpc.families.getPendingItems.useQuery(
    { family_id },
    { staleTime: 30_000 }
  );
}

// ─── Session Close ────────────────────────────────────────────────────────────
export function useCloseSession() {
  const utils = trpc.useUtils();
  return trpc.families.closeSession.useMutation({
    onSuccess: (_, vars) => {
      utils.families.getOpenSession.invalidate({ program_id: vars.program_id });
    },
  });
}

export function useOpenSession(program_id: string, fecha?: string) {
  return trpc.families.getOpenSession.useQuery(
    { program_id, fecha },
    { enabled: !!program_id, staleTime: 10_000 }
  );
}

// ─── Member Documents ─────────────────────────────────────────────────────────
export function useMemberDocuments(family_id: string) {
  return trpc.families.getMemberDocuments.useQuery(
    { family_id },
    { enabled: !!family_id, staleTime: 30_000 }
  );
}

export function useCreateMemberDocument() {
  const utils = trpc.useUtils();
  return trpc.families.createMemberDocument.useMutation({
    onSuccess: (_, vars) => {
      utils.families.getMemberDocuments.invalidate({ family_id: vars.family_id });
    },
  });
}

// ─── Volunteer Verifier ───────────────────────────────────────────────────────
export function useVerifyFamilyIdentity(query: string) {
  return trpc.families.verifyIdentity.useQuery(
    { query },
    { enabled: query.length >= 1, staleTime: 10_000 }
  );
}
