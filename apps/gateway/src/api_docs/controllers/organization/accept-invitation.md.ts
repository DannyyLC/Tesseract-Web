export const acceptInvitationSwaggerDesc = `
# Accept Invitation

Accept an invitation to join the organization. The user must provide credentials and a verification code.

**Method:** POST
**Path:** /organizations/accept-invitation

## Parameters
- **user**: Username (request body)
- **password**: Password (request body)
- **verificationCode**: Verification code (request body)

## Response
Returns a confirmation of successful acceptance and membership on success, null otherwise.
`;
