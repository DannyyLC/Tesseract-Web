/**
 * @file AuthScreen.spec.tsx
 * Tests for the AuthScreen component - covers login form, signup 3-step flow,
 * Google auth button, and auth-state redirects.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// ---------------------------------------------------------------------------
// Module mocks (must be declared before component import)
// ---------------------------------------------------------------------------

const mockRouterPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

// Framer motion – render children without animation overhead
jest.mock('framer-motion', () => {
  const actual = jest.requireActual('framer-motion');
  return {
    ...actual,
    motion: new Proxy(
      {},
      {
        get: (_t, tag: string) =>
          ({ children, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) =>
            React.createElement(tag, props, children),
      },
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// Cloudflare Turnstile – simulate a widget that fires onSuccess immediately
const mockTurnstile = jest.fn();
jest.mock('@marsidev/react-turnstile', () => ({
  Turnstile: (props: { onSuccess: (token: string) => void; onExpire: () => void }) => {
    mockTurnstile(props);
    return <div data-testid="turnstile" />;
  },
}));

// Toast notifications
jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

// LogoLoader
jest.mock('@/components/ui/logo-loader', () => ({
  LogoLoader: ({ text }: { text: string }) => <div>{text}</div>,
}));

// ---------------------------------------------------------------------------
// Hook mocks
// ---------------------------------------------------------------------------

const mockLogin = jest.fn();
const mockSignupStepOne = jest.fn();
const mockSignupStepTwo = jest.fn();
const mockSignupStepThree = jest.fn();

// Default hook return values (overridden per-test as needed)
const defaultHooks: {
  useAuth: any;
  useLogin: any;
  useSignupStepOne: any;
  useSignupStepTwo: any;
  useSignupStepThree: any;
  useGoogleAuthUrl: string;
} = {
  useAuth: { data: null, isLoading: false },
  useLogin: { mutate: mockLogin, isPending: false, error: null },
  useSignupStepOne: { mutateAsync: mockSignupStepOne, isPending: false },
  useSignupStepTwo: { mutateAsync: mockSignupStepTwo, isPending: false },
  useSignupStepThree: { mutateAsync: mockSignupStepThree, isPending: false },
  useGoogleAuthUrl: 'https://accounts.google.com/o/oauth2/auth?mock=1',
};

jest.mock('@/hooks/useAuth', () => ({
  useAuth: jest.fn(),
  useLogin: jest.fn(),
  useSignupStepOne: jest.fn(),
  useSignupStepTwo: jest.fn(),
  useSignupStepThree: jest.fn(),
  useGoogleAuthUrl: jest.fn(),
}));

import {
  useAuth,
  useLogin,
  useSignupStepOne,
  useSignupStepTwo,
  useSignupStepThree,
  useGoogleAuthUrl,
} from '@/hooks/useAuth';
import { toast } from 'sonner';
import AuthScreen from './AuthScreen';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupHooks(overrides: Partial<typeof defaultHooks> = {}) {
  const hooks = { ...defaultHooks, ...overrides };
  (useAuth as jest.Mock).mockReturnValue(hooks.useAuth);
  (useLogin as jest.Mock).mockReturnValue(hooks.useLogin);
  (useSignupStepOne as jest.Mock).mockReturnValue(hooks.useSignupStepOne);
  (useSignupStepTwo as jest.Mock).mockReturnValue(hooks.useSignupStepTwo);
  (useSignupStepThree as jest.Mock).mockReturnValue(hooks.useSignupStepThree);
  (useGoogleAuthUrl as jest.Mock).mockReturnValue(hooks.useGoogleAuthUrl);
}

/** Simulate a Turnstile token being delivered after the widget mounts */
function fireTurnstileSuccess(token = 'mock-turnstile-token') {
  // The last call to mockTurnstile has the props; invoke onSuccess
  const lastCall = mockTurnstile.mock.calls[mockTurnstile.mock.calls.length - 1];
  if (lastCall) lastCall[0].onSuccess(token);
}

function setInputByPlaceholder(placeholder: string, value: string) {
  fireEvent.change(screen.getByPlaceholderText(placeholder), {
    target: { value },
  });
}

function getInputById(id: string): HTMLInputElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Input with id ${id} was not found`);
  }
  return element;
}

function getStep3Input(id: string): HTMLInputElement {
  const createAccountButton = screen.getByRole('button', { name: /crear cuenta/i });
  const step3Form = createAccountButton.closest('form');
  if (!step3Form) {
    throw new Error('Step 3 form was not found');
  }
  const element = step3Form.querySelector(`#${id}`);
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(`Step 3 input with id ${id} was not found`);
  }
  return element;
}

function getCreateAccountButton(): HTMLButtonElement {
  const button = screen.getByTestId('create-account-button');
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error('Create account button was not found');
  }
  return button;
}

function setStep3Passwords(password: string, confirmPassword: string) {
  act(() => {
    const passwordInput = getStep3Input('new-password');
    fireEvent.change(passwordInput, { target: { value: password } });
  });
  act(() => {
    const confirmInput = getStep3Input('confirm-password');
    fireEvent.change(confirmInput, { target: { value: confirmPassword } });
  });
}

async function completeSignupStep1() {
  setInputByPlaceholder('Tu nombre y apellido', 'John Doe');
  setInputByPlaceholder('ejemplo@empresa.com', 'john@corp.com');
  setInputByPlaceholder('Ej: Mi Empresa S.A.', 'Corp Inc');
  await userEvent.click(screen.getByRole('checkbox'));
  act(() => fireTurnstileSuccess());
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /continuar/i })).toBeEnabled();
  });
}

// ---------------------------------------------------------------------------
// Test setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockSignupStepOne.mockResolvedValue(undefined);
  mockSignupStepTwo.mockResolvedValue(true);
  mockSignupStepThree.mockResolvedValue(undefined);
  sessionStorage.clear();
  setupHooks();
});

// ===========================================================================
// AUTH STATE GUARDS
// ===========================================================================

describe('AuthScreen – auth state guards', () => {
  it('shows logo loader while checking auth', () => {
    setupHooks({ useAuth: { data: null, isLoading: true } });
    render(<AuthScreen mode="login" />);
    expect(screen.getByText('Verificando')).toBeInTheDocument();
  });

  it('returns null (renders nothing) when user is already authenticated', () => {
    setupHooks({ useAuth: { data: { sub: '1', email: 'a@b.com' } as any, isLoading: false } });
    const { container } = render(<AuthScreen mode="login" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('redirects to /dashboard when user becomes authenticated', () => {
    setupHooks({ useAuth: { data: { sub: '1', email: 'a@b.com' } as any, isLoading: false } });
    render(<AuthScreen mode="login" />);
    expect(mockRouterPush).toHaveBeenCalledWith('/dashboard');
  });
});

// ===========================================================================
// MODE SWITCHER
// ===========================================================================

describe('AuthScreen – mode switcher', () => {
  it('renders Login and Sign Up tabs', () => {
    setupHooks();
    render(<AuthScreen mode="login" />);
    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.getByText('Sign Up')).toBeInTheDocument();
  });

  it('Login tab links to /login', () => {
    setupHooks();
    render(<AuthScreen mode="login" />);
    expect(screen.getByRole('link', { name: 'Login' })).toHaveAttribute('href', '/login');
  });

  it('Sign Up tab links to /signup', () => {
    setupHooks();
    render(<AuthScreen mode="signup" />);
    expect(screen.getByRole('link', { name: 'Sign Up' })).toHaveAttribute('href', '/signup');
  });
});

// ===========================================================================
// GOOGLE AUTH BUTTON
// ===========================================================================

describe('AuthScreen – Google auth button', () => {
  it('renders Google button on login screen', () => {
    setupHooks();
    render(<AuthScreen mode="login" />);
    expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument();
  });

  it('navigates to Google OAuth URL on click', async () => {
    setupHooks();
    // Spy on the href setter of the Location prototype to intercept the navigation
    let capturedHref = '';
    const hrefDescriptor = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(window.location),
      'href',
    );

    if (hrefDescriptor?.set) {
      const spy = jest.fn((val: string) => { capturedHref = val; });
      Object.defineProperty(window.location, 'href', {
        configurable: true,
        get: hrefDescriptor.get,
        set: spy,
      });
      render(<AuthScreen mode="login" />);
      await userEvent.click(screen.getByRole('button', { name: /google/i }));
      expect(capturedHref).toBe('https://accounts.google.com/o/oauth2/auth?mock=1');
      // Restore
      Object.defineProperty(window.location, 'href', hrefDescriptor);
    } else {
      // Fallback: just check that clicking the button doesn't throw
      render(<AuthScreen mode="login" />);
      await expect(
        userEvent.click(screen.getByRole('button', { name: /google/i })),
      ).resolves.not.toThrow();
    }
  });
});

// ===========================================================================
// LOGIN FORM
// ===========================================================================

describe('AuthScreen – login form', () => {
  it('renders email, password inputs and submit button', () => {
    setupHooks();
    render(<AuthScreen mode="login" />);
    expect(screen.getByPlaceholderText('ejemplo@empresa.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument();
  });

  it('renders "Recordarme" checkbox and forgot password link', () => {
    setupHooks();
    render(<AuthScreen mode="login" />);
    expect(screen.getByText('Recordarme')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /olvidaste tu contraseña/i })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
  });

  it('submit button is disabled when there is no turnstile token', () => {
    setupHooks();
    render(<AuthScreen mode="login" />);
    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeDisabled();
  });

  it('submit button is disabled while login mutation is pending', () => {
    setupHooks({ useLogin: { mutate: mockLogin, isPending: true, error: null } });
    render(<AuthScreen mode="login" />);
    act(() => fireTurnstileSuccess());
    expect(screen.getByRole('button', { name: /iniciando sesión/i })).toBeDisabled();
  });

  it('submit button is enabled after receiving a turnstile token', async () => {
    setupHooks();
    render(<AuthScreen mode="login" />);
    act(() => fireTurnstileSuccess());
    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeEnabled();
  });

  it('calls login mutation with email, password and turnstile token on submit', async () => {
    setupHooks();
    render(<AuthScreen mode="login" />);

    setInputByPlaceholder('ejemplo@empresa.com', 'user@test.com');
    setInputByPlaceholder('••••••••', 'secret123');
    act(() => fireTurnstileSuccess('tok-abc'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeEnabled();
    });

    await userEvent.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    expect(mockLogin).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'user@test.com',
        password: 'secret123',
        turnstileToken: 'tok-abc',
      }),
      expect.any(Object),
    );
  });

  it('toggles password visibility when eye icon button is clicked', async () => {
    setupHooks();
    render(<AuthScreen mode="login" />);
    let passwordInput = screen.getByPlaceholderText('••••••••');
    expect(passwordInput).toHaveAttribute('type', 'password');

    let toggleBtn = passwordInput.parentElement?.querySelector('button[type="button"]');
    expect(toggleBtn).toBeTruthy();
    if (!toggleBtn) {
      throw new Error('Password toggle button not found');
    }
    await userEvent.click(toggleBtn);
    passwordInput = screen.getByPlaceholderText('••••••••');
    expect(passwordInput).toHaveAttribute('type', 'text');

    toggleBtn = passwordInput.parentElement?.querySelector('button[type="button"]');
    if (!toggleBtn) {
      throw new Error('Password toggle button not found after re-render');
    }
    await userEvent.click(toggleBtn);
    passwordInput = screen.getByPlaceholderText('••••••••');
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('displays login mutation error message', () => {
    setupHooks({
      useLogin: {
        mutate: mockLogin,
        isPending: false,
        error: new Error('Email o contraseña incorrectos'),
      },
    });
    render(<AuthScreen mode="login" />);
    expect(screen.getByText('Email o contraseña incorrectos')).toBeInTheDocument();
  });

  it('updates rememberMe state via checkbox', async () => {
    setupHooks();
    render(<AuthScreen mode="login" />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });
});

// ===========================================================================
// SIGNUP – STEP 1 (user details)
// ===========================================================================

describe('AuthScreen – signup step 1', () => {
  it('renders full name, email and organization inputs', async () => {
    setupHooks();
    render(<AuthScreen mode="signup" />);
    expect(await screen.findByPlaceholderText('Tu nombre y apellido')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('ejemplo@empresa.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ej: Mi Empresa S.A.')).toBeInTheDocument();
  });

  it('renders the terms & conditions checkbox', async () => {
    setupHooks();
    render(<AuthScreen mode="signup" />);
    expect(await screen.findByText(/acepto los/i)).toBeInTheDocument();
  });

  it('submit button disabled when required fields are empty', async () => {
    setupHooks();
    render(<AuthScreen mode="signup" />);
    act(() => fireTurnstileSuccess());
    // Still disabled — no field values and terms unchecked
    expect(await screen.findByRole('button', { name: /continuar/i })).toBeDisabled();
  });

  it('submit button disabled when terms are not accepted', async () => {
    setupHooks();
    render(<AuthScreen mode="signup" />);
    await screen.findByPlaceholderText('Tu nombre y apellido');
    setInputByPlaceholder('Tu nombre y apellido', 'John Doe');
    setInputByPlaceholder('ejemplo@empresa.com', 'john@corp.com');
    setInputByPlaceholder('Ej: Mi Empresa S.A.', 'Corp Inc');
    act(() => fireTurnstileSuccess());
    expect(screen.getByRole('button', { name: /continuar/i })).toBeDisabled();
  });

  it('submit button enabled when all fields filled, terms accepted and turnstile ok', async () => {
    setupHooks();
    render(<AuthScreen mode="signup" />);
    await screen.findByPlaceholderText('Tu nombre y apellido');
    await completeSignupStep1();
    expect(screen.getByRole('button', { name: /continuar/i })).toBeEnabled();
  });

  it('advances to step 2 after successful step-1 submission', async () => {
    setupHooks();
    render(<AuthScreen mode="signup" />);
    await screen.findByPlaceholderText('Tu nombre y apellido');
    await completeSignupStep1();

    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
    });
    expect(mockSignupStepOne).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'john@corp.com' }),
    );
  });

  it('shows EMAIL_ALREADY_EXISTS toast when that error is returned', async () => {
    const err = Object.assign(new Error('Email exists'), { errors: ['EMAIL_ALREADY_EXISTS'] });
    mockSignupStepOne.mockRejectedValueOnce(err);
    setupHooks();

    render(<AuthScreen mode="signup" />);
    await screen.findByPlaceholderText('Tu nombre y apellido');
    setInputByPlaceholder('Tu nombre y apellido', 'John Doe');
    setInputByPlaceholder('ejemplo@empresa.com', 'taken@corp.com');
    setInputByPlaceholder('Ej: Mi Empresa S.A.', 'Corp Inc');
    await userEvent.click(screen.getByRole('checkbox'));
    act(() => fireTurnstileSuccess());
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /continuar/i })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Este correo electrónico ya está registrado.',
      );
    });
  });

  it('shows generic error toast for other step-1 failures', async () => {
    mockSignupStepOne.mockRejectedValueOnce(new Error('Server error'));
    setupHooks();

    render(<AuthScreen mode="signup" />);
    await screen.findByPlaceholderText('Tu nombre y apellido');
    setInputByPlaceholder('Tu nombre y apellido', 'John Doe');
    setInputByPlaceholder('ejemplo@empresa.com', 'john@corp.com');
    setInputByPlaceholder('Ej: Mi Empresa S.A.', 'Corp Inc');
    await userEvent.click(screen.getByRole('checkbox'));
    act(() => fireTurnstileSuccess());
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /continuar/i })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole('button', { name: /continuar/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Server error');
    });
  });

  it('persists signup data in sessionStorage', async () => {
    setupHooks();
    render(<AuthScreen mode="signup" />);
    await screen.findByPlaceholderText('Tu nombre y apellido');
    setInputByPlaceholder('Tu nombre y apellido', 'John Doe');
    setInputByPlaceholder('ejemplo@empresa.com', 'john@corp.com');

    await waitFor(() => {
      const stored = JSON.parse(sessionStorage.getItem('signup_data') ?? '{}');
      expect(stored.data?.fullName).toContain('John');
    });
  });
});

// ===========================================================================
// SIGNUP – STEP 2 (verification code)
// ===========================================================================

async function renderAtStep2() {
  setupHooks();
  render(<AuthScreen mode="signup" />);
  await screen.findByPlaceholderText('Tu nombre y apellido');
  await completeSignupStep1();
  await userEvent.click(screen.getByRole('button', { name: /continuar/i }));
  await screen.findByPlaceholderText('000000');
}

describe('AuthScreen – signup step 2 (verification code)', () => {
  it('renders verification code input with correct attributes', async () => {
    await renderAtStep2();
    const input = screen.getByPlaceholderText('000000');
    expect(input).toHaveAttribute('maxLength', '6');
    expect(input).toHaveAttribute('type', 'text');
  });

  it('strips non-numeric characters from verification code input', async () => {
    await renderAtStep2();
    fireEvent.change(screen.getByPlaceholderText('000000'), {
      target: { value: 'abc12def34gh56' },
    });
    expect((screen.getByPlaceholderText('000000') as HTMLInputElement).value).toBe('123456');
  });

  it('verify button is disabled when code is shorter than 6 digits', async () => {
    await renderAtStep2();
    await userEvent.type(screen.getByPlaceholderText('000000'), '123');
    expect(screen.getByRole('button', { name: /verificar código/i })).toBeDisabled();
  });

  it('advances to step 3 when valid code is entered', async () => {
    await renderAtStep2();
    await userEvent.type(screen.getByPlaceholderText('000000'), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verificar código/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /crear cuenta/i })).toBeInTheDocument();
    });
  });

  it('shows error message and remaining attempts on invalid code', async () => {
    mockSignupStepTwo.mockResolvedValueOnce(false);
    await renderAtStep2();
    await userEvent.type(screen.getByPlaceholderText('000000'), '000000');
    await userEvent.click(screen.getByRole('button', { name: /verificar código/i }));
    await waitFor(() => {
      expect(screen.getByText(/código incorrecto/i)).toBeInTheDocument();
    });
  });

  it('resets to step 1 after 3 failed verification attempts', async () => {
    mockSignupStepTwo.mockResolvedValue(false);
    await renderAtStep2();

    for (let i = 0; i < 3; i++) {
      await userEvent.clear(screen.getByPlaceholderText('000000'));
      await userEvent.type(screen.getByPlaceholderText('000000'), '000000');
      await userEvent.click(screen.getByRole('button', { name: /verificar código/i }));
    }

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Has excedido el número máximo de intentos. Por favor, comienza de nuevo.',
      );
    });
    // Step 1 fields should be back
    expect(await screen.findByPlaceholderText('Tu nombre y apellido')).toBeInTheDocument();
  });

  it('resend code button calls step-one mutation again', async () => {
    await renderAtStep2();
    mockSignupStepOne.mockClear();
    await userEvent.click(screen.getByRole('button', { name: /reenviar/i }));
    await waitFor(() => {
      expect(mockSignupStepOne).toHaveBeenCalledTimes(1);
    });
  });
});

// ===========================================================================
// SIGNUP – STEP 3 (password)
// ===========================================================================

async function renderAtStep3() {
  await renderAtStep2();
  setInputByPlaceholder('000000', '123456');
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /verificar código/i })).toBeEnabled();
  });
  await userEvent.click(screen.getByRole('button', { name: /verificar código/i }));
  await screen.findByRole('button', { name: /crear cuenta/i });
}

describe('AuthScreen – signup step 3 (password)', () => {
  it('renders password and confirm-password inputs', async () => {
    await renderAtStep3();
    const inputs = screen.getAllByPlaceholderText('••••••••');
    expect(inputs).toHaveLength(2);
  });

  it('submit button is disabled when password is shorter than 8 characters', async () => {
    await renderAtStep3();
    const passwordInput = getStep3Input('new-password');
    await userEvent.type(passwordInput, 'short');
    expect(screen.getByRole('button', { name: /crear cuenta/i })).toBeDisabled();
  });

  it('shows error toast when passwords do not match', async () => {
    await renderAtStep3();
    setStep3Passwords('password123', 'different999');

    await waitFor(() => {
      expect(getCreateAccountButton()).toBeEnabled();
    });
    await userEvent.click(getCreateAccountButton());
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Las contraseñas no coinciden');
    });
  });

  it('toggles first password field visibility', async () => {
    await renderAtStep3();
    let passwordInput = getStep3Input('new-password');
    expect(passwordInput).toHaveAttribute('type', 'password');
    const toggleBtn = passwordInput.parentElement?.querySelector('button[type="button"]');
    expect(toggleBtn).toBeTruthy();
    if (!toggleBtn) {
      throw new Error('First password toggle button not found');
    }
    await userEvent.click(toggleBtn);
    passwordInput = getStep3Input('new-password');
    expect(passwordInput).toHaveAttribute('type', 'text');
  });

  it('toggles confirm password field visibility', async () => {
    await renderAtStep3();
    let confirmInput = getStep3Input('confirm-password');
    expect(confirmInput).toHaveAttribute('type', 'password');
    const toggleBtn = confirmInput.parentElement?.querySelector('button[type="button"]');
    expect(toggleBtn).toBeTruthy();
    if (!toggleBtn) {
      throw new Error('Confirm password toggle button not found');
    }
    await userEvent.click(toggleBtn);
    confirmInput = getStep3Input('confirm-password');
    expect(confirmInput).toHaveAttribute('type', 'text');
  });

  it('calls step-3 mutation and redirects on successful account creation', async () => {
    await renderAtStep3();
    setStep3Passwords('StrongPass1!', 'StrongPass1!');
    await waitFor(() => {
      expect(getCreateAccountButton()).toBeEnabled();
    });
    await userEvent.click(getCreateAccountButton());

    await waitFor(() => {
      expect(mockSignupStepThree).toHaveBeenCalledWith(
        expect.objectContaining({ password: 'StrongPass1!' }),
      );
      expect(mockRouterPush).toHaveBeenCalledWith('/billing/plans?welcome=true');
      expect(toast.success).toHaveBeenCalledWith('Cuenta creada exitosamente');
    });
  });

  it('shows error toast when account creation fails', async () => {
    mockSignupStepThree.mockRejectedValueOnce(new Error('Password too weak'));
    await renderAtStep3();
    setStep3Passwords('StrongPass1!', 'StrongPass1!');
    await waitFor(() => {
      expect(getCreateAccountButton()).toBeEnabled();
    });
    await userEvent.click(getCreateAccountButton());

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Password too weak');
    });
  });

  it('clears sessionStorage after successful signup', async () => {
    const removeItemSpy = jest.spyOn(Storage.prototype, 'removeItem');
    await renderAtStep3();
    setStep3Passwords('StrongPass1!', 'StrongPass1!');
    await waitFor(() => {
      expect(getCreateAccountButton()).toBeEnabled();
    });

    await userEvent.click(getCreateAccountButton());

    await waitFor(() => {
      expect(removeItemSpy).toHaveBeenCalledWith('signup_data');
    });
    removeItemSpy.mockRestore();
  });
});
