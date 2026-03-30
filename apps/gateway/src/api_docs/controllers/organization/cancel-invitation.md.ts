export const cancelInvitationSwaggerDesc = `
# Cancel Invitation

Cancel a pending invitation for a user to join the organization.

**Method:** POST
**Path:** /organizations/cancel-invitation

## Parameters
- **email**: Email address of the user (request body)

## Response
Returns a confirmation that the invitation was cancelled.
`;
