/**
 * Llave pública de Cloudflare Turnstile. Next la incrusta en el bundle al construir; si
 * falta, el widget no carga y el gateway rechaza el formulario por falta de token.
 */
export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
