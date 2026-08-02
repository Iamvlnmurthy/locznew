/**
 * The shell every LocZ email is built in.
 *
 * Email rendering is stuck roughly twenty years behind the web: Gmail strips `<style>` blocks
 * in some contexts, Outlook renders through Word, and flexbox and grid are unavailable
 * almost everywhere. So this is tables and inline styles on purpose — not carelessness. The
 * alternative renders beautifully in a browser preview and collapses into a column of
 * unstyled text in the client that actually matters.
 *
 * Deliberately plain. A transactional email competes with phishing for the reader's trust,
 * and heavy design is what phishing looks like: the more a message resembles a marketing
 * campaign, the less it reads like a security notice from a service you use. One action, one
 * colour, no imagery.
 *
 * Every message keeps its plain-text version. This is an addition to it, never a replacement
 * — a message that only renders as HTML is unreadable wherever HTML is stripped, and password
 * reset is the last thing that should be unreadable.
 */

/** LocZ green, matching the app. Inline, because a stylesheet would not survive the trip. */
const BRAND = '#0f5132';
const INK = '#1a1a1a';
const MUTED = '#5a6b62';
const HAIRLINE = '#e3e8e5';

export interface EmailTemplate {
  /** One sentence, shown by the client as the preview line beside the subject. */
  preheader: string;
  heading: string;
  /** Paragraphs above the action. */
  body: string[];
  action?: { label: string; url: string };
  /** Shown small, below the action — the "if this wasn't you" and safety notes. */
  footnotes?: string[];
}

const escape = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Renders the HTML half of a message.
 *
 * `width="100%"` with a `max-width` on the inner table is the layout that survives the most
 * clients: Outlook ignores `max-width` and falls back to the fixed width, while everything
 * else honours it and stays readable on a phone.
 */
export function renderEmail(template: EmailTemplate): string {
  const paragraphs = template.body
    .map(
      (text) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${INK};">${escape(text)}</p>`,
    )
    .join('');

  const action = template.action
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
         <tr><td style="border-radius:8px;background:${BRAND};">
           <a href="${escape(template.action.url)}"
              style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;
                     color:#ffffff;text-decoration:none;border-radius:8px;">
             ${escape(template.action.label)}
           </a>
         </td></tr>
       </table>
       <!-- The same link in full, because a button is unclickable in a client that blocks
            them, and because a reader who wants to check where a link goes before clicking
            deserves to be able to. -->
       <p style="margin:0 0 24px;font-size:13px;line-height:1.5;color:${MUTED};word-break:break-all;">
         ${escape(template.action.url)}
       </p>`
    : '';

  const footnotes = (template.footnotes ?? [])
    .map(
      (text) =>
        `<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:${MUTED};">${escape(text)}</p>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escape(template.heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f5;">
<!-- Shown in the inbox list beside the subject, then hidden in the message itself. Without
     it the client picks the first words of the body, which is rarely the useful summary. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escape(template.preheader)}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:#f4f6f5;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="max-width:560px;background:#ffffff;border-radius:12px;
                  border:1px solid ${HAIRLINE};">
      <tr><td style="padding:32px 32px 8px;">
        <p style="margin:0 0 24px;font-size:18px;font-weight:700;color:${BRAND};
                  letter-spacing:-0.2px;">LocZ</p>
        <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;font-weight:700;color:${INK};">
          ${escape(template.heading)}
        </h1>
        ${paragraphs}
        ${action}
      </td></tr>
      ${
        footnotes
          ? `<tr><td style="padding:0 32px 28px;border-top:1px solid ${HAIRLINE};padding-top:20px;">
               ${footnotes}
             </td></tr>`
          : ''
      }
    </table>

    <p style="max-width:560px;margin:20px auto 0;font-size:12px;line-height:1.5;color:${MUTED};
              text-align:center;">
      LocZ — local buying and selling.<br>
      This is an automated message. Replies to it are not read.
    </p>
  </td></tr>
</table>
</body>
</html>`;
}
