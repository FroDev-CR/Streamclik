'use client';

import { useState, useTransition } from 'react';
import { MailSearch } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';

import { pedirCodigoAction, type ResultadoCodigo } from '../actions';

/**
 * Botón para pedirle el código al proveedor.
 *
 * Sólo aparece en las cuentas cuyo buzón es de un tercero. En las de buzón
 * propio el correo llega solo y un botón aquí sería un adorno que invita a
 * pulsarlo sin efecto.
 *
 * El código no se muestra desde aquí: entra por Realtime y lo pinta
 * `<LivePinCard/>`, igual que un código de Netflix. Así hay un único sitio donde
 * mirar y no dos que puedan discrepar.
 *
 * Cada mensaje está redactado para que diga **qué hacer a continuación**, que es
 * lo único que le interesa a quien está esperando para entrar a ver algo.
 */

const MENSAJES: Record<ResultadoCodigo['estado'], (r: ResultadoCodigo) => string> = {
  entregado: (r) =>
    r.estado === 'entregado' && r.codigos > 0
      ? 'Listo, tu código está abajo.'
      : 'Ese código ya estaba en pantalla.',
  'sin-correo': () => 'Todavía no llegó ningún código. Esperá unos segundos y volvé a pedirlo.',
  'ya-leido': () =>
    'Ese código ya se usó una vez. Pedí uno nuevo desde Disney+ y volvé a tocar el botón.',
  espera: (r) => (r.estado === 'espera' ? `Esperá ${r.segundos} segundos antes de volver a pedirlo.` : ''),
  error: (r) => (r.estado === 'error' ? r.mensaje : 'No se pudo pedir el código.'),
};

export function RequestCodeButton({ accountId }: { accountId: string }) {
  const [pendiente, startTransition] = useTransition();
  const [ultimo, setUltimo] = useState<ResultadoCodigo['estado'] | null>(null);

  function pedir() {
    startTransition(async () => {
      const resultado = await pedirCodigoAction(accountId);
      setUltimo(resultado.estado);

      const mensaje = MENSAJES[resultado.estado](resultado);

      if (resultado.estado === 'entregado') toast.success(mensaje);
      else if (resultado.estado === 'error') toast.error(mensaje);
      else toast(mensaje);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={pedir} disabled={pendiente} className="w-full sm:w-auto">
        <MailSearch aria-hidden className="size-4" />
        {pendiente ? 'Pidiendo tu código…' : 'Pedir mi código'}
      </Button>

      <p className="text-xs text-[var(--color-content-subtle)]">
        {ultimo === 'ya-leido'
          ? 'Cada código se entrega una sola vez. Pedí uno nuevo desde Disney+ antes de volver a intentarlo.'
          : 'Pedí el código justo después de solicitarlo en Disney+. Aparece aquí abajo en unos segundos.'}
      </p>
    </div>
  );
}
