export interface DeliveredAccountEmail {
  serviceName: string;
  loginEmail: string;
  loginPassword: string;
  profileLabel: string;
  profilePin: string | null;
  expiresAt: string | null;
}

export interface DeliveryEmailInput {
  customerName: string | null;
  accounts: DeliveredAccountEmail[];
  dashboardUrl: string;
}

export interface RenderedDeliveryEmail {
  subject: string;
  html: string;
  text: string;
}

/** El contenido viene de la base de datos y debe tratarse como no confiable. */
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function expirationLabel(value: string | null): string {
  if (!value) return 'Sin vencimiento definido';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Consulta la vigencia en tu panel';

  return new Intl.DateTimeFormat('es-CR', {
    dateStyle: 'long',
    timeZone: 'America/Costa_Rica',
  }).format(date);
}

function accountHtml(account: DeliveredAccountEmail): string {
  const pin = account.profilePin?.trim() || 'Sin PIN';
  const expires = expirationLabel(account.expiresAt);

  return `
    <div style="margin:0 0 18px;padding:22px;border:3px solid #050505;border-radius:18px;background:#ffffff;box-shadow:6px 6px 0 #050505;">
      <div style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:900;line-height:1;text-transform:uppercase;color:#050505;">
        ${escapeHtml(account.serviceName)}
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-family:Arial,Helvetica,sans-serif;color:#050505;">
        <tr><td style="padding:7px 0;color:#66625a;font-size:12px;font-weight:800;text-transform:uppercase;">Correo de acceso</td></tr>
        <tr><td style="padding:0 0 12px;font-size:17px;font-weight:800;word-break:break-all;">${escapeHtml(account.loginEmail)}</td></tr>
        <tr><td style="padding:7px 0;color:#66625a;font-size:12px;font-weight:800;text-transform:uppercase;">Contraseña</td></tr>
        <tr><td style="padding:0 0 12px;font-family:Consolas,'Courier New',monospace;font-size:17px;font-weight:800;word-break:break-all;">${escapeHtml(account.loginPassword)}</td></tr>
        <tr>
          <td style="padding:14px 0 0;border-top:2px solid #050505;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td width="50%" valign="top" style="padding-right:8px;">
                  <div style="color:#66625a;font-size:11px;font-weight:800;text-transform:uppercase;">Perfil</div>
                  <div style="margin-top:4px;font-size:16px;font-weight:900;">${escapeHtml(account.profileLabel)}</div>
                </td>
                <td width="50%" valign="top" style="padding-left:8px;">
                  <div style="color:#66625a;font-size:11px;font-weight:800;text-transform:uppercase;">PIN del perfil</div>
                  <div style="margin-top:4px;font-family:Consolas,'Courier New',monospace;font-size:18px;font-weight:900;">${escapeHtml(pin)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr><td style="padding:14px 0 0;color:#66625a;font-size:12px;">Vigencia: <strong style="color:#050505;">${escapeHtml(expires)}</strong></td></tr>
      </table>
    </div>`;
}

export function renderDeliveryEmail(input: DeliveryEmailInput): RenderedDeliveryEmail {
  const customerName = input.customerName?.trim();
  const greeting = customerName ? `Hola, ${customerName}` : '¡Hola!';
  const accountCount = input.accounts.length;
  const summary = `${accountCount} ${accountCount === 1 ? 'perfil listo' : 'perfiles listos'}`;

  const html = `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:0;background:#f4f1e8;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1e8;">
      <tr>
        <td align="center" style="padding:28px 14px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;">
            <tr>
              <td style="padding:22px 24px;border:3px solid #050505;border-radius:18px;background:#075dff;box-shadow:7px 7px 0 #050505;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
                <div style="font-size:24px;font-weight:900;">›› <span style="color:#ffd300;">Stream</span>Click</div>
                <div style="margin-top:18px;font-size:38px;font-weight:900;line-height:.95;text-transform:uppercase;">Tu compra está lista.</div>
                <div style="margin-top:12px;font-size:15px;font-weight:700;">${escapeHtml(summary)} · Entrega automática</div>
              </td>
            </tr>
            <tr>
              <td style="padding:34px 4px 10px;font-family:Arial,Helvetica,sans-serif;color:#050505;">
                <p style="margin:0;font-size:20px;font-weight:900;">${escapeHtml(greeting)}</p>
                <p style="margin:10px 0 24px;font-size:15px;line-height:1.6;">Confirmamos tu pago. Estos son los datos exactos de los perfiles incluidos en tu compra:</p>
                ${input.accounts.map(accountHtml).join('')}
                <div style="margin-top:28px;text-align:center;">
                  <a href="${escapeHtml(input.dashboardUrl)}" style="display:inline-block;padding:16px 24px;border:3px solid #050505;border-radius:12px;background:#ffd300;box-shadow:5px 5px 0 #050505;color:#050505;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:900;text-decoration:none;text-transform:uppercase;">Abrir mi panel</a>
                </div>
                <div style="margin-top:32px;padding:16px;border:2px solid #050505;border-radius:12px;background:#fffdf6;font-size:13px;line-height:1.55;">
                  <strong>Importante:</strong> no compartas este correo. Si una plataforma solicita un código temporal, podrás verlo automáticamente desde tu panel de StreamClick.
                </div>
                <p style="margin:28px 0 0;text-align:center;color:#68645c;font-size:12px;">StreamClick · Sin chats, sin esperas.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textAccounts = input.accounts
    .map((account) => {
      const pin = account.profilePin?.trim() || 'Sin PIN';
      return [
        account.serviceName.toUpperCase(),
        `Correo de acceso: ${account.loginEmail}`,
        `Contraseña: ${account.loginPassword}`,
        `Perfil: ${account.profileLabel}`,
        `PIN del perfil: ${pin}`,
        `Vigencia: ${expirationLabel(account.expiresAt)}`,
      ].join('\n');
    })
    .join('\n\n');

  const text = `${greeting}\n\nConfirmamos tu pago. Estos son los datos de tu compra:\n\n${textAccounts}\n\nAbre tu panel: ${input.dashboardUrl}\n\nNo compartas este correo. Los códigos temporales aparecerán automáticamente en tu panel.\n\nStreamClick · Sin chats, sin esperas.`;

  return {
    subject: 'Tu compra de StreamClick ya está lista',
    html,
    text,
  };
}
