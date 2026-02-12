export const signupStepThreeSwaggerDesc = `### Signup - Step 3: Create User
This endpoint completes the signup by creating the user in the system.

#### Business rules:
1. The body must contain the required user data (name, email, password, etc.).
2. The email must have been previously verified.

> **Note:** This is the final step of user signup.

#### Responses
- **201 Created**: User successfully registered.
- **400 Bad Request**: Registration error or invalid data.`
