import { prisma } from './index';

async function test() {
  try {
    await prisma.$connect();
    console.log('Conexión exitosa a PostgreSQL');

    const count = await prisma.organization.count();
    console.log(`Organizaciones en la DB: ${count}`);

    await prisma.$disconnect();
    console.log('Desconectado');
  } catch (error) {
    console.error('Error:', error);
  }
}

test();
