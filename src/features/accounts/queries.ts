import 'server-only';

import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import { tryDecrypt } from '@/infrastructure/crypto/credential-cipher';
import type { AssignmentStatus } from '@/core/domain/entities';
import type { CodeProvider } from '@/infrastructure/supabase/database.types';

/**
 * Consultas de las cuentas asignadas al usuario.
 *
 * Se lee la vista `v_my_accounts`, declarada con `security_invoker = true`, así
 * que las políticas RLS del usuario que consulta siguen aplicando. Esa opción es
 * obligatoria y fácil de olvidar: una vista normal corre con los permisos de su
 * creador y devolvería las filas de todos los clientes.
 *
 * Consecuencia práctica: esta misma función sirve al cliente (ve sus
 * asignaciones) y al administrador (ve todas), sin ninguna rama condicional.
 */

export interface AssignedAccount {
  accountId: string;
  accountLabel: string;
  serviceSlug: string;
  serviceName: string;
  brandColor: string;
  loginEmail: string;
  /** Descifrada. `null` si el descifrado falla (clave rotada, dato corrupto). */
  loginPassword: string | null;
  /**
   * De dónde sale el código de esta cuenta. Decide si la pantalla ofrece el
   * botón de «pedir mi código»: con `propio` el correo llega solo y no hay nada
   * que pedir.
   */
  codeProvider: CodeProvider;
  accountProfileId: string;
  profileLabel: string;
  profilePin: string | null;
  assignmentId: string;
  assignmentStatus: AssignmentStatus;
  expiresAt: string | null;
}

export async function getMyAccounts(userId: string): Promise<AssignedAccount[]> {
  const supabase = await createSupabaseServerClient();

  // El filtro por `user_id` es para el caso del administrador, que por RLS ve
  // todas las filas y aquí quiere ver sólo las suyas. Para un cliente es
  // redundante: RLS ya lo restringe. La seguridad no depende de esta línea.
  const { data, error } = await supabase
    .from('v_my_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('assignment_status', 'active')
    .order('account_label');

  if (error || !data) return [];

  return data.map((row) => ({
    accountId: row.account_id,
    accountLabel: row.account_label,
    serviceSlug: row.service_slug,
    serviceName: row.service_name,
    brandColor: row.brand_color,
    loginEmail: row.login_email,
    // El descifrado ocurre en el servidor. Nunca se envía la credencial cifrada
    // al navegador: no aportaría nada y ampliaría la superficie de exposición.
    loginPassword: tryDecrypt(row.login_password_enc),
    codeProvider: row.code_provider,
    accountProfileId: row.account_profile_id,
    profileLabel: row.profile_label,
    profilePin: row.profile_pin,
    assignmentId: row.assignment_id,
    assignmentStatus: row.assignment_status,
    expiresAt: row.expires_at,
  }));
}

export async function getAccountForUser(
  userId: string,
  accountId: string,
): Promise<AssignedAccount | null> {
  const accounts = await getMyAccounts(userId);
  return accounts.find((account) => account.accountId === accountId) ?? null;
}
