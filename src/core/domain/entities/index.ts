/**
 * Entidades del dominio.
 *
 * Se modelan como tipos e interfaces con funciones puras asociadas, no como
 * clases con estado mutable. Motivo concreto de este proyecto: los Server
 * Components de Next serializan lo que devuelven al cliente, y las instancias de
 * clase no cruzan esa frontera (pierden sus métodos). Un objeto plano más
 * funciones puras da el mismo poder expresivo sin ese problema.
 *
 * Las reglas de negocio siguen viviendo aquí, no en la UI: `isPinExpired` o
 * `isAssignmentActive` se usan tanto en el servidor como en el cliente y tienen
 * una única definición.
 */

export type UserRole = 'admin' | 'client';
export type AccountStatus = 'active' | 'suspended' | 'expired';
export type AssignmentStatus = 'active' | 'expired' | 'revoked';
export type PinCodeType = 'household' | 'login' | 'signup' | 'password_reset' | 'unknown';
export type EmailParseStatus = 'parsed' | 'unmatched' | 'failed' | 'ignored';
export type NotificationChannel = 'realtime' | 'whatsapp' | 'telegram' | 'push' | 'email';

// -----------------------------------------------------------------------------

export interface UserProfile {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  role: UserRole;
  telegramChatId: string | null;
  notificationPreferences: Record<NotificationChannel, boolean>;
  createdAt: string;
}

export interface StreamingService {
  id: string;
  slug: string;
  name: string;
  brandColor: string;
  senderDomains: string[];
  pinRegexPatterns: string[];
  pinTtlSeconds: number;
  isActive: boolean;
}

export interface StreamingAccount {
  id: string;
  serviceId: string;
  serviceSlug: string;
  ownerId: string;
  label: string;
  inboxEmail: string;
  loginEmail: string;
  status: AccountStatus;
  maxProfiles: number;
}

export interface AccountProfile {
  id: string;
  accountId: string;
  label: string;
  profilePin: string | null;
  slotIndex: number;
}

export interface ProfileAssignment {
  id: string;
  accountProfileId: string;
  userId: string;
  status: AssignmentStatus;
  startsAt: string;
  expiresAt: string | null;
}

export interface VerificationPin {
  id: string;
  accountId: string;
  code: string;
  codeType: PinCodeType;
  actionUrl: string | null;
  receivedAt: string;
  expiresAt: string;
}

// -----------------------------------------------------------------------------
// Reglas de negocio (funciones puras, sin dependencias)
// -----------------------------------------------------------------------------

/**
 * Un PIN vencido se muestra marcado como tal, nunca se oculta.
 *
 * Es una decisión de producto deliberada: si el usuario ve "sin código" cuando
 * en realidad llegó uno hace 20 minutos, vuelve a solicitarlo y genera otro
 * correo. Mostrar "expirado" le dice exactamente lo que ocurrió.
 */
export function isPinExpired(pin: Pick<VerificationPin, 'expiresAt'>, now = new Date()): boolean {
  return new Date(pin.expiresAt).getTime() <= now.getTime();
}

export function secondsUntilExpiry(
  pin: Pick<VerificationPin, 'expiresAt'>,
  now = new Date(),
): number {
  const diff = new Date(pin.expiresAt).getTime() - now.getTime();
  return Math.max(0, Math.floor(diff / 1000));
}

/**
 * Vigencia real de una asignación.
 *
 * Comprueba las fechas además del status porque el barrido de caducidad
 * (`expire_due_assignments`) corre de forma periódica: entre el vencimiento real
 * y la ejecución del cron existe una ventana en la que el status sigue siendo
 * 'active'. La misma comprobación está replicada en `has_account_access()` en
 * SQL, que es la que de verdad protege el acceso.
 */
export function isAssignmentActive(
  assignment: Pick<ProfileAssignment, 'status' | 'startsAt' | 'expiresAt'>,
  now = new Date(),
): boolean {
  if (assignment.status !== 'active') return false;

  const nowMs = now.getTime();
  if (new Date(assignment.startsAt).getTime() > nowMs) return false;
  if (assignment.expiresAt && new Date(assignment.expiresAt).getTime() <= nowMs) return false;

  return true;
}

/** Etiquetas en español para el tipo de código, mostradas junto al PIN. */
export const PIN_TYPE_LABELS: Record<PinCodeType, string> = {
  household: 'Verificación de hogar',
  login: 'Inicio de sesión',
  signup: 'Registro',
  password_reset: 'Restablecer contraseña',
  unknown: 'Código de verificación',
};
