'use server';

import { headers } from 'next/headers';
import { validateMathChallenge, checkRateLimit } from '@/lib/spam';
import { sendContactEmail } from '@/lib/mailer';

export interface FormState {
  status: 'idle' | 'success' | 'error';
  message?: string;
  fieldErrors?: Partial<Record<'name' | 'email' | 'subject' | 'message' | 'captcha' | 'dsgvo', string>>;
}

export async function submitContact(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const rawLocale = (formData.get('_locale') as string | null) ?? 'de';
  const locale = ['de', 'en'].includes(rawLocale) ? rawLocale : 'de';

  // Load messages for the given locale
  const msgs = (await import(`../../../messages/${locale}.json`)).default as {
    contact: Record<string, string>;
  };
  const c = msgs.contact;

  // ── Extract fields ──────────────────────────────────────────────────────────
  const honeypot      = formData.get('website') as string | null;
  const loadedAt      = Number(formData.get('_t') ?? 0);
  const captchaToken  = (formData.get('_c') as string | null) ?? '';
  const captchaAnswer = ((formData.get('_a') as string | null) ?? '').trim();

  const name    = ((formData.get('name')    as string | null) ?? '').trim();
  const email   = ((formData.get('email')   as string | null) ?? '').trim();
  const subject = ((formData.get('subject') as string | null) ?? '').trim();
  const message = ((formData.get('message') as string | null) ?? '').trim();
  const dsgvo   = formData.get('dsgvo') === 'on';

  // ── Spam checks ─────────────────────────────────────────────────────────────

  if (honeypot) {
    return { status: 'error', message: c.errorSpam };
  }

  if (!loadedAt || Date.now() - loadedAt < 3_000) {
    return { status: 'error', message: c.errorTiming };
  }

  if (!validateMathChallenge(captchaAnswer, captchaToken)) {
    return {
      status: 'error',
      message: c.errorCaptchaFull,
      fieldErrors: { captcha: c.errorCaptcha },
    };
  }

  const headerStore = await headers();
  // NOTE: X-Forwarded-For is only trustworthy when the server sits behind
  // a trusted reverse proxy (Nginx, Caddy, AWS ALB, Cloudflare, …).
  // Never expose the Next.js process directly to the internet in production.
  const ip = headerStore.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (!checkRateLimit(ip)) {
    return { status: 'error', message: c.errorRateLimit };
  }

  if ((message.match(/https?:\/\//gi) ?? []).length >= 3) {
    return { status: 'error', message: c.errorLinks };
  }

  // ── Field validation ────────────────────────────────────────────────────────
  const fieldErrors: FormState['fieldErrors'] = {};

  if (!name    || name.length < 2    || name.length > 100)    fieldErrors.name    = c.errorName;
  if (!email   || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) fieldErrors.email = c.errorEmail;
  if (!subject || subject.length < 3 || subject.length > 150) fieldErrors.subject = c.errorSubject;
  if (!message || message.length < 10 || message.length > 5000) fieldErrors.message = c.errorMessage;
  if (!dsgvo)                          fieldErrors.dsgvo   = c.errorDsgvo;

  if (Object.keys(fieldErrors).length > 0) {
    return { status: 'error', message: c.errorFields, fieldErrors };
  }

  // ── Send email ──────────────────────────────────────────────────────────────
  try {
    await sendContactEmail({ name, email, subject, message });
    return { status: 'success', message: c.success };
  } catch (err) {
    console.error('[Contact] Email send failed:', err);
    return { status: 'error', message: c.errorSend };
  }
}
