'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { submitContact, type FormState } from './actions';

const INITIAL: FormState = { status: 'idle' };

interface Props {
  captchaQuestion: string;
  captchaToken: string;
  locale: string;
}

export default function ContactForm({ captchaQuestion, captchaToken, locale }: Props) {
  const t = useTranslations('contact');
  const [state, action, pending] = useActionState(submitContact, INITIAL);
  const loadedAtRef = useRef<number>(Date.now());
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
      setName(''); setEmail(''); setSubject(''); setMessage('');
      setCaptchaAnswer(''); setDsgvo(false);
    }
  }, [state.status]);

  const [name,          setName]          = useState('');
  const [email,         setEmail]         = useState('');
  const [subject,       setSubject]       = useState('');
  const [message,       setMessage]       = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [dsgvo,         setDsgvo]         = useState(false);

  const canSubmit =
    name.trim().length          > 0 &&
    email.includes('@')              &&
    subject.trim().length       > 0 &&
    message.trim().length       > 0 &&
    captchaAnswer.trim().length > 0 &&
    dsgvo;

  const fe = state.fieldErrors ?? {};

  return (
    <form ref={formRef} action={action} noValidate className="space-y-6">
      {/* Honeypot */}
      <div
        className="absolute -left-[9999px] -top-[9999px] w-0 h-0 overflow-hidden"
        aria-hidden="true"
      >
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <input type="hidden" name="_t" defaultValue={loadedAtRef.current} />
      <input type="hidden" name="_c" value={captchaToken} readOnly />
      <input type="hidden" name="_locale" value={locale} />

      {/* Name */}
      <div>
        <label htmlFor="cf-name" className="block mono-label text-[var(--color-text-muted)] mb-2">
          {t('fieldName')} <span className="text-[var(--color-primary)]">*</span>
        </label>
        <input
          id="cf-name"
          name="name"
          type="text"
          required
          autoComplete="name"
          placeholder={t('placeholderName')}
          value={name}
          onChange={e => setName(e.target.value)}
          className={inputCls(!!fe.name)}
        />
        {fe.name && <p className="mt-1.5 text-xs text-red-400">{fe.name}</p>}
      </div>

      {/* E-Mail */}
      <div>
        <label htmlFor="cf-email" className="block mono-label text-[var(--color-text-muted)] mb-2">
          {t('fieldEmail')} <span className="text-[var(--color-primary)]">*</span>
        </label>
        <input
          id="cf-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder={t('placeholderEmail')}
          value={email}
          onChange={e => setEmail(e.target.value)}
          className={inputCls(!!fe.email)}
        />
        {fe.email && <p className="mt-1.5 text-xs text-red-400">{fe.email}</p>}
      </div>

      {/* Subject */}
      <div>
        <label htmlFor="cf-subject" className="block mono-label text-[var(--color-text-muted)] mb-2">
          {t('fieldSubject')} <span className="text-[var(--color-primary)]">*</span>
        </label>
        <input
          id="cf-subject"
          name="subject"
          type="text"
          required
          placeholder={t('placeholderSubject')}
          value={subject}
          onChange={e => setSubject(e.target.value)}
          className={inputCls(!!fe.subject)}
        />
        {fe.subject && <p className="mt-1.5 text-xs text-red-400">{fe.subject}</p>}
      </div>

      {/* Message */}
      <div>
        <label htmlFor="cf-message" className="block mono-label text-[var(--color-text-muted)] mb-2">
          {t('fieldMessage')} <span className="text-[var(--color-primary)]">*</span>
        </label>
        <textarea
          id="cf-message"
          name="message"
          required
          rows={6}
          placeholder={t('placeholderMessage')}
          value={message}
          onChange={e => setMessage(e.target.value)}
          className={`${inputCls(!!fe.message)} resize-y`}
        />
        {fe.message && <p className="mt-1.5 text-xs text-red-400">{fe.message}</p>}
      </div>

      {/* Math CAPTCHA */}
      <div>
        <label htmlFor="cf-captcha" className="block mono-label text-[var(--color-text-muted)] mb-2">
          {t('fieldCaptcha')}: {captchaQuestion} ={' '}
          <span className="text-[var(--color-primary)]">?&nbsp;*</span>
        </label>
        <input
          id="cf-captcha"
          name="_a"
          type="text"
          inputMode="numeric"
          required
          autoComplete="off"
          placeholder={t('placeholderCaptcha')}
          value={captchaAnswer}
          onChange={e => setCaptchaAnswer(e.target.value)}
          className={inputCls(!!fe.captcha)}
        />
        {fe.captcha
          ? <p className="mt-1.5 text-xs text-red-400">{fe.captcha}</p>
          : <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">{t('captchaHint')}</p>
        }
      </div>

      {/* DSGVO */}
      <div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="dsgvo"
            required
            checked={dsgvo}
            onChange={e => setDsgvo(e.target.checked)}
            className="mt-0.5 shrink-0 h-4 w-4 cursor-pointer accent-[var(--color-primary)]"
          />
          <span className="text-sm text-[var(--color-text-muted)] leading-snug">
            {t('dsgvoPrefix')}{' '}
            <Link href="/datenschutz" className="text-[var(--color-primary)] hover:underline">
              {t('dsgvoLink')}
            </Link>{' '}
            {t('dsgvoSuffix')}{' '}
            <span className="text-[var(--color-primary)]">*</span>
          </span>
        </label>
        {fe.dsgvo && <p className="mt-1.5 text-xs text-red-400 ml-7">{fe.dsgvo}</p>}
      </div>

      {/* Global error */}
      {state.status === 'error' && !Object.keys(fe).length && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {state.message}
        </div>
      )}

      {/* Field summary error */}
      {state.status === 'error' && Object.keys(fe).length > 0 && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {t('errorFieldsSummary')}
        </div>
      )}

      {/* Success */}
      {state.status === 'success' && (
        <div role="status" className="rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-4 py-3 text-sm text-[var(--color-primary)]">
          {state.message}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={pending || !canSubmit}
        className="w-full rounded-lg border border-[var(--color-primary)] bg-[var(--color-primary)]/10 px-6 py-3 text-sm font-mono font-semibold text-[var(--color-primary)] transition-all hover:bg-[var(--color-primary)]/20 hover:shadow-[0_0_20px_rgba(6,182,212,0.2)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]"
      >
        {pending ? t('submitting') : t('submitButton')}
      </button>

      <p className="text-center text-xs text-[var(--color-text-muted)]">
        {t('requiredNote')}
      </p>
    </form>
  );
}

function inputCls(hasError: boolean): string {
  return [
    'w-full rounded-lg border bg-[var(--color-bg-surface)] px-4 py-3',
    'text-sm text-[var(--color-text-base)] placeholder:text-[var(--color-text-dim)]',
    'transition-colors focus:outline-none focus:ring-1',
    hasError
      ? 'border-red-500/50 focus:border-red-500 focus:ring-red-500/30'
      : 'border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-[var(--color-primary)]/30',
  ].join(' ');
}
