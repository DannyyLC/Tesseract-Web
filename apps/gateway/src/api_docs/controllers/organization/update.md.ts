export const updateOrganizationSwaggerDesc = `
# Update Organization

Update the details of an existing organization. This endpoint allows modification of organization name, settings, and other properties.

**Method:** PATCH
**Path:** /organizations/update?id={id}

## Parameters
- **id**: Organization UUID (query parameter)
- **body**: UpdateOrganizationDto (request body)

## Response
Returns the updated organization details.
`;