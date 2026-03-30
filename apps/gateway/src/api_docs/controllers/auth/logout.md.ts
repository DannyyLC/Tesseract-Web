export const logoutSwaggerDesc = `### Logout
This endpoint logs out the user, invalidates the refresh token, and clears authentication cookies.

#### Business rules:
1. The refresh token must be present in the cookie.
2. No body is required in the request.

> **Note:** Only invalidates the refresh token specific to this session.

#### Responses
- **200 OK**: Session closed successfully.
- **401 Unauthorized**: Invalid or expired token.`;
