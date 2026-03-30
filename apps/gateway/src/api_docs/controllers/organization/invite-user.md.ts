export const inviteUserSwaggerDesc = `
# Invite User to Organization

Invite a user to join the organization by email. Sends an invitation email to the specified address.

**Method:** POST
**Path:** /organizations/invite-user

## Parameters
- **email**: Email address of the user to invite (request body)

## Response
Returns a confirmation that the invitation was sent.
`;
