import { timingSafeEqual } from 'crypto';
import { Prisma, UserVerification } from '@tesseract/database';
import { PrismaService } from '@/platform/database/prisma.service';

/**
 * Intentos por código antes de invalidarlo. Con seis dígitos (900 000 valores), cinco intentos
 * dejan una probabilidad de acierto por fuerza bruta de ~1 en 180 000 por código emitido.
 */
export const MAX_VERIFICATION_ATTEMPTS = 5;

/**
 * Busca el código de verificación **de ese correo** y lo compara, contando el intento.
 *
 * Antes el reset de contraseña y la aceptación de invitaciones buscaban solo por código: cada
 * intento se comparaba contra todos los códigos vivos de la tabla, y sin límite por código. Aquí
 * el código solo vale junto con su correo, y cada fila admite `MAX_VERIFICATION_ATTEMPTS`.
 *
 * El intento se reserva (incremento atómico) **antes** de comparar: si se comparara primero,
 * varias peticiones en paralelo podrían probar códigos antes de que ninguna sumara el fallo.
 * Al agotarse los intentos la fila se borra y hay que pedir otro código.
 *
 * @returns la fila si el código es correcto; `null` si no existe, expiró, no coincide o se
 * agotaron los intentos. No distingue entre esos casos, para no dar pistas a quien prueba.
 */
export async function checkVerificationCode(
  prisma: PrismaService,
  where: Pick<Prisma.UserVerificationWhereInput, 'email' | 'isFromInvitation'>,
  code: string,
): Promise<UserVerification | null> {
  const row = await prisma.userVerification.findFirst({
    where: { ...where, expiresAt: { gt: new Date() } },
  });
  if (!row) return null;

  const reserved = await prisma.userVerification.updateMany({
    where: { id: row.id, failedAttempts: { lt: MAX_VERIFICATION_ATTEMPTS } },
    data: { failedAttempts: { increment: 1 } },
  });
  if (reserved.count === 0) {
    await prisma.userVerification.deleteMany({ where: { id: row.id } });
    return null;
  }

  if (!sameCode(row.verificationCode, String(code ?? ''))) {
    if (row.failedAttempts + 1 >= MAX_VERIFICATION_ATTEMPTS) {
      await prisma.userVerification.deleteMany({ where: { id: row.id } });
    }
    return null;
  }

  return row;
}

function sameCode(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}
