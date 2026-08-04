import { describe, expect, it } from 'vitest';

import { renderDeliveryEmail } from '../src/infrastructure/email/delivery-email-template';

describe('correo de entrega', () => {
  it('incluye los datos exactos de todos los perfiles y el enlace al panel', () => {
    const email = renderDeliveryEmail({
      customerName: 'Ana',
      dashboardUrl: 'https://streamclick.xyz/dashboard',
      accounts: [
        {
          serviceName: 'Netflix',
          loginEmail: 'cuenta@example.com',
          loginPassword: 'secreto-123',
          profileLabel: 'Perfil 2',
          profilePin: '4455',
          expiresAt: '2026-09-04T06:00:00.000Z',
        },
        {
          serviceName: 'Disney+',
          loginEmail: 'disney@example.com',
          loginPassword: 'otro-secreto',
          profileLabel: 'Frodo',
          profilePin: null,
          expiresAt: null,
        },
      ],
    });

    expect(email.subject).toBe('Tu compra de StreamClick ya está lista');
    expect(email.html).toContain('cuenta@example.com');
    expect(email.html).toContain('secreto-123');
    expect(email.html).toContain('Perfil 2');
    expect(email.html).toContain('4455');
    expect(email.html).toContain('Disney+');
    expect(email.html).toContain('Sin PIN');
    expect(email.html).toContain('https://streamclick.xyz/dashboard');
    expect(email.text).toContain('Contraseña: otro-secreto');
  });

  it('escapa nombres y credenciales antes de insertarlos en HTML', () => {
    const email = renderDeliveryEmail({
      customerName: '<script>alert(1)</script>',
      dashboardUrl: 'https://streamclick.xyz/dashboard?from=email&ready=1',
      accounts: [
        {
          serviceName: '<Netflix>',
          loginEmail: 'test@example.com',
          loginPassword: '"<&',
          profileLabel: "Niños'",
          profilePin: null,
          expiresAt: null,
        },
      ],
    });

    expect(email.html).not.toContain('<script>alert(1)</script>');
    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(email.html).toContain('&quot;&lt;&amp;');
    expect(email.html).toContain('Niños&#039;');
    expect(email.html).toContain('from=email&amp;ready=1');
  });
});
