export const setup2FASwaggerDesc = `### 2FA Setup
This endpoint starts the two-factor authentication (2FA) setup process for the authenticated user.

#### Business rules:
1. The user must be authenticated (valid token).
2. No body is required in the request.

> **Note:** Returns the necessary data to set up 2FA in an authenticator app.

#### Responses
- **200 OK**: 2FA setup process started successfully and returns the QR code to link with an authenticator app.
- **500 Internal Server Error**: Error starting the 2FA setup.`
