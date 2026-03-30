import AuthScreen from '../_components/AuthScreen';

export const metadata = {
  title: 'Sign Up | Tesseract',
  description: 'Crea tu cuenta corporativa en Tesseract.',
};

export default function SignupPage() {
  return <AuthScreen mode="signup" />;
}
