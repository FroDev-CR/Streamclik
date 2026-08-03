'use client';

import { useUser } from '@clerk/nextjs';
import { useEffect } from 'react';
import { toast } from 'sonner';

/**
 * Aviso de bienvenida tras entrar o registrarse.
 *
 * Clerk no expone un evento de "acabo de iniciar sesión": los componentes
 * `<SignIn>` y `<SignUp>` redirigen y punto. Así que el aviso se decide aquí, al
 * montar el área privada, con dos señales:
 *
 *   · `sessionStorage` marca que ya se saludó. Es de sesión y no de local
 *     storage a propósito: si fuese persistente, alguien que entra a diario no
 *     volvería a ver el saludo nunca; y si no hubiese marca, el aviso saltaría
 *     en cada navegación entre páginas del panel.
 *
 *   · `createdAt` distingue "cuenta creada" de "bienvenido de vuelta". Un
 *     usuario creado hace menos de dos minutos viene del registro. El umbral es
 *     generoso porque entre confirmar el correo y aterrizar aquí pueden pasar
 *     varios segundos.
 *
 * Se monta en el layout del panel y no en las pantallas de login, porque ahí el
 * componente de Clerk todavía está redirigiendo y el aviso se perdería al
 * desmontarse.
 */

const CLAVE = 'streamclick:saludado';
const MARGEN_REGISTRO_MS = 2 * 60 * 1000;

export function WelcomeToast() {
  const { isLoaded, isSignedIn, user } = useUser();

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return;
    if (sessionStorage.getItem(CLAVE) === user.id) return;

    sessionStorage.setItem(CLAVE, user.id);

    const creadoHace = user.createdAt ? Date.now() - new Date(user.createdAt).getTime() : Infinity;
    const esNuevo = creadoHace < MARGEN_REGISTRO_MS;

    const nombre =
      user.firstName?.trim() ||
      user.username?.trim() ||
      user.primaryEmailAddress?.emailAddress.split('@')[0] ||
      null;

    toast.custom(
      () => (
        <div className="sc-toast">
          {user.imageUrl ? (
            // Imagen de Clerk servida desde su CDN. Se usa <img> y no
            // next/image porque el dominio cambia según la instancia y
            // añadirlo a `remotePatterns` ataría el build a la cuenta actual.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.imageUrl} alt="" className="sc-toast-avatar" />
          ) : (
            <span className="sc-toast-avatar sc-toast-avatar-fallback">
              {(nombre ?? 'S').charAt(0).toUpperCase()}
            </span>
          )}

          <div className="sc-toast-body">
            <p className="sc-toast-title">
              {esNuevo ? '¡Cuenta creada!' : nombre ? `Hola, ${nombre}` : 'Bienvenido de vuelta'}
            </p>
            <p className="sc-toast-text">
              {esNuevo
                ? 'Ya puedes elegir tu perfil y recibir tus códigos.'
                : 'Tus perfiles y códigos te están esperando.'}
            </p>
          </div>
        </div>
      ),
      { duration: 5000 },
    );
  }, [isLoaded, isSignedIn, user]);

  return null;
}
