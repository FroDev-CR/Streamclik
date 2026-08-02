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
 * Cuánto tiempo se queda un código en la vista «en vivo».
 *
 * No es lo mismo que `expiresAt`, y la distinción es deliberada: `expiresAt`
 * dice cuándo el código **deja de funcionar en Netflix** (15 minutos), mientras
 * que esta ventana dice cuánto se queda en la tarjeta grande antes de bajar al
 * historial.
 *
 * Fundirlas sería mentir. Con una ventana de 5 minutos aplicada a `expiresAt`,
 * un cliente que vuelve a los seis leería «caducado» sobre un código que aún
 * sirve, pediría otro y generaría un correo de más. Con dos relojes, el código
 * sale de la vista en vivo pero sigue accesible —y con su cuenta atrás real—
 * en el historial de abajo.
 *
 * Cinco minutos porque es el tiempo que pasa entre pedir el código en Netflix y
 * escribirlo. Pasado ese rato, lo que hay en pantalla ya no es «el código que
 * estoy esperando» sino ruido que se puede confundir con el de otro inquilino.
 */
export const LIVE_PIN_WINDOW_SECONDS = 300;

/**
 * Cuántos códigos se muestran a la vez en la vista en vivo.
 *
 * Los perfiles de una cuenta comparten buzón, así que dos inquilinos que piden
 * código con un minuto de diferencia producen dos correos. Antes el segundo
 * **sustituía** al primero en pantalla: quien pidió primero veía el código de
 * otro sin enterarse y lo daba por suyo. Apilarlos, con su hora de llegada, es
 * lo que permite reconocer el propio.
 *
 * Cuatro es el tope porque es el número de perfiles de una cuenta: más códigos
 * simultáneos que inquilinos no es un caso real, es una lista que ya nadie lee.
 */
export const MAX_LIVE_PINS = 4;

/** ¿Sigue el código dentro de la ventana en vivo? */
export function isWithinLiveWindow(
  pin: Pick<VerificationPin, 'receivedAt'>,
  now = new Date(),
): boolean {
  const edad = (now.getTime() - new Date(pin.receivedAt).getTime()) / 1000;
  return edad < LIVE_PIN_WINDOW_SECONDS;
}

/**
 * Códigos que deben verse en vivo: los de la ventana, del más nuevo al más
 * viejo y como mucho `MAX_LIVE_PINS`.
 *
 * Se ordena aquí y no se confía en el orden de entrada porque las llegadas por
 * Realtime pueden desordenarse al reconectar el WebSocket.
 */
export function selectLivePins(
  pins: readonly VerificationPin[],
  now = new Date(),
): VerificationPin[] {
  return pins
    .filter((pin) => isWithinLiveWindow(pin, now))
    .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
    .slice(0, MAX_LIVE_PINS);
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
