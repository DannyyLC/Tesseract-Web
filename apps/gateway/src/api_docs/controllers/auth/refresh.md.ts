export const refreshSwaggerDesc = `### Refresh Token
This endpoint allows you to refresh the access token using the refresh token stored in the cookie.

#### Business rules:
1. The refresh token must be present in the cookie.
2. No body is required in the request.

> **Note:** The old refresh token is invalidated (token rotation).

#### Responses
- **200 OK**: Tokens updated successfully.
- **401 Unauthorized**: Invalid or missing refresh token.`
