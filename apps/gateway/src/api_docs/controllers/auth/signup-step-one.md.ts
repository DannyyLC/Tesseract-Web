export const signupStepOneSwaggerDesc = `### Signup - Step 1: Send Verification Email
This endpoint starts the signup process by sending a verification email to the user.

#### Business rules:
1. The **email** field is required.
2. The email must be valid and not already registered.

> **Note:** This is the first step of user signup.

#### Responses
- **200 OK**: Verification email sent successfully.
- **500 Internal Server Error**: Error sending the email or email already registered.`
