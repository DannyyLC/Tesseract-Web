/**
 * Identificador con el que se guarda a un contacto de Messenger en `EndUser.externalId`.
 *
 * El PSID no es un teléfono ni un email, así que va en el identificador libre; se prefija con
 * la página porque el mismo PSID puede repetirse entre páginas distintas.
 *
 * Vive aquí y no repetido en cada llamador porque hay dos lados que TIENEN que coincidir: el que
 * crea la fila al llegar el primer mensaje y el que la busca para decidir si el contacto está
 * bloqueado. Si se separan, el bloqueo deja de empatar y le contestas a quien prometiste no
 * contestarle, sin un solo error en los logs.
 */
export function messengerExternalId(pageId: string, senderId: string): string {
  return `messenger:${pageId}:${senderId}`;
}
