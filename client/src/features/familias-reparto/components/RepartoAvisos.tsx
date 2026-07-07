interface Props {
  total: number;
  overCommitted: boolean;
  hasZeroSlot: boolean;
  leftover: number;
}

/** Inline live warnings for the planning split: overcommitted caps, a total too
 *  small for every turno, or people left unassigned. */
export function RepartoAvisos({ total, overCommitted, hasZeroSlot, leftover }: Props) {
  return (
    <>
      {overCommitted && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          Los cupos fijados superan el total de {total}. Baja algún cupo o sube el total.
        </p>
      )}
      {!overCommitted && hasZeroSlot && (
        <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          El total no alcanza para todos los turnos (hay turnos con 0 personas). Sube el total o quita turnos.
        </p>
      )}
      {leftover > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Quedan {leftover} persona{leftover !== 1 ? "s" : ""} sin repartir — súbelas a algún turno o deja turnos en automático.
        </p>
      )}
    </>
  );
}
