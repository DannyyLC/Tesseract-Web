import AuthScreen from '../_components/auth-screen';

export const metadata = {
  title: 'Sign Up | Tesseract',
  description: 'Crea tu cuenta corporativa en Tesseract.',
};

export default function SignupPage() {
  return <AuthScreen mode="signup" />;
}
