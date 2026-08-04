import 'server-only';

import { tryDecrypt } from '@/infrastructure/crypto/credential-cipher';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import { getServerEnv } from '@/lib/env';
import { logger } from '@/lib/logger';

import { renderDeliveryEmail, type DeliveredAccountEmail } from './delivery-email-template';

export type DeliveryEmailResult =
  | { status: 'sent'; recipient: string; emailId: string | null }
  | { status: 'not_configured'; message: string }
  | { status: 'failed'; message: string };

type ResendResponse = { id?: string; message?: string; name?: string };

/**
 * Envía únicamente las asignaciones pertenecientes al pedido indicado.
 *
 * No se usa `getMyAccounts()` porque devolvería también compras anteriores del
 * cliente. `order_assignments` es la lista exacta creada por `soltar_cuenta()`.
 */
export async function sendOrderDeliveryEmail(orderId: string): Promise<DeliveryEmailResult> {
  const env = getServerEnv();

  if (!env.RESEND_API_KEY) {
    return {
      status: 'not_configured',
      message: 'falta agregar RESEND_API_KEY en Vercel',
    };
  }

  const supabase = await createSupabaseServerClient();

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('user_id')
    .eq('id', orderId)
    .maybeSingle();

  if (orderError || !order) {
    logger.error('No se pudo preparar el correo de entrega: pedido ausente', {
      orderId,
      error: orderError?.message,
    });
    return { status: 'failed', message: 'no se pudo leer el pedido entregado' };
  }

  const [{ data: customer, error: customerError }, { data: links, error: linksError }] =
    await Promise.all([
      supabase
        .from('user_profiles')
        .select('email, full_name')
        .eq('id', order.user_id)
        .maybeSingle(),
      supabase.from('order_assignments').select('assignment_id').eq('order_id', orderId),
    ]);

  if (customerError || !customer?.email) {
    logger.error('No se pudo preparar el correo de entrega: cliente sin correo', {
      orderId,
      error: customerError?.message,
    });
    return {
      status: 'failed',
      message: 'el cliente no tiene un correo válido',
    };
  }

  if (linksError || !links?.length) {
    logger.error('No se pudo preparar el correo de entrega: sin asignaciones', {
      orderId,
      error: linksError?.message,
    });
    return {
      status: 'failed',
      message: 'el pedido no tiene perfiles asignados',
    };
  }

  const assignmentIds = links.map((link) => link.assignment_id);
  const { data: rows, error: accountsError } = await supabase
    .from('v_my_accounts')
    .select(
      'assignment_id, user_id, service_name, login_email, login_password_enc, profile_label, profile_pin, expires_at',
    )
    .eq('user_id', order.user_id)
    .in('assignment_id', assignmentIds)
    .order('service_name');

  if (accountsError || !rows || rows.length !== assignmentIds.length) {
    logger.error('No se pudieron leer todos los perfiles para el correo de entrega', {
      orderId,
      expected: assignmentIds.length,
      received: rows?.length ?? 0,
      error: accountsError?.message,
    });
    return {
      status: 'failed',
      message: 'no se pudieron leer todos los perfiles entregados',
    };
  }

  const accounts: DeliveredAccountEmail[] = [];

  for (const row of rows) {
    const password = tryDecrypt(row.login_password_enc);
    if (!password) {
      logger.error('No se pudo descifrar una credencial para el correo de entrega', {
        orderId,
        assignmentId: row.assignment_id,
      });
      return {
        status: 'failed',
        message: 'una contraseña no se pudo descifrar',
      };
    }

    accounts.push({
      serviceName: row.service_name,
      loginEmail: row.login_email,
      loginPassword: password,
      profileLabel: row.profile_label,
      profilePin: row.profile_pin,
      expiresAt: row.expires_at,
    });
  }

  const dashboardUrl = new URL('/dashboard', env.NEXT_PUBLIC_SITE_URL).toString();
  const email = renderDeliveryEmail({
    customerName: customer.full_name,
    accounts,
    dashboardUrl,
  });

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `streamclick-order-delivered/${orderId}`,
      },
      body: JSON.stringify({
        from: `StreamClick <${env.RESEND_FROM_EMAIL}>`,
        to: [customer.email],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const payload = (await response.json().catch(() => ({}))) as ResendResponse;

    if (!response.ok) {
      logger.error('Resend rechazó el correo de entrega', {
        orderId,
        status: response.status,
        providerError: payload.name ?? payload.message ?? 'sin detalle',
      });
      return {
        status: 'failed',
        message: `Resend rechazó el envío (HTTP ${response.status})`,
      };
    }

    logger.info('Correo de entrega enviado', {
      orderId,
      emailId: payload.id ?? null,
      accountCount: accounts.length,
    });

    return {
      status: 'sent',
      recipient: customer.email,
      emailId: payload.id ?? null,
    };
  } catch (error) {
    logger.error('Falló la conexión con Resend', {
      orderId,
      error: error instanceof Error ? error.message : 'error desconocido',
    });
    return { status: 'failed', message: 'no hubo conexión con Resend' };
  }
}
