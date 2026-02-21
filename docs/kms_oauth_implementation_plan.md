# Plan de Implementación: Gestión Centralizada de Tokens OAuth con Google Cloud KMS

Este documento detalla los pasos, arquitectura y consideraciones técnicas para integrar Google Cloud KMS y almacenar los tokens de acceso OAuth de los usuarios para herramientas específicas (Ej. Google Sheets) de manera segura en un sistema tipo n8n.

## 1. Configuración Inicial en Google Cloud Platform (GCP)

Antes de escribir código, es necesario preparar la infraestructura criptográfica en GCP.

### Pasos en GCP:

1.  **Habilitar la API de KMS:**
    Navega a la consola de GCP, ve a "API y Servicios", busca **Cloud Key Management Service (KMS) API** y habilítala.
2.  **Crear un Llavero (Key Ring):**
    Agrupa las llaves criptográficas. Crea uno llamado algo como `tesseract-key-ring` y elige la región donde corre tu aplicación (ej. `us-central1`).
3.  **Crear una Llave Criptográfica (Crypto Key):**
    Dentro del Key Ring, crea una llave llamada `oauth-tokens-key`.
    - **Propósito:** Cifrado simétrico (Symmetric encrypt/decrypt).
    - **Rotación:** Recomendado programarla a 90 días automáticamente.
4.  **Permisos IAM:**
    Asegúrate de que la Service Account con la que corre tu backend tenga el rol:
    - `roles/cloudkms.cryptoKeyEncrypterDecrypter` (Encriptador/desencriptador de CryptoKey de Cloud KMS).

---

## 2. Dependencias del Entorno en Node.js/TypeScript

Para implementar el Envelope Encryption de forma segura y estándar, usaremos la librería open-source de Google llamada **Tink**.

📝 **Instalación:**

```bash
npm install tink-crypto
npm install @google-cloud/kms
```

- `tink-crypto`: Maneja el cifrado de sobre (Envelope Encryption) localmente.
- `@google-cloud/kms`: El cliente oficial de IAM para autenticarse con el servicio de KMS.

---

## 3. Arquitectura de Base de Datos (PostgreSQL)

Necesitamos una nueva tabla que correlacione al usuario, la herramienta específica y sus tokens cifrados.

### Arquitectura Recomendada: Separación de Configuración y Secretos

Para cumplir con la necesidad de eliminar/cambiar _solo_ las credenciales sin afectar la herramienta (`TenantTool`) ni su historial, el mejor enfoque en términos de seguridad empresarial es **separar los secretos en una tabla dedicada**.

Esto permite que un `TenantTool` (ej. "Calendario de Ventas") persista en el tiempo y mantenga sus configuraciones y dependencias, pero su motor de autenticación pueda ser reemplazado o destruido limpiamente.

#### 1. Modificación a `TenantTool` (El Cascarón)

```prisma
model TenantTool {
  id            String      @id @default(uuid())
  toolCatalogId String
  toolCatalog   ToolCatalog @relation(fields: [toolCatalogId], references: [id], onDelete: Restrict)

  displayName   String      // Ej: "Calendario de Ventas"
  config        Json?       // {"calendar_id": "primary"}

  // Funciones permitidas al crear la tool (autorización granular)
  // Ej: ["create_event", "list_events"]
  allowedFunctions Json?    @db.JsonB

  status          String    @default("connected") // connected, error, expired_auth

  // Eliminamos credentialPath y en su lugar usamos una relación
  credential    TenantToolCredential?

  // Quién creó esta herramienta
  createdByUserId String?
  user            User?     @relation(fields: [createdByUserId], references: [id], onDelete: SetNull)

  // ... (relaciones con organization, workflows, timestamps)
}
```

#### 2. NUEVA Tabla: `TenantToolCredential` (La Bóveda)

Esta tabla almacena estrictamente el material criptográfico. Si el usuario revoca el acceso, **esta fila se elimina físicamente (Hard-Delete)** usando un `DELETE FROM`, mientras que el `TenantTool` sobrevive, cambiando su estado a `expired_auth`.

```prisma
model TenantToolCredential {
  id             String      @id @default(uuid())

  // Relación 1:1 con la herramienta
  tenantToolId   String      @unique
  tenantTool     TenantTool  @relation(fields: [tenantToolId], references: [id], onDelete: Cascade)

  // Proveedor de la identidad
  oauthProvider  String      // "google", "hubspot", etc.

  // Tokens Cifrados con KMS + Tink
  encryptedAccessToken   String @db.Text
  encryptedRefreshToken  String? @db.Text
  tokenExpiresAt         DateTime

  // Scopes reales otorgados por el usuario
  scopes   Json?   @db.JsonB

  // Timestamps (NO deletedAt)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("tenant_tool_credentials")
}
```

---

## 4. Flujo Lógico en el Backend

### A. Al Conectar la Herramienta (Autorización OAuth)

1. El usuario autoriza a la app.
2. Tu backend recibe el `code` y lo intercambia por el `access_token`, `refresh_token` y `expires_in`.
3. Tu backend instancia Google Tink ligado a KMS.
4. Tink genera una **Llave de Cifrado de Datos (DEK)**, cifra los tokens con la DEK texto plano, y luego KMS cifra esa DEK.
5. Tink agrupa el token cifrado y la DEK cifrada en un solo string encriptado que Tink sabe estructurar.
6. Guardas ese bloque cifrado en `encryptedAccessToken` y `encryptedRefreshToken` de la BD.

### B. Durante la Ejecución del Agente/Herramienta

1. El agente de Tesseract decide que necesita usar Google Sheets.
2. Consulta la BD y obtiene el registro de `TenantToolCredential` a través de la relación con `TenantTool`.
3. Revisa `tokenExpiresAt`.
   - **Si Expiró:** Usa tu código de descifrado con KMS/Tink con el `encryptedRefreshToken` para obtener el Refresh token crudo. Llama a la API de Google para renovarlo. Guarda el nuevo Access Token cifrado y actualiza `tokenExpiresAt`.
   - **Si Sigue Válido:** Pasa al siguiente paso.
4. Usa KMS/Tink para descifrar el `encryptedAccessToken`.
5. Inyecta ese token crudo en la cabecera HTTP (`Authorization: Bearer <token_crudo>`) de la llamada a la API de Google Sheets.
6. No guarda el token en RAM global ni en logs de consola. Solo existe dentro del ámbito limitadísimo de la función HTTP solicitada.

---

## 5. Resumen de Ventajas para tu Arquitectura

1. **Compartimentalización Total:** Si un usuario autoriza leer su Drive, pero quieres que un agente también envíe correos (Gmail), son credenciales separadas con `toolCatalogId` y `allowedFunctions` separados.
2. **Registro Histórico Intacto:** La tabla `TenantTool` funciona como el cascarón que contiene la configuración (Ej: a qué cuenta de HubSpot apuntar) y puede vivir para siempre ligado a tu historial de `executions`.
3. **Hard-Delete Quirúrgico y Seguro (Bóveda PII):** Al tener `TenantToolCredential` gestionando exclusivamente los secretos, cumplir con leyes de privacidad es trivial. Simplemente haces un `DELETE FROM tenant_tool_credentials WHERE id = ?`. La credencial desaparece del plano existencial sin obligarte a borrar o mutilar registros históricos de Tesseract.
4. **Auditoría y Propiedad:** Con el campo `createdByUserId` en `TenantTool`, garantizas que las credenciales de un calendario o hubspot solo puedan ser manipuladas por la persona que otorgó el acceso OAuth, evitando choques entre el equipo.
5. **Alto rendimiento:** Tink cifra y descifra localmente muy rápido tras hacer el intercambio inicial con KMS, permitiendo miles de ejecuciones de tus agentes en Tesseract sin ahogar en costos ni latencia tu uso de la API de GCP.
