import { describe, expect, it } from 'vitest';

import {
  deducirServicio,
  mapGoPlayProfiles,
} from '@/infrastructure/providers/goplay/goplay.profiles';

function listado(items: unknown[]) {
  return { success: true, total: items.length, items };
}

const fila = (overrides: Record<string, unknown> = {}) => ({
  id: '69e1f7d0-6baa-49e3-a1e6-fead03e1000e',
  name_type_digital_account: 'DISNEY PREMIUM 1 MES CUENTAS ORIGINAL',
  digital_account: 'Cuenta2276@Proveedor.invalid',
  password: 'clave-de-la-cuenta',
  screen_profile: '1',
  screen_pin: '1234',
  renewal_limit_date: '17-09-2026',
  check_emails: true,
  active: true,
  ...overrides,
});

describe('deducirServicio', () => {
  it('reconoce el servicio pese a las coletillas comerciales', () => {
    // El nombre lleva «1 MES», «PREMIUM», «CUENTAS ORIGINAL»… y cambia con cada
    // promoción. Anclar la comparación al nombre completo la rompería sola.
    expect(deducirServicio('DISNEY PREMIUM 1 MES CUENTAS ORIGINAL')).toBe('disney-plus');
    expect(deducirServicio('NETFLIX 4K 1 PANTALLA')).toBe('netflix');
    expect(deducirServicio('MAX ESTANDAR 1 MES')).toBe('max');
    expect(deducirServicio('PRIME VIDEO 1 MES')).toBe('prime-video');
  });

  it('no adivina cuando no reconoce el producto', () => {
    // Adivinar mal metería una cuenta de Disney en el catálogo de Netflix, y eso
    // no se descubre hasta que un cliente se queda sin su código.
    expect(deducirServicio('COMBO SORPRESA 3 MESES')).toBeNull();
  });
});

describe('mapGoPlayProfiles', () => {
  it('lee una fila del inventario entera', () => {
    const resultado = mapGoPlayProfiles(listado([fila()]));

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;

    const cuenta = resultado.value[0]!;
    expect(cuenta.id).toBe('69e1f7d0-6baa-49e3-a1e6-fead03e1000e');
    expect(cuenta.serviceSlug).toBe('disney-plus');
    expect(cuenta.password).toBe('clave-de-la-cuenta');
    expect(cuenta.admiteConsulta).toBe(true);
  });

  it('normaliza el correo a minúsculas', () => {
    // Es a la vez `inbox_email`, la llave con la que el RPC resuelve la cuenta.
    // Guardarlo con mayúsculas dejaría los códigos sin dueño.
    const resultado = mapGoPlayProfiles(listado([fila()]));
    if (!resultado.ok) throw new Error('se esperaba éxito');

    expect(resultado.value[0]!.correo).toBe('cuenta2276@proveedor.invalid');
  });

  it('descarta las filas sin identificador o sin correo', () => {
    // Sin id no se puede pedir el código; sin correo no se puede resolver la
    // cuenta. Mostrarlas sólo llevaría a un alta rota.
    const resultado = mapGoPlayProfiles(
      listado([fila({ id: null }), fila({ digital_account: '  ' }), fila()]),
    );

    if (!resultado.ok) throw new Error('se esperaba éxito');
    expect(resultado.value).toHaveLength(1);
  });

  it('acepta un identificador numérico', () => {
    // Hoy GoPlay usa UUID, pero el siguiente proveedor puede numerar como quiera.
    const resultado = mapGoPlayProfiles(listado([fila({ id: 2555382 })]));

    if (!resultado.ok) throw new Error('se esperaba éxito');
    expect(resultado.value[0]!.id).toBe('2555382');
  });

  it('falla cuando GoPlay contesta 200 con success:false', () => {
    const resultado = mapGoPlayProfiles({ success: false, msg: 'Token invalido' });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.message).toContain('Token invalido');
  });

  it('marca como no consultables las cuentas sin check_emails', () => {
    const resultado = mapGoPlayProfiles(listado([fila({ check_emails: false })]));

    if (!resultado.ok) throw new Error('se esperaba éxito');
    expect(resultado.value[0]!.admiteConsulta).toBe(false);
  });
});
