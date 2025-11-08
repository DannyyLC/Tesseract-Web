#!/usr/bin/env node
/**
 * Script para crear el primer usuario super admin
 * 
 * Uso:
 *   npm run create-super-admin
 *   o
 *   npx ts-node src/scripts/create-super-admin.ts
 * 
 * Este script:
 * 1. Verifica que no existan usuarios admin
 * 2. Solicita interactivamente los datos del admin
 * 3. Valida que la contraseña sea fuerte (min 12 caracteres)
 * 4. Crea el usuario con plan 'admin' y límites ilimitados
 * 5. Muestra las credenciales para primer login
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as readline from 'readline';

const prisma = new PrismaClient();

// Colores para la terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

interface CreateSuperAdminData {
  name: string;
  email: string;
  password: string;
}

/**
 * Crea una interfaz de readline para input interactivo
 */
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Hace una pregunta y retorna la respuesta
 */
function question(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

/**
 * Valida el formato de email
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Valida la fortaleza de la contraseña
 */
function isStrongPassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 12) {
    return { valid: false, message: 'La contraseña debe tener al menos 12 caracteres' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'La contraseña debe contener al menos una mayúscula' };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'La contraseña debe contener al menos una minúscula' };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'La contraseña debe contener al menos un número' };
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, message: 'La contraseña debe contener al menos un carácter especial' };
  }

  return { valid: true };
}

/**
 * Verifica si ya existe un usuario admin
 */
async function checkExistingAdmin(): Promise<boolean> {
  const adminCount = await prisma.client.count({
    where: {
      plan: 'admin',
      deletedAt: null,
    },
  });

  return adminCount > 0;
}

/**
 * Verifica si el email ya está registrado
 */
async function checkEmailExists(email: string): Promise<boolean> {
  const existing = await prisma.client.findUnique({
    where: { email },
  });

  return !!existing;
}

/**
 * Solicita los datos del super admin de forma interactiva
 */
async function promptAdminData(rl: readline.Interface): Promise<CreateSuperAdminData> {
  console.log(`\n${colors.cyan}${colors.bright}=== Crear Super Administrador ===${colors.reset}\n`);

  // Nombre
  let name = '';
  while (!name.trim()) {
    name = await question(rl, `${colors.blue}Nombre completo: ${colors.reset}`);
    if (!name.trim()) {
      console.log(`${colors.red}El nombre es requerido${colors.reset}`);
    }
  }

  // Email
  let email = '';
  let emailValid = false;
  while (!emailValid) {
    email = await question(rl, `${colors.blue}Email: ${colors.reset}`);
    
    if (!email.trim()) {
      console.log(`${colors.red}El email es requerido${colors.reset}`);
      continue;
    }

    if (!isValidEmail(email)) {
      console.log(`${colors.red}Email inválido${colors.reset}`);
      continue;
    }

    const exists = await checkEmailExists(email);
    if (exists) {
      console.log(`${colors.red}Este email ya está registrado${colors.reset}`);
      continue;
    }

    emailValid = true;
  }

  // Password
  let password = '';
  let passwordValid = false;
  while (!passwordValid) {
    password = await question(rl, `${colors.blue}Contraseña (min 12 caracteres, incluir mayúsculas, minúsculas, números y símbolos): ${colors.reset}`);
    
    const validation = isStrongPassword(password);
    if (!validation.valid) {
      console.log(`${colors.red}${validation.message}${colors.reset}`);
      continue;
    }

    const confirm = await question(rl, `${colors.blue}Confirmar contraseña: ${colors.reset}`);
    if (password !== confirm) {
      console.log(`${colors.red}Las contraseñas no coinciden${colors.reset}`);
      continue;
    }

    passwordValid = true;
  }

  return { name, email, password };
}

/**
 * Crea el super admin en la base de datos
 */
async function createSuperAdmin(data: CreateSuperAdminData) {
  const hashedPassword = await bcrypt.hash(data.password, 10);

  const admin = await prisma.client.create({
    data: {
      name: data.name,
      email: data.email,
      password: hashedPassword,
      plan: 'admin',
      maxWorkflows: -1,
      maxExecutionsPerDay: -1,
      maxApiKeys: -1,
      isActive: true,
    },
  });

  return admin;
}

/**
 * Función principal
 */
async function main() {
  console.log(`${colors.bright}${colors.green}Workflow Automation - Crear Super Admin${colors.reset}`);
  console.log(`${colors.yellow}Este script creará el primer usuario administrador del sistema${colors.reset}\n`);

  try {
    // Verificar si ya existe un admin
    const hasAdmin = await checkExistingAdmin();
    if (hasAdmin) {
      console.log(`${colors.red}${colors.bright}Error: Ya existe al menos un usuario administrador${colors.reset}`);
      console.log(`${colors.yellow}Este script solo debe usarse para crear el primer super admin${colors.reset}`);
      console.log(`${colors.yellow}Para crear más admins, use el endpoint POST /admin/users${colors.reset}\n`);
      process.exit(1);
    }

    const rl = createInterface();

    // Solicitar datos
    const adminData = await promptAdminData(rl);
    rl.close();

    // Confirmar
    console.log(`\n${colors.yellow}Se creará el siguiente usuario administrador:${colors.reset}`);
    console.log(`  Nombre: ${colors.cyan}${adminData.name}${colors.reset}`);
    console.log(`  Email:  ${colors.cyan}${adminData.email}${colors.reset}`);
    console.log(`  Plan:   ${colors.cyan}admin${colors.reset}`);
    console.log(`  Límites: ${colors.cyan}ilimitados${colors.reset}\n`);

    const rlConfirm = createInterface();
    const confirm = await question(rlConfirm, `${colors.yellow}¿Desea continuar? (s/n): ${colors.reset}`);
    rlConfirm.close();

    if (confirm.toLowerCase() !== 's' && confirm.toLowerCase() !== 'y') {
      console.log(`${colors.yellow}Operación cancelada${colors.reset}\n`);
      process.exit(0);
    }

    // Crear admin
    console.log(`\n${colors.blue}Creando usuario administrador...${colors.reset}`);
    const admin = await createSuperAdmin(adminData);

    // Success
    console.log(`\n${colors.green}${colors.bright}✓ Super Admin creado exitosamente${colors.reset}\n`);
    console.log(`${colors.bright}Credenciales para primer login:${colors.reset}`);
    console.log(`  ID:    ${colors.cyan}${admin.id}${colors.reset}`);
    console.log(`  Email: ${colors.cyan}${admin.email}${colors.reset}`);
    console.log(`  Plan:  ${colors.cyan}${admin.plan}${colors.reset}\n`);
    console.log(`${colors.yellow}⚠️  Guarde estas credenciales en un lugar seguro${colors.reset}`);
    console.log(`${colors.yellow}⚠️  Configure la variable ADMIN_API_KEY en el archivo .env${colors.reset}\n`);

  } catch (error) {
    console.error(`\n${colors.red}${colors.bright}Error al crear super admin:${colors.reset}`);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar
main();
