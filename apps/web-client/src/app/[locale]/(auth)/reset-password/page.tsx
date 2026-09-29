import { Suspense } from 'react';
import ResetPasswordScreen from '../_components/reset-password-screen';

export const metadata = {
  title: 'Restablecer contraseña | Tesseract',
  description: 'Ingresa tu nueva contraseña para Tesseract.',
};

export default function ResetPasswordPage() {
  // `useSearchParams` exige un límite de Suspense para que la página se pueda prerenderizar.
  return (
    <Suspense>
      <ResetPasswordScreen />
    </Suspense>
  );
}
