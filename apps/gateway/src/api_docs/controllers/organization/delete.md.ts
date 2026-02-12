export const deleteOrganizationSwaggerDesc = `
# Delete Organization

Delete an organization by its ID. This endpoint removes the organization and all associated data.\n
**Note:** This action is a soft delete, meaning the organization data is not permanently removed but marked as inactive.

**Method:** DELETE
**Path:** /organizations/delete

## Parameters
- **id**: Organization UUID (query parameter)

## Response
Returns a confirmation of deletion.
`;