import nodemailer from 'nodemailer';

export interface ContactPayload {
  name: string;
  email: string;
  subject: string;
  message: string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendContactEmail(payload: ContactPayload): Promise<void> {
  const host = process.env.CONTACT_SMTP_HOST;
  const to   = process.env.CONTACT_EMAIL_TO;

  if (!host || !to) {
    throw new Error(
      'Contact form is not configured. Set CONTACT_SMTP_HOST and CONTACT_EMAIL_TO in .env.local.',
    );
  }

  const port   = Number(process.env.CONTACT_SMTP_PORT ?? '587');
  const secure = port === 465;
  const from   = process.env.CONTACT_EMAIL_FROM ?? process.env.CONTACT_SMTP_USER ?? to;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user: process.env.CONTACT_SMTP_USER,
      pass: process.env.CONTACT_SMTP_PASS,
    },
  });

  const safeName    = payload.name.replace(/[\r\n"]+/g, ' ').trim();
  const safeSubject = payload.subject.replace(/[\r\n]+/g, ' ').trim();

  await transporter.sendMail({
    from:    `"${safeName}" <${from}>`,
    replyTo: payload.email,
    to,
    subject: `[Beyond Shor Kontakt] ${safeSubject}`,
    text: [
      `Name:    ${payload.name}`,
      `E-Mail:  ${payload.email}`,
      `Betreff: ${payload.subject}`,
      '',
      payload.message,
    ].join('\n'),
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:600px;color:#1e293b">
        <h2 style="color:#06b6d4;margin-bottom:16px">Neue Kontaktanfrage — Beyond Shor</h2>
        <table cellpadding="6" style="border-collapse:collapse;margin-bottom:16px">
          <tr>
            <td style="font-weight:600;padding-right:16px">Name</td>
            <td>${escapeHtml(payload.name)}</td>
          </tr>
          <tr>
            <td style="font-weight:600;padding-right:16px">E-Mail</td>
            <td><a href="mailto:${escapeHtml(payload.email)}" style="color:#06b6d4">${escapeHtml(payload.email)}</a></td>
          </tr>
          <tr>
            <td style="font-weight:600;padding-right:16px">Betreff</td>
            <td>${escapeHtml(payload.subject)}</td>
          </tr>
        </table>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0"/>
        <p style="white-space:pre-wrap;line-height:1.6">${escapeHtml(payload.message)}</p>
      </div>
    `,
  });
}
