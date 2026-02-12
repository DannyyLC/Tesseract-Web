export const dashboardSwaggerDesc = `
# Get Organization Dashboard

Retrieve the dashboard information for a specific organization by its ID. This endpoint provides an overview of the organization's status, members, and activity metrics.

**Method:** GET
**Path:** /organizations/dashboard/:id

## Parameters
- **id**: Organization UUID (path parameter)

## Response
Returns the dashboard data for the organization, including summary statistics and member information.
`;