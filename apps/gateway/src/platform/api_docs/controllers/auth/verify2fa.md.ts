export const verify2FASwaggerDesc = `### Verify 2FA Code
This endpoint allows you to verify the two-factor authentication (2FA) code sent by the user.

#### Business rules:
1. The user must have an active 2FA flow (a valid \`temp2FAToken\` cookie).
2. The **code2FA** field is required in the body.
3. Accepts either a **6-digit TOTP code** or a **backup code** (\`XXXXX-XXXXX\`, case-insensitive,
   hyphen optional). Backup codes are single-use: once spent they cannot be replayed.
4. TOTP codes tolerate ±1 time step (30s) of clock drift, and each step can only be consumed once —
   replaying a still-valid code is rejected.

> **Note:** If the code is valid, session tokens are set. This step is necessary in the login flow when 2FA is enabled.

#### Responses
- **200 OK**: 2FA successfully verified.
- **401 Unauthorized**: Invalid, already-used or expired 2FA code.
- **500 Internal Server Error**: Error verifying the code.`;
