export const acceptInvitationSwaggerDesc = `
# Accept Invitation

Accept an invitation to join the organization. The user must provide credentials and a verification code.

**Method:** POST
**Path:** /organizations/accept-invitation

## Parameters
- **user**: Username (request body)
- **password**: Password (request body)
- **email**: Email the invitation was sent to (request body). The code is only valid together with it.
- **verificationCode**: Verification code (request body). Each invitation allows 5 attempts; after that it is discarded and a new one must be sent.

## Response
Returns a confirmation of successful acceptance and membership on success, null otherwise.
`;
