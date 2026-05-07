import { trpc } from "@/lib/trpc";

export function useFamilySavedViews(programaId: string) {
  const utils = trpc.useUtils();

  const list = trpc.familySavedViews.list.useQuery(
    { programaId },
    { enabled: !!programaId },
  );

  const create = trpc.familySavedViews.create.useMutation({
    onSuccess: () => utils.familySavedViews.list.invalidate({ programaId }),
  });

  const update = trpc.familySavedViews.update.useMutation({
    onSuccess: () => utils.familySavedViews.list.invalidate({ programaId }),
  });

  const remove = trpc.familySavedViews.delete.useMutation({
    onSuccess: () => utils.familySavedViews.list.invalidate({ programaId }),
  });

  return { list, create, update, remove };
}
