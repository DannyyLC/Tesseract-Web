export const signupStepOneSwaggerDesc = `### Signup - Step 1: Send Verification Email
This endpoint starts the signup process by sending a verification email to the user.

#### Business rules:
1. The **email** field is required.
2. If the email already has an account, no code is sent: that address gets a notice with links to sign in or reset the password instead. The response is identical either way, so the endpoint does not reveal which emails are registered.

> **Note:** This is the first step of user signup.

#### Responses
- **200 OK**: Verification email sent successfully.
- **500 Internal Server Error**: Error sending the email.`;
