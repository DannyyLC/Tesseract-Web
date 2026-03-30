export const verify2FASwaggerDesc = `### Verify 2FA Code
This endpoint allows you to verify the two-factor authentication (2FA) code sent by the user.

#### Business rules:
1. The user must have an active 2FA flow.
2. The **code2FA** field is required in the body.

> **Note:** If the code is valid, session tokens are set. This step is necessary in the login flow when 2FA is enabled.

#### Responses
- **200 OK**: 2FA successfully verified.
- **401 Unauthorized**: Invalid or expired 2FA code.
- **500 Internal Server Error**: Error verifying the code.`;
