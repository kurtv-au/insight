import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2'

export interface EmailMessage {
  subject: string
  html: string
  text: string
}

let client: SESv2Client | undefined

function useSes() {
  if (!client) {
    // Credentials come from the default AWS provider chain (env vars, profile, or IAM role)
    client = new SESv2Client({ region: useRuntimeConfig().aws.region })
  }
  return client
}

export async function sendEmail(to: string, message: EmailMessage) {
  const { email } = useRuntimeConfig()

  if (email.transport === 'console') {
    console.info(`\n[email] To: ${to}\n[email] Subject: ${message.subject}\n\n${message.text}\n`)
    return
  }

  await useSes().send(new SendEmailCommand({
    FromEmailAddress: email.from,
    Destination: { ToAddresses: [to] },
    Content: {
      Simple: {
        Subject: { Data: message.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: message.html, Charset: 'UTF-8' },
          Text: { Data: message.text, Charset: 'UTF-8' }
        }
      }
    }
  }))
}

/** Absolute URL for links in emails */
export function appUrl(path: string) {
  return new URL(path, useRuntimeConfig().public.appUrl).toString()
}
