export const setup2FASwaggerDesc = `### 2FA Setup
This endpoint starts the two-factor authentication (2FA) setup process for the authenticated user.

#### Business rules:
1. The user must be authenticated (valid token).
2. The generated secret is stored as a **pending** secret and does **not** activate 2FA. It is only
   promoted to the active secret once the user confirms a code through \`POST /auth/2fa/enable\`.
   An abandoned setup therefore never leaves an account without a second factor.
3. If the user **already has 2FA enabled**, \`code2FA\` is required in the body: replacing an active
   authenticator demands proof of the current one. Both a TOTP code and a backup code are accepted.

> **Note:** Returns the data needed to set up 2FA in an authenticator app: the QR code plus the
> base32 secret for manual entry when the QR cannot be scanned.

#### Body (optional)
\`\`\`json
{ "code2FA": "123456" }
\`\`\`

#### Responses
- **200 OK**: Setup started. Returns \`{ qr, secret }\`.
- **403 Forbidden**: \`2FA_REQUIRED\` — 2FA is already enabled and no code was supplied.
- **401 Unauthorized**: The supplied code is invalid.
- **500 Internal Server Error**: Error starting the 2FA setup.`;
