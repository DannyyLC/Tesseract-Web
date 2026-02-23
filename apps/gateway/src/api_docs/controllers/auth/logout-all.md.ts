export const logoutAllSwaggerDesc = `### Logout on All Devices
This endpoint logs out the user on all devices, invalidating all refresh tokens and clearing cookies.

#### Business rules:
1. The user must be authenticated.
2. No body is required in the request.

> **Note:** Invalidates all user sessions on all devices.

#### Responses
- **200 OK**: Session closed on all devices.
- **401 Unauthorized**: Invalid or expired token.`;
