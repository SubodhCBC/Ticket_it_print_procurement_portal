import { createTransport, type Transporter } from 'nodemailer'
import { getConfig } from '../config'
import { DependencyUnavailableError } from '../utils/errors'
import type { RenderedMail } from './mail.templates'

export interface OutboundMail extends RenderedMail {
  readonly to: string
  readonly replyTo?: string
}

/**
 * Delivers a rendered message.
 *
 * Deliberately dumb: it does not know what an invitation is, it does not retry,
 * and it does not decide when to send. `mail.dispatcher.ts` is what feature code
 * calls.
 */

/**
 * Built on first use and cached on `globalThis`.
 *
 * Lazy because most requests send nothing, and opening an SMTP connection pool
 * eagerly would make a mail server outage delay a process that may never need
 * it. Cached on the global for the same reason the Prisma and S3 clients are:
 * Next re-evaluates modules on every hot reload, which would otherwise leak a
 * pool per edit.
 */
const globalForMail = globalThis as unknown as { mailTransporter?: Transporter }

function getTransporter(): Transporter {
  if (globalForMail.mailTransporter) return globalForMail.mailTransporter

  const { mail } = getConfig()

  if (mail.transport === 'console') {
    // `jsonTransport` resolves without any network I/O and hands the message
    // back on the result, which is what makes it usable in tests and in a
    // sandbox that has no SMTP server at all.
    globalForMail.mailTransporter = createTransport({ jsonTransport: true })
    return globalForMail.mailTransporter
  }

  globalForMail.mailTransporter = createTransport({
    host: mail.host,
    port: mail.port,
    secure: mail.secure,
    ...(mail.user
      ? { auth: { user: mail.user, pass: mail.password ?? '' } }
      : {}),
    pool: true,
    maxConnections: 3,
    // Bounded so a hung mail server cannot hold a request open indefinitely.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })

  return globalForMail.mailTransporter
}

export async function sendMail(mail: OutboundMail): Promise<void> {
  const config = getConfig().mail

  try {
    // `sendMail` is typed as returning `any` because the shape differs per
    // transport (SMTP, JSON, SES). Only the message id is used, so it is
    // narrowed here rather than spread through the call site.
    const info = (await getTransporter().sendMail({
      from: { name: config.fromName, address: config.fromAddress },
      to: mail.to,
      ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    })) as { messageId?: string }

    if (config.transport === 'console') {
      console.info(`[console transport] "${mail.subject}" to ${mail.to}`)
    } else {
      console.info(
        `Sent "${mail.subject}" to ${mail.to} (${info.messageId ?? 'no message id'}).`
      )
    }
  } catch (error) {
    // Wrapped so callers see a typed dependency error rather than a raw
    // nodemailer object, and so the message body — which may carry a single-use
    // token — never reaches the log.
    throw new DependencyUnavailableError('Mail server', { cause: error })
  }
}
