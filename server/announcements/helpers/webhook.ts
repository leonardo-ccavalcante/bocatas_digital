export function shouldFireWebhook(
  prevEsUrgente: boolean | null,
  nextEsUrgente: boolean,
  isCreate: boolean
): boolean {
  if (isCreate) return nextEsUrgente;
  return prevEsUrgente === false && nextEsUrgente === true;
}
