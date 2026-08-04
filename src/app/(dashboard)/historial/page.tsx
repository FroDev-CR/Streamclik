import { redirect } from 'next/navigation';

/** Compatibilidad con enlaces antiguos: el historial ahora vive en Suscripciones. */
export default function HistorialPage() {
  redirect('/dashboard#historial-compras');
}
