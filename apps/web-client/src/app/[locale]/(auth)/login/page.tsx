import AuthScreen from '../_components/auth-screen';

export const metadata = {
  title: 'Login | Tesseract',
  description: 'Inicia sesión en tu plataforma de automatización.',
};

export default function LoginPage() {
  return <AuthScreen mode="login" />;
}
