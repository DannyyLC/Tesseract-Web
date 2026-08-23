// ============================================================
// End Users — Shared types for end user display
// ============================================================

import { PaginatedResponse } from '../../platform/api/api_response';

export interface DashboardEndUserDto {
  id: string;
  phoneNumber: string | null;
  email: string | null;
  externalId: string | null;
  name: string | null;
  avatar: string | null;
  metadata: object | null;
  lastSeenAt: Date | null;
  createdAt: Date;
  /** Con valor, el contacto está bloqueado y sus mensajes se descartan en el webhook. */
  blockedAt: Date | null;
  blockedReason: string | null;
  /** Nombre de quien lo bloqueó. Null si el usuario ya no existe o no se registró. */
  blockedByName: string | null;
}

/** Estado de bloqueo por el que se puede acotar el listado de contactos. */
export type EndUserBlockedFilter = 'all' | 'blocked' | 'active';

/** Filtros y cursor que acepta el listado de contactos */
export interface EndUsersQuery {
  cursor?: string | null;
  action?: 'next' | 'prev' | null;
  pageSize?: number;
  /** Busca en nombre, email, identificador externo y teléfono. */
  search?: string;
  blocked?: EndUserBlockedFilter;
}

export type EndUsersResponse = PaginatedResponse<DashboardEndUserDto>;

export interface BlockEndUserDto {
  /** Opcional a propósito: obligarlo llena la columna de "x" y "spam", que no informan nada. */
  reason?: string;
}

export interface CreateEndUserDto {
  /** Número de WhatsApp del contacto. Se normaliza a solo dígitos, igual que lo entrega el webhook. */
  phoneNumber: string;
  /** Opcional: si no se da, el contacto se muestra por su número hasta que WhatsApp entregue un nombre. */
  name?: string;
}

export interface UpdateEndUserDto {
  /**
   * Solo el nombre es editable: el teléfono, el email y el externalId son la identidad del
   * contacto en su canal — cambiarlos rompería el match con los mensajes que ya le llegaron.
   */
  name: string;
}
