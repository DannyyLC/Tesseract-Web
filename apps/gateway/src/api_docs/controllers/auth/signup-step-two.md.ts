export const signupStepTwoSwaggerDesc = `### Signup - Step 2: Verify Email Code
This endpoint verifies the verification code sent to the user's email during signup.

#### Business rules:
1. The **code** field is required in the body.
2. The code must be valid and not expired.

> **Note:** This is the second step of user signup.

#### Responses
- **200 OK**: Email successfully verified.
- **400 Bad Request**: Invalid or expired code.`
