'use client';

import { Icon } from '@iconify/react';

interface DynamicIconProps {
  /** Iconify icon identifier, e.g. "mdi:calculator", "logos:google", "simple-icons:openai" */
  name: string;
  size?: number;
  className?: string;
}

/**
 * Renders any Iconify icon by its string identifier.
 * Store only the identifier in the DB, e.g. "mdi:calculator" — NOT the full CDN URL.
 *
 * Useful icon sets:
 *  - logos:       Brand logos in color  (logos:google, logos:slack, logos:github)
 *  - mdi:         Material Design Icons (mdi:calculator, mdi:email)
 *  - simple-icons: Monochrome brands    (simple-icons:openai)
 */
export function DynamicIcon({ name, size = 20, className }: DynamicIconProps) {
  return <Icon icon={name} width={size} height={size} className={className} />;
}
