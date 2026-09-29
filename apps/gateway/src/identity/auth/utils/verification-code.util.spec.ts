import { MAX_VERIFICATION_ATTEMPTS, checkVerificationCode } from './verification-code.util';

/**
 * Seis dígitos solo resisten fuerza bruta si el código va atado a su correo y los intentos por
 * código están acotados. Cada caso fija una de esas dos cosas.
 */
describe('checkVerificationCode', () => {
  const row = (failedAttempts = 0) => ({
    id: 'v-1',
    email: 'a@test.com',
    verificationCode: '123456',
    failedAttempts,
  });

  const makePrisma = (found: unknown, reservedCount = 1) => ({
    userVerification: {
      findFirst: jest.fn().mockResolvedValue(found),
      updateMany: jest.fn().mockResolvedValue({ count: reservedCount }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  });

  it('busca por correo y solo entre códigos vigentes', async () => {
    const prisma = makePrisma(null);
    await checkVerificationCode(
      prisma as any,
      { email: 'a@test.com', isFromInvitation: true },
      '123456',
    );
    expect(prisma.userVerification.findFirst).toHaveBeenCalledWith({
      where: { email: 'a@test.com', isFromInvitation: true, expiresAt: { gt: expect.any(Date) } },
    });
  });

  it('devuelve la fila con el código correcto y cuenta el intento', async () => {
    const prisma = makePrisma(row());
    await expect(
      checkVerificationCode(prisma as any, { email: 'a@test.com' }, '123456'),
    ).resolves.toEqual(row());
    expect(prisma.userVerification.updateMany).toHaveBeenCalledWith({
      where: { id: 'v-1', failedAttempts: { lt: MAX_VERIFICATION_ATTEMPTS } },
      data: { failedAttempts: { increment: 1 } },
    });
  });

  it('con el código equivocado devuelve null y conserva la fila si quedan intentos', async () => {
    const prisma = makePrisma(row(0));
    await expect(
      checkVerificationCode(prisma as any, { email: 'a@test.com' }, '000000'),
    ).resolves.toBeNull();
    expect(prisma.userVerification.deleteMany).not.toHaveBeenCalled();
  });

  it('el último intento fallido borra la fila', async () => {
    const prisma = makePrisma(row(MAX_VERIFICATION_ATTEMPTS - 1));
    await checkVerificationCode(prisma as any, { email: 'a@test.com' }, '000000');
    expect(prisma.userVerification.deleteMany).toHaveBeenCalledWith({ where: { id: 'v-1' } });
  });

  it('con los intentos agotados rechaza incluso el código correcto', async () => {
    // Otra petición en paralelo ya se llevó el último intento: la reserva no se concede.
    const prisma = makePrisma(row(MAX_VERIFICATION_ATTEMPTS), 0);
    await expect(
      checkVerificationCode(prisma as any, { email: 'a@test.com' }, '123456'),
    ).resolves.toBeNull();
    expect(prisma.userVerification.deleteMany).toHaveBeenCalledWith({ where: { id: 'v-1' } });
  });

  it('un código de otra longitud no revienta la comparación', async () => {
    const prisma = makePrisma(row());
    await expect(
      checkVerificationCode(prisma as any, { email: 'a@test.com' }, '1'),
    ).resolves.toBeNull();
  });
});
