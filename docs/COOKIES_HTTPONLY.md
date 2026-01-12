# Autenticación con Cookies httpOnly

Este proyecto utiliza **cookies httpOnly** para almacenar los tokens JWT de forma segura, protegiéndolos contra ataques XSS (Cross-Site Scripting)

---

## Configuración Backend

### Variables de entorno (.env)

```bash
# Frontend URL para CORS
FRONTEND_URL="http://localhost:3001"

# Entorno (development o production)
NODE_ENV=development  # En producción: production
```

### Características de seguridad implementadas:

- **httpOnly**: JavaScript no puede leer las cookies
- **secure**: En producción, solo se envían por HTTPS
- **sameSite: 'strict'**: Protección contra CSRF
- **path específico**: refreshToken solo se envía a `/api/auth`
- **CORS configurado**: `credentials: true` para permitir cookies

---

## Uso en el Frontend

### 1. Login

```javascript
async function login(email, password) {
  const response = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // ← CRÍTICO
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error('Login failed');
  }

  const { user } = await response.json();
  // Las cookies se establecieron automáticamente
  return user;
}
```

### 2. Llamadas autenticadas

```javascript
async function getProfile() {
  const response = await fetch('http://localhost:3000/api/auth/me', {
    method: 'GET',
    credentials: 'include', // ← Envía las cookies automáticamente
  });

  return await response.json();
}

async function createWorkflow(data) {
  const response = await fetch('http://localhost:3000/api/workflows', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // ← Siempre incluir
    body: JSON.stringify(data),
  });

  return await response.json();
}
```

### 3. Refresh Token

```javascript
async function refreshToken() {
  const response = await fetch('http://localhost:3000/api/auth/refresh', {
    method: 'POST',
    credentials: 'include', // ← Lee refreshToken de la cookie
  });

  if (!response.ok) {
    // Token expirado, redirigir a login
    window.location.href = '/login';
    return;
  }

  const { success } = await response.json();
  // Nuevas cookies establecidas automáticamente
  return success;
}
```

### 4. Logout

```javascript
async function logout() {
  await fetch('http://localhost:3000/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });

  // Las cookies se limpiaron automáticamente
  window.location.href = '/login';
}

async function logoutAll() {
  await fetch('http://localhost:3000/api/auth/logout-all', {
    method: 'POST',
    credentials: 'include',
  });

  window.location.href = '/login';
}
```

## Cookies establecidas

### accessToken

```
Name: accessToken
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Domain: localhost
Path: /
HttpOnly: true
Secure: true (en producción)
SameSite: Strict
Max-Age: 900 (15 minutos)
```

### refreshToken

```
Name: refreshToken
Value: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Domain: localhost
Path: /api/auth
HttpOnly: true
Secure: true (en producción)
SameSite: Strict
Max-Age: 604800 (7 días)
```
