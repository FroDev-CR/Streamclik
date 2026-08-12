'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';

import { sendOrderDeliveryEmail } from '@/infrastructure/email/resend-delivery-email';
import { notificarAdminsDePago } from '@/infrastructure/notifications/admin-push';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import { requireAdmin, requireUser } from '@/features/auth/session';
import type { ActionState } from '@/features/shared/action-state';
import { toFieldErrors } from '@/features/shared/action-state';
import { logger } from '@/lib/logger';

import { formatMoney } from './presentation';

/**
 * Server Actions del flujo de compra.
 *
 * Las de cliente empiezan por `requireUser()` y las de operador por
 * `requireAdmin()`. Una Server Action es un endpoint POST público: que sólo se
 * invoque desde un componente protegido no la protege.
 *
 * Esa comprobación es la segunda barrera, no la única. Las políticas RLS de
 * `orders` y las de `storage.objects` restringen por sí solas cada fila y cada
 * archivo a su dueño, y `soltar_cuenta()` vuelve a exigir administrador dentro
 * de la propia función.
 */

/** Lo que el bucket acepta. Debe coincidir con `allowed_mime_types` en la migración. */
const TIPOS_ACEPTADOS = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
] as const;

const TAMANO_MAXIMO = 5 * 1024 * 1024;

const EXTENSIONES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

/**
 * Valida el archivo antes de subirlo.
 *
 * Se comprueba aquí además de en el bucket porque el rechazo de Storage llega
 * como un error genérico de la API: el cliente vería «no se pudo subir» sin
 * saber que su captura pesa 12 MB. El límite del bucket sigue siendo la garantía
 * real, esto es sólo el mensaje decente.
 */
function validarComprobante(archivo: unknown): { file: File } | { error: string } {
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: 'Adjunta la captura del comprobante' };
  }

  if (archivo.size > TAMANO_MAXIMO) {
    return { error: 'El archivo no puede superar los 5 MB' };
  }

  if (!TIPOS_ACEPTADOS.includes(archivo.type as (typeof TIPOS_ACEPTADOS)[number])) {
    return { error: 'Sube una imagen (JPG, PNG, WEBP o HEIC) o un PDF' };
  }

  return { file: archivo };
}

/**
 * Sube el comprobante y devuelve su ruta dentro del bucket.
 *
 * La primera carpeta es el uuid interno del cliente: es lo que comprueba la
 * política de `storage.objects`, así que la ruta no es cosmética sino parte de
 * la autorización. El identificador del pedido va después para que reemplazar un
 * comprobante equivocado sobrescriba el anterior en vez de acumular basura.
 */
async function subirComprobante(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  orderId: string,
  file: File,
): Promise<{ path: string } | { error: string }> {
  const extension = EXTENSIONES[file.type] ?? 'bin';
  const path = `${userId}/${orderId}.${extension}`;

  const { error } = await supabase.storage.from('comprobantes').upload(path, file, {
    contentType: file.type,
    upsert: true,
  });

  if (error) {
    logger.error('No se pudo subir el comprobante', {
      error: error.message,
      orderId,
    });
    return { error: 'No se pudo subir el comprobante. Inténtalo de nuevo.' };
  }

  return { path };
}

/**
 * Avisa al operador de que hay un comprobante esperando.
 *
 * Se llama después de que el pedido quede en `esperando_revision`, que es el
 * único momento en que el cliente pasa a estar bloqueado esperando a una
 * persona. Nunca propaga un fallo: la compra ya está guardada y el cliente no
 * tiene nada que arreglar si el aviso no sale.
 */
async function avisarDePagoPendiente(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  orderId: string,
): Promise<void> {
  try {
    // Se lee con el cliente del usuario: RLS le deja ver su propio pedido, que
    // es justo el que acaba de crear.
    const { data } = await supabase
      .from('orders')
      .select('price_amount, price_currency, user_profiles!orders_user_id_fkey ( email, full_name )')
      .eq('id', orderId)
      .maybeSingle();

    const fila = data as unknown as {
      price_amount: number;
      price_currency: string;
      user_profiles: { email: string; full_name: string | null } | null;
    } | null;

    const quien = fila?.user_profiles?.full_name ?? fila?.user_profiles?.email ?? 'Un cliente';
    const importe = fila
      ? formatMoney(Number(fila.price_amount), fila.price_currency)
      : 'un pedido';

    await notificarAdminsDePago({
      titulo: 'Nuevo pago por revisar',
      cuerpo: `${quien} envió su comprobante de ${importe}. Míralo y suéltale la cuenta.`,
      url: '/admin/pagos',
    });
  } catch (error) {
    logger.warn('No se pudo avisar del pago pendiente', {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// -----------------------------------------------------------------------------
// Cliente
// -----------------------------------------------------------------------------

const pedidoSchema = z.object({
  productId: z.string().uuid('Selecciona un producto válido'),
  productType: z.enum(['service', 'combo']),
  note: z
    .string()
    .trim()
    .max(280, 'La nota no puede superar los 280 caracteres')
    .optional()
    .transform((v) => (v ? v : null)),
  referralCode: z
    .string()
    .trim()
    .max(20, 'El código de invitación no es válido')
    .optional()
    .transform((value) => (value ? value.toUpperCase() : null)),
});

const carritoSchema = z.object({
  items: z
    .array(
      z.object({
        productType: z.enum(['service', 'combo']),
        slug: z.string().trim().toLowerCase().min(1).max(80),
        quantity: z.coerce.number().int().min(1).max(10),
      }),
    )
    .min(1, 'El carrito está vacío')
    .max(20, 'El carrito tiene demasiados productos'),
  note: z
    .string()
    .trim()
    .max(280, 'La nota no puede superar los 280 caracteres')
    .optional()
    .transform((value) => value || null),
  referralCode: z
    .string()
    .trim()
    .max(20, 'El código de invitación no es válido')
    .optional()
    .transform((value) => (value ? value.toUpperCase() : null)),
});

function parseCartJson(value: FormDataEntryValue | null): unknown {
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Crear pedido y adjuntar el comprobante.
 *
 * El precio se copia del servicio **en el servidor**, nunca del formulario: si
 * viniera del cliente, cualquiera podría comprar por un colón editando el HTML.
 *
 * El pedido se inserta antes de subir el archivo porque la ruta del comprobante
 * lo incluye. Si la subida falla, queda un pedido en `esperando_comprobante` que
 * el cliente puede reintentar desde su historial: es preferible a perder la
 * compra entera por un fallo de red al subir una foto.
 */
export async function crearPedidoAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser('/dashboard');

  const parsed = pedidoSchema.safeParse({
    productId: formData.get('productId'),
    productType: formData.get('productType'),
    note: formData.get('note'),
    referralCode: formData.get('referralCode'),
  });

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const comprobante = validarComprobante(formData.get('receipt'));
  if ('error' in comprobante) {
    return { fieldErrors: { receipt: comprobante.error } };
  }

  const supabase = await createSupabaseServerClient();

  let referrerUserId: string | null = null;
  let referralCodeUsed: string | null = null;

  if (parsed.data.referralCode) {
    const { data: referralData, error: referralError } = await supabase.rpc(
      'resolve_referral_code',
      { p_code: parsed.data.referralCode },
    );

    if (referralError) {
      logger.error('No se pudo validar el código de invitación', {
        error: referralError.message,
      });
      return { error: 'No pudimos validar el código. Inténtalo de nuevo.' };
    }

    const referral = (referralData ?? {}) as {
      status?: string;
      user_id?: string;
      code?: string;
    };

    if (referral.status === 'codigo_propio') {
      return {
        fieldErrors: {
          referralCode: 'No puedes usar tu propio código de invitación.',
        },
      };
    }

    if (referral.status !== 'valido' || !referral.user_id || !referral.code) {
      return {
        fieldErrors: { referralCode: 'Ese código de invitación no existe.' },
      };
    }

    referrerUserId = referral.user_id;
    referralCodeUsed = referral.code;
  }

  const producto =
    parsed.data.productType === 'combo'
      ? await supabase
          .from('streaming_combos')
          .select('id, price_amount, price_currency')
          .eq('id', parsed.data.productId)
          .eq('is_active', true)
          .maybeSingle()
      : await supabase
          .from('streaming_services')
          .select('id, price_amount, price_currency')
          .eq('id', parsed.data.productId)
          .eq('is_active', true)
          .maybeSingle();

  if (producto.error || !producto.data) {
    return { error: 'Ese producto ya no está disponible' };
  }

  const { data: pedido, error: errorPedido } = await supabase
    .from('orders')
    .insert({
      user_id: user.id,
      service_id: parsed.data.productType === 'service' ? producto.data.id : null,
      combo_id: parsed.data.productType === 'combo' ? producto.data.id : null,
      price_amount: producto.data.price_amount,
      price_currency: producto.data.price_currency,
      receipt_note: parsed.data.note,
      referrer_user_id: referrerUserId,
      referral_code_used: referralCodeUsed,
    })
    .select('id')
    .single();

  if (errorPedido || !pedido) {
    logger.error('No se pudo crear el pedido', { error: errorPedido?.message });
    return { error: 'No se pudo registrar tu pedido. Inténtalo de nuevo.' };
  }

  const subida = await subirComprobante(supabase, user.id, pedido.id, comprobante.file);
  if ('error' in subida) {
    return { error: subida.error };
  }

  const { error: errorEstado } = await supabase
    .from('orders')
    .update({
      receipt_path: subida.path,
      status: 'esperando_revision',
      submitted_at: new Date().toISOString(),
    })
    .eq('id', pedido.id);

  if (errorEstado) {
    logger.error('El comprobante se subió pero el pedido no pasó a revisión', {
      error: errorEstado.message,
      orderId: pedido.id,
    });
    return {
      error: 'Subimos el comprobante pero no pudimos enviarlo a revisión.',
    };
  }

  await avisarDePagoPendiente(supabase, pedido.id);

  revalidatePath('/perfil');
  revalidatePath('/admin/pagos');

  // Fuera de cualquier try: `redirect()` lanza NEXT_REDIRECT por diseño y un
  // catch lo tragaría, dejando el formulario sin navegar y sin error visible.
  redirect('/perfil#historial-compras');
}

/** Crea un único pedido de carrito y adjunta el comprobante del monto total. */
export async function crearPedidoCarritoAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser('/carrito');

  const parsed = carritoSchema.safeParse({
    items: parseCartJson(formData.get('cart')),
    note: formData.get('note'),
    referralCode: formData.get('referralCode'),
  });

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const comprobante = validarComprobante(formData.get('receipt'));
  if ('error' in comprobante) {
    return { fieldErrors: { receipt: comprobante.error } };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('crear_pedido_carrito', {
    p_items: parsed.data.items,
    p_note: parsed.data.note,
    p_referral_code: parsed.data.referralCode,
  });

  if (error) {
    logger.error('No se pudo crear el pedido del carrito', { error: error.message });
    return { error: 'No se pudo registrar el carrito. Inténtalo de nuevo.' };
  }

  const result = (data ?? {}) as { status?: string; order_id?: string; slug?: string };
  if (result.status === 'codigo_propio') {
    return { fieldErrors: { referralCode: 'No puedes usar tu propio código de invitación.' } };
  }
  if (result.status === 'codigo_invalido') {
    return { fieldErrors: { referralCode: 'Ese código de invitación no existe.' } };
  }
  if (result.status === 'producto_no_disponible') {
    return { error: `«${result.slug ?? 'Un producto'}» ya no está disponible. Actualiza el carrito.` };
  }
  if (result.status !== 'creado' || !result.order_id) {
    return { error: 'El carrito no es válido o sus productos usan monedas incompatibles.' };
  }

  const upload = await subirComprobante(supabase, user.id, result.order_id, comprobante.file);
  if ('error' in upload) return { error: upload.error };

  const { error: stateError } = await supabase
    .from('orders')
    .update({
      receipt_path: upload.path,
      status: 'esperando_revision',
      submitted_at: new Date().toISOString(),
    })
    .eq('id', result.order_id);

  if (stateError) {
    logger.error('El carrito se creó pero no pasó a revisión', {
      orderId: result.order_id,
      error: stateError.message,
    });
    return { error: 'Subimos el comprobante, pero no pudimos enviarlo a revisión.' };
  }

  await avisarDePagoPendiente(supabase, result.order_id);

  revalidatePath('/perfil');
  revalidatePath('/admin/pagos');

  // El cliente limpia localStorage y navega al historial al recibir este estado.
  return { success: 'Pedido enviado. Estamos comprobando tu pago.' };
}

/**
 * Adjuntar o reemplazar el comprobante de un pedido ya creado.
 *
 * Existe para dos casos reales: la subida falló al crear el pedido, o el cliente
 * mandó la captura equivocada. La política de `orders` sólo lo permite mientras
 * el pedido no esté revisado.
 */
export async function subirComprobanteAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser('/perfil#historial-compras');

  const orderId = z.string().uuid().safeParse(formData.get('orderId'));
  if (!orderId.success) {
    return { error: 'Pedido no válido' };
  }

  const comprobante = validarComprobante(formData.get('receipt'));
  if ('error' in comprobante) {
    return { fieldErrors: { receipt: comprobante.error } };
  }

  const supabase = await createSupabaseServerClient();

  const subida = await subirComprobante(supabase, user.id, orderId.data, comprobante.file);
  if ('error' in subida) {
    return { error: subida.error };
  }

  // Sin `.eq('user_id')`: RLS ya restringe la fila al dueño y añadirlo aquí
  // duplicaría la regla en dos sitios que pueden divergir.
  const { error } = await supabase
    .from('orders')
    .update({
      receipt_path: subida.path,
      status: 'esperando_revision',
      submitted_at: new Date().toISOString(),
    })
    .eq('id', orderId.data);

  if (error) {
    logger.error('No se pudo adjuntar el comprobante', {
      error: error.message,
    });
    return { error: 'No se pudo enviar el comprobante a revisión.' };
  }

  await avisarDePagoPendiente(supabase, orderId.data);

  revalidatePath('/perfil');
  revalidatePath('/admin/pagos');

  return {
    success: 'Comprobante enviado. Lo revisamos y te soltamos la cuenta.',
  };
}

/** El cliente desiste de un pedido que aún nadie ha revisado. */
export async function cancelarPedidoAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser('/perfil#historial-compras');

  const orderId = z.string().uuid().safeParse(formData.get('orderId'));
  if (!orderId.success) {
    return { error: 'Pedido no válido' };
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from('orders')
    .update({ status: 'cancelado' })
    .eq('id', orderId.data);

  if (error) {
    logger.error('No se pudo cancelar el pedido', { error: error.message });
    return { error: 'No se pudo cancelar el pedido.' };
  }

  revalidatePath('/perfil');
  revalidatePath('/admin/pagos');

  return { success: 'Pedido cancelado' };
}

// -----------------------------------------------------------------------------
// Operador
// -----------------------------------------------------------------------------

const soltarSchema = z.object({
  orderId: z.string().uuid(),
  // Llega del `<input type="date">`, siempre como cadena y a veces vacía.
  expiresAt: z
    .string()
    .optional()
    .transform((v) => (v ? new Date(v).toISOString() : null)),
});

/**
 * Soltar la cuenta: aprobar el pago y entregar un perfil libre.
 *
 * Toda la lógica vive en la función `soltar_cuenta()`, que elige perfil, crea la
 * asignación, marca el pedido y deja rastro en auditoría **en una sola
 * transacción**. Hacerlo desde aquí con tres llamadas dejaría abierta la carrera
 * de dos aprobaciones simultáneas —o de un doble clic— quedándose con el mismo
 * perfil libre.
 */
export async function soltarCuentaAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = soltarSchema.safeParse({
    orderId: formData.get('orderId'),
    expiresAt: formData.get('expiresAt'),
  });

  if (!parsed.success) {
    return { error: 'Pedido no válido' };
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc('soltar_cuenta', {
    p_order_id: parsed.data.orderId,
    p_expires_at: parsed.data.expiresAt,
  });

  if (error) {
    logger.error('Falló al soltar la cuenta', { error: error.message });
    return { error: 'No se pudo soltar la cuenta. Inténtalo de nuevo.' };
  }

  const resultado = (data ?? {}) as { status?: string };

  revalidatePath('/admin/pagos');
  revalidatePath('/admin');
  revalidatePath('/dashboard');
  revalidatePath('/perfil');
  revalidatePath('/admin/clientes');

  // Cada resultado del RPC se traduce a un mensaje concreto. «Sin cupos» no es
  // un error del operador ni del comprobante: es inventario que falta, y decirlo
  // así es lo que le indica qué hacer a continuación.
  switch (resultado.status) {
    case 'entregado':
    case 'ya_entregado': {
      // El correo es un efecto posterior a la transacción: si Resend falla, la
      // asignación no se revierte ni se entrega dos veces. Un segundo clic cae
      // en `ya_entregado` y reintenta sólo la notificación; la clave idempotente
      // de Resend evita duplicados si la primera respuesta se perdió.
      const email = await sendOrderDeliveryEmail(parsed.data.orderId);

      if (email.status === 'sent') {
        return {
          success:
            resultado.status === 'entregado'
              ? `Compra entregada y datos enviados a ${email.recipient}.`
              : `El pedido ya estaba entregado. Datos enviados a ${email.recipient}.`,
        };
      }

      return {
        error: `La compra sí quedó entregada, pero el correo quedó pendiente: ${email.message}. Corrige la configuración y vuelve a pulsar «Soltar compra» para reintentarlo.`,
      };
    }
    case 'sin_cupos':
      return {
        error: 'Falta al menos un perfil para completar la compra. Añade inventario al banco.',
      };
    case 'no_encontrado':
      return { error: 'Ese pedido ya no existe.' };
    default:
      return { error: 'Respuesta inesperada al soltar la cuenta.' };
  }
}

const rechazarSchema = z.object({
  orderId: z.string().uuid(),
  note: z
    .string()
    .trim()
    .max(280)
    .optional()
    .transform((v) => (v ? v : null)),
});

/**
 * Rechazar un pago.
 *
 * Es un cambio de estado, no un borrado: el pedido es el registro de que alguien
 * dijo haber pagado, y conviene conservarlo aunque el comprobante no valiera.
 */
export async function rechazarPedidoAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();

  const parsed = rechazarSchema.safeParse({
    orderId: formData.get('orderId'),
    note: formData.get('note'),
  });

  if (!parsed.success) {
    return { error: 'Pedido no válido' };
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from('orders')
    .update({
      status: 'rechazado',
      review_note: parsed.data.note,
      reviewed_at: new Date().toISOString(),
      reviewed_by: admin.id,
    })
    .eq('id', parsed.data.orderId);

  if (error) {
    logger.error('No se pudo rechazar el pedido', { error: error.message });
    return { error: 'No se pudo rechazar el pedido.' };
  }

  revalidatePath('/admin/pagos');
  revalidatePath('/perfil');

  return { success: 'Pedido rechazado' };
}

const datosPagoSchema = z.object({
  sinpeNumber: z.string().trim().max(30, 'El número parece demasiado largo'),
  sinpeName: z.string().trim().max(120, 'El nombre parece demasiado largo'),
  instructions: z.string().trim().max(400, 'Las instrucciones son demasiado largas'),
});

/**
 * Datos de cobro visibles en la pantalla de compra.
 *
 * Viven en la base de datos y no en variables de entorno para que cambiar el
 * número de SINPE sea un formulario y no un redespliegue: el operador trabaja
 * desde el móvil.
 */
export async function guardarDatosPagoAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();

  const parsed = datosPagoSchema.safeParse({
    sinpeNumber: formData.get('sinpeNumber'),
    sinpeName: formData.get('sinpeName'),
    instructions: formData.get('instructions'),
  });

  if (!parsed.success) {
    return { fieldErrors: toFieldErrors(parsed.error.issues) };
  }

  const supabase = await createSupabaseServerClient();

  // `upsert` y no `update`: la fila la crea la migración, pero si alguien la
  // borrara el formulario seguiría funcionando en vez de fallar en silencio con
  // cero filas afectadas.
  const { error } = await supabase.from('payment_settings').upsert({
    id: true,
    sinpe_number: parsed.data.sinpeNumber,
    sinpe_name: parsed.data.sinpeName,
    instructions: parsed.data.instructions,
  });

  if (error) {
    logger.error('No se pudieron guardar los datos de cobro', {
      error: error.message,
    });
    return { error: 'No se pudieron guardar los datos de cobro.' };
  }

  revalidatePath('/admin/pagos');

  return { success: 'Datos de cobro actualizados' };
}
