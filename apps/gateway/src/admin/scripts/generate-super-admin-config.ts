#!/usr/bin/env node
/**
 * 🔒 Script para generar configuración de Super Admin
 * 
 * Este script ayuda a generar las variables de entorno necesarias
 * para configurar un super administrador de forma segura.
 * 
 * Uso:
 *   npx ts-node src/admin/scripts/generate-super-admin-config.ts
 * 
 * El script:
 * 1. Solicita email, nombre y contraseña
 * 2. Valida que la contraseña sea fuerte
 * 3. Genera un hash bcrypt de la contraseña
 * 4. Genera un JWT secret si no existe
 * 5. Muestra las variables de entorno a agregar en .env
 */

import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as readline from 'readline';

// Colores para terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

interface SuperAdminInput {
  id: string;
  email: string;
  name: string;
  password: string;
  allowedIPs?: string;
}

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function question(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function isStrongPassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 16) {
    return { valid: false, message: '❌ La contraseña debe tener al menos 16 caracteres (esto es un super admin!)' };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: '❌ Debe contener al menos una mayúscula' };
  }

  if (!/[a-z]/.test(password)) {
    return { valid: false, message: '❌ Debe contener al menos una minúscula' };
  }

  if (!/[0-9]/.test(password)) {
    return { valid: false, message: '❌ Debe contener al menos un número' };
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, message: '❌ Debe contener al menos un carácter especial' };
  }

  return { valid: true };
}

async function promptSuperAdminData(rl: readline.Interface, adminNumber: number): Promise<SuperAdminInput> {
  console.log(`\n${colors.cyan}${colors.bright}=== Configurar Super Admin #${adminNumber} ===${colors.reset}\n`);

  // ID
  const id = `sa-${String(adminNumber).padStart(3, '0')}`;
  console.log(`${colors.blue}ID automático: ${colors.green}${id}${colors.reset}`);

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

    emailValid = true;
  }

  // Nombre
  let name = '';
  while (!name.trim()) {
    name = await question(rl, `${colors.blue}Nombre completo: ${colors.reset}`);
    if (!name.trim()) {
      console.log(`${colors.red}El nombre es requerido${colors.reset}`);
    }
  }

  // Password
  let password = '';
  let passwordValid = false;
  console.log(`\n${colors.yellow}⚠️  La contraseña debe ser ULTRA SEGURA (min 16 caracteres)${colors.reset}`);
  
  while (!passwordValid) {
    password = await question(rl, `${colors.blue}Contraseña: ${colors.reset}`);
    
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

  // IPs permitidas (opcional)
  console.log(`\n${colors.yellow}🔒 Restricción de IP (opcional, presiona Enter para omitir)${colors.reset}`);
  console.log(`${colors.yellow}Formato: 192.168.1.100,10.0.0.5${colors.reset}`);
  const allowedIPs = await question(rl, `${colors.blue}IPs permitidas (opcional): ${colors.reset}`);

  return { id, email, name, password, allowedIPs: allowedIPs.trim() || undefined };
}

function generateJwtSecret(): string {
  return crypto.randomBytes(64).toString('hex');
}

async function generateHash(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

async function main() {
  console.log(`${colors.bright}${colors.magenta}`);
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║                                                            ║');
  console.log('║       🔒 GENERADOR DE CONFIGURACIÓN SUPER ADMIN 🔒         ║');
  console.log('║                                                            ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(colors.reset);
  
  console.log(`${colors.yellow}Este script genera las variables de entorno para super administradores.${colors.reset}\n`);

  const rl = createInterface();

  try {
    // Preguntar cuántos super admins configurar
    const countStr = await question(rl, `${colors.blue}¿Cuántos super admins deseas configurar? (1-5): ${colors.reset}`);
    const count = parseInt(countStr, 10);

    if (isNaN(count) || count < 1 || count > 5) {
      console.log(`${colors.red}Número inválido. Debe ser entre 1 y 5${colors.reset}`);
      rl.close();
      return;
    }

    const admins: SuperAdminInput[] = [];

    for (let i = 1; i <= count; i++) {
      const admin = await promptSuperAdminData(rl, i);
      admins.push(admin);
    }

    rl.close();

    console.log(`\n${colors.blue}Generando configuración...${colors.reset}\n`);

    // Generar JWT secret
    const jwtSecret = generateJwtSecret();

    // Generar hashes
    const adminsWithHashes = await Promise.all(
      admins.map(async (admin) => ({
        ...admin,
        passwordHash: await generateHash(admin.password),
      }))
    );

    // Mostrar configuración
    console.log(`${colors.green}${colors.bright}✅ Configuración generada exitosamente${colors.reset}\n`);
    console.log(`${colors.yellow}${colors.bright}📋 Agrega lo siguiente a tu archivo .env:${colors.reset}\n`);
    console.log(`${colors.cyan}# ============================================`);
    console.log(`# 🔒 SUPER ADMIN CONFIGURATION`);
    console.log(`# ⚠️  MANTENER EN SECRETO - NO SUBIR A GIT`);
    console.log(`# ============================================${colors.reset}\n`);

    console.log(`${colors.cyan}# JWT Secret para super admins`);
    console.log(`SUPER_ADMIN_SECRET=${jwtSecret}${colors.reset}\n`);

    adminsWithHashes.forEach((admin, index) => {
      const num = index + 1;
      console.log(`${colors.cyan}# Super Admin ${num}: ${admin.email}`);
      console.log(`SUPER_ADMIN_${num}_ID=${admin.id}`);
      console.log(`SUPER_ADMIN_${num}_EMAIL=${admin.email}`);
      console.log(`SUPER_ADMIN_${num}_PASSWORD_HASH=${admin.passwordHash}`);
      console.log(`SUPER_ADMIN_${num}_NAME=${admin.name}`);
      if (admin.allowedIPs) {
        console.log(`SUPER_ADMIN_${num}_ALLOWED_IPS=${admin.allowedIPs}`);
      }
      console.log(colors.reset);
    });

    console.log(`${colors.yellow}${colors.bright}⚠️  IMPORTANTE:${colors.reset}`);
    console.log(`${colors.yellow}1. Guarda esta configuración en un lugar SEGURO${colors.reset}`);
    console.log(`${colors.yellow}2. Agrega estas variables a tu archivo .env${colors.reset}`);
    console.log(`${colors.yellow}3. NO subas el .env a git (debe estar en .gitignore)${colors.reset}`);
    console.log(`${colors.yellow}4. Reinicia el servidor después de agregar las variables${colors.reset}\n`);

    console.log(`${colors.green}Credenciales para login:${colors.reset}`);
    adminsWithHashes.forEach((admin, index) => {
      console.log(`\n${colors.bright}Super Admin ${index + 1}:${colors.reset}`);
      console.log(`  Email:    ${colors.cyan}${admin.email}${colors.reset}`);
      console.log(`  Password: ${colors.cyan}[LA QUE INGRESASTE]${colors.reset}`);
    });

    console.log(`\n${colors.green}${colors.bright}🎉 ¡Listo! Tu configuración está generada${colors.reset}\n`);

  } catch (error) {
    console.error(`\n${colors.red}${colors.bright}❌ Error:${colors.reset}`, error);
    rl.close();
    process.exit(1);
  }
}

main();
