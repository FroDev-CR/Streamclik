import type { Metadata } from 'next';
import { Bell, Mail, MessageCircle, Smartphone } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireUser } from '@/features/auth/session';
import { SettingsForm } from '@/features/settings/components/settings-form';

export const metadata: Metadata = { title: 'Configuración' };

/** Canales de aviso, con su estado real de implementación. */
const CANALES = [
  {
    icono: Bell,
    nombre: 'En la web',
    descripcion: 'El código aparece solo en tus suscripciones, sin recargar.',
    activo: true,
  },
  {
    icono: MessageCircle,
    nombre: 'WhatsApp',
    descripcion: 'Te llegará el código al teléfono que registres arriba.',
    activo: false,
  },
  {
    icono: Smartphone,
    nombre: 'Notificaciones push',
    descripcion: 'Aviso en el móvil aunque tengas la pantalla bloqueada.',
    activo: false,
  },
  {
    icono: Mail,
    nombre: 'Telegram',
    descripcion: 'Para quien prefiera recibirlo por ahí.',
    activo: false,
  },
] as const;

/**
 * Configuración de la cuenta del cliente.
 *
 * Los canales que aún no funcionan se muestran marcados como «Próximamente» en
 * lugar de ofrecerse como interruptores que no hacen nada. Un ajuste que se
 * guarda y no surte efecto es peor que no ofrecerlo: el cliente deja de mirar la
 * web esperando un WhatsApp que nunca llega.
 */
export default async function ConfiguracionPage() {
  const user = await requireUser('/configuracion');

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-black uppercase leading-[0.9] tracking-[-0.045em] sm:text-5xl">
          Configuración
        </h1>
        <p className="mt-3 text-sm text-[var(--color-content-muted)]">
          Tus datos y cómo quieres recibir los códigos.
        </p>
      </header>

      <SettingsForm fullName={user.profile.fullName} phone={user.profile.phone} />

      <Card>
        <CardHeader>
          <CardTitle>Cómo recibes los códigos</CardTitle>
        </CardHeader>

        <CardContent>
          <ul className="divide-y-2 divide-[var(--color-border)]">
            {CANALES.map((canal) => {
              const Icono = canal.icono;

              return (
                <li key={canal.nombre} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <Icono aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} />

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{canal.nombre}</p>
                    <p className="text-xs text-[var(--color-content-muted)]">{canal.descripcion}</p>
                  </div>

                  <Badge tone={canal.activo ? 'success' : 'neutral'}>
                    {canal.activo ? 'Activo' : 'Próximamente'}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tu cuenta</CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col gap-1">
          <span className="text-[0.68rem] font-semibold uppercase tracking-wide text-[var(--color-content-subtle)]">
            Correo de acceso
          </span>
          <span className="font-mono text-sm">{user.email}</span>
          <p className="mt-3 text-xs text-[var(--color-content-muted)]">
            Para cambiar tu correo o tu contraseña, escríbenos y lo gestionamos contigo.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
