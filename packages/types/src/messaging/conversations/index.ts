export interface MessageMetadata {
  is_hitl_bypass?: boolean;
  original_user_id?: string;
}

/**
 * Los valores del enum `ConversationChannel` de Prisma, replicados aquí.
 *
 * El web-client no importa `@tesseract/database` (arrastraría el cliente de Prisma al
 * bundle del navegador), así que hasta ahora comparaba literales sueltos —
 * `channel === 'WHATSAPP'`— repartidos por la UI. Esta lista es la única copia.
 */
export const CONVERSATION_CHANNELS = [
  'WHATSAPP',
  'MESSENGER',
  'DASHBOARD',
  'WEB',
  'API',
  'CRON',
] as const;

export type ConversationChannelValue = (typeof CONVERSATION_CHANNELS)[number];

/**
 * Cómo se agrupan los canales en el filtro de la lista de conversaciones.
 *
 * Vive junto al enum, y no en el front, para que un test pueda comprobar que la unión de
 * los grupos cubre TODOS los valores: un canal nuevo que nadie meta en un grupo quedaría
 * imposible de filtrar sin que nada avise. `whatsapp` y `messenger` son los canales que
 * el cliente reconoce como suyos; el resto es "por dónde entró el sistema" y no le dice
 * nada, así que van juntos.
 */
export const CHANNEL_FILTER_GROUPS = {
  whatsapp: ['WHATSAPP'],
  messenger: ['MESSENGER'],
  appApi: ['DASHBOARD', 'WEB', 'API', 'CRON'],
} as const satisfies Record<string, readonly ConversationChannelValue[]>;

export type ChannelFilterGroup = keyof typeof CHANNEL_FILTER_GROUPS;

/** `true` si el string es un grupo conocido. Filtra lo que llegue por la URL. */
export function isChannelFilterGroup(value: string): value is ChannelFilterGroup {
  return Object.prototype.hasOwnProperty.call(CHANNEL_FILTER_GROUPS, value);
}

export type MessageAttachmentType = 'IMAGE' | 'AUDIO';
export type MessageAttachmentStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'FAILED'
  | 'UNSUPPORTED';

export interface MessageAttachment {
  id: string;
  type: MessageAttachmentType;
  mimeType: string;
  sourceUrl: string;
  sizeBytes?: number | null;
  sha256?: string | null;
  contentHash?: string | null;
  processingStatus: MessageAttachmentStatus;
  processedText?: string | null;
  processedAt?: Date | null;
  processingError?: string | null;
  processor?: string | null;
  processorVersion?: string | null;
  metadata?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
  metadata?: MessageMetadata;
  attachments?: MessageAttachment[];
}

export interface ConversationDto {
  id: string;
  title?: string;
  messages: Message[];
  workflowId?: string;
}

export interface ConversationDetailDto {
  id: string;
  title: string | null;
  channel: string;
  status: string;
  isHumanInTheLoop: boolean;
  needsFollowUp: boolean;
  followUpReason: string | null;
  /** Telefono del cliente final. Solo en conversaciones de WhatsApp. */
  endUserPhoneNumber: string | null;
  /** Ver `DashboardConversationDto.endUserName`. */
  endUserName: string | null;
  /** Página de Facebook por la que entró. Solo en conversaciones de Messenger. */
  messengerPageName: string | null;
  messageCount: number;
  lastMessageAt: Date | null;
  createdAt: Date;
  closedAt: Date | null;
  workflowId: string;
  userId: string | null;
  endUserId: string | null;
  messages: Message[];
}

export interface DashboardConversationDto {
  id: string;
  title: string | null;
  channel: string;
  status: string; // 'open' | 'closed' | 'snoozed' etc.
  isHumanInTheLoop: boolean;
  needsFollowUp: boolean;
  followUpReason: string | null;
  /** Telefono del cliente final. Solo en conversaciones de WhatsApp. */
  endUserPhoneNumber: string | null;
  /** Número de WhatsApp Business al que llegó el mensaje. Solo en conversaciones de WhatsApp. */
  whatsappBusinessPhoneNumber: string | null;
  /**
   * Nombre del cliente final, cuando el canal permite conocerlo. En Messenger llega del
   * perfil de Facebook y puede ser null: si Meta no lo devuelve, la conversación se crea
   * igual y aquí no hay nada que mostrar.
   */
  endUserName: string | null;
  /** Página de Facebook por la que entró. Solo en conversaciones de Messenger. */
  messengerPageName: string | null;
  /** PSID del remitente en Messenger. Solo en conversaciones de Messenger. */
  messengerSenderId: string | null;
  messageCount: number;
  lastMessageAt: Date | null;
  workflowId: string;
  closedAt: Date | null;
  userId: string | null;
  organizationId: string | null;
  isInternal: boolean;
}

export interface UpdateConversationDto {
  title?: string;
  status?: string;
  isHumanInTheLoop?: boolean;
  needsFollowUp?: boolean;
  followUpReason?: string | null;
}

export interface ConversationsStatsDto {
  totalConversations: number;
  activeConversations: number;
  totalMessagesMonth: number;
}
