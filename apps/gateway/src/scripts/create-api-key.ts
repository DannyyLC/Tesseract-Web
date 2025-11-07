import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function createApiKey(clientId: string, name: string) {
  // 1. Generar API Key aleatorio
  const randomBytes = crypto.randomBytes(32).toString('hex');
  const apiKey = `ak_live_${randomBytes}`;
  
  // 2. Extraer prefijo (primeros 8 caracteres después de ak_live_)
  const keyPrefix = apiKey.substring(0, 16); // "ak_live_xxxxxxxx"
  
  // 3. Hashear
  const keyHash = await bcrypt.hash(apiKey, 10);
  
  // 4. Guardar en DB
  const newApiKey = await prisma.apiKey.create({
    data: {
      name,
      keyHash,
      keyPrefix,
      clientId,
      isActive: true,
    },
  });
  
  console.log('\n🎉 API Key creado exitosamente!\n');
  console.log('=====================================');
  console.log('⚠️  GUARDA ESTE API KEY AHORA:');
  console.log('=====================================');
  console.log(`\n${apiKey}\n`);
  console.log('=====================================');
  console.log('⚠️  NO PODRÁS VERLO DE NUEVO');
  console.log('=====================================\n');
  console.log('Detalles:');
  console.log(`- ID: ${newApiKey.id}`);
  console.log(`- Name: ${newApiKey.name}`);
  console.log(`- Prefix: ${newApiKey.keyPrefix}`);
  console.log(`- Client ID: ${clientId}\n`);
}

// Ejecutar
createApiKey(
  '8a038b57-bc10-4c74-951e-dccac9054c23', // Tu Client ID
  'Testing API Key'
)
  .catch(console.error)
  .finally(() => prisma.$disconnect());