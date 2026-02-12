export const resendInvitationSwaggerDesc = `
# Resend Invitation

Resend an invitation email to a user who has not yet accepted the invitation to join the organization.

**Method:** POST
**Path:** /organizations/resend-invitation

## Parameters
- **email**: Email address of the user (request body)

## Response
Returns a confirmation that the invitation was resent.
`;