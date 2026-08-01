'use client';

import { useState } from 'react';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Credenciales de acceso al servicio de streaming.
 *
 * Ocultas por defecto y reveladas con una acción explícita. No es teatro de
 * seguridad: la aplicación se consulta a menudo desde el móvil en sitios
 * públicos, y una contraseña de una cuenta real de Netflix visible de forma
 * permanente en pantalla es un riesgo concreto de mirada por encima del hombro.
 *
 * Client Component por el estado de visibilidad y el portapapeles.
 */

interface CredentialsPanelProps {
  loginEmail: string;
  loginPassword: string | null;
  profileLabel: string;
  profilePin: string | null;
}

function CopyableField({
  label,
  value,
  masked = false,
}: {
  label: string;
  value: string;
  masked?: boolean;
}) {
  const [revealed, setRevealed] = useState(!masked);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sin portapapeles (contexto no seguro o permiso denegado) el usuario
      // puede revelar el valor y seleccionarlo a mano.
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs text-[var(--color-content-subtle)]">{label}</span>
        <span className="truncate font-mono text-sm text-[var(--color-content)]">
          {revealed ? value : '•'.repeat(Math.min(value.length, 12))}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {masked && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRevealed((current) => !current)}
            aria-label={revealed ? `Ocultar ${label}` : `Mostrar ${label}`}
          >
            {revealed ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={copy} aria-label={`Copiar ${label}`}>
          {copied ? (
            <Check aria-hidden className="size-4 text-[var(--color-success)]" />
          ) : (
            <Copy aria-hidden className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

export function CredentialsPanel({
  loginEmail,
  loginPassword,
  profileLabel,
  profilePin,
}: CredentialsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos de acceso</CardTitle>
      </CardHeader>

      <CardContent className="divide-y divide-[var(--color-border)]">
        <CopyableField label="Correo de la cuenta" value={loginEmail} />

        {loginPassword ? (
          <CopyableField label="Contraseña" value={loginPassword} masked />
        ) : (
          // Un fallo de descifrado no debe tumbar el resto de la pantalla: el
          // correo y el perfil siguen siendo útiles mientras se resuelve.
          <p className="py-2.5 text-xs text-[var(--color-warning)]">
            No se pudo mostrar la contraseña. Contacta con soporte.
          </p>
        )}

        <div className="flex items-center justify-between gap-3 py-2.5">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-[var(--color-content-subtle)]">Tu perfil</span>
            <span className="text-sm text-[var(--color-content)]">{profileLabel}</span>
          </div>
        </div>

        {profilePin && <CopyableField label="PIN del perfil" value={profilePin} masked />}
      </CardContent>
    </Card>
  );
}
