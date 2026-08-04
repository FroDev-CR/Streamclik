import { redirect } from 'next/navigation';

/** Compatibilidad con enlaces antiguos: el historial ahora vive en Mi perfil. */
export default function HistorialPage() {
  redirect('/perfil#historial-compras');
}
