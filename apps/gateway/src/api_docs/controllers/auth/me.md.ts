export const meSwaggerDesc = `### Get User Profile
This endpoint returns the information of the authenticated user.

#### Business rules:
1. The user must be authenticated (valid token in the cookie).
2. No body or parameters are required.

> **Note:** The access token is automatically read from the cookie.

#### Responses
- **200 OK**: Authenticated user information.
- **401 Unauthorized**: Invalid or expired token.`
