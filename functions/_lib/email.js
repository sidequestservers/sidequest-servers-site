const DEFAULT_FROM = "SideQuest Servers <noreply@sidequestservers.com>";
const DEFAULT_REPLY_TO = "support@sidequestservers.com";

export async function sendEmail(env, { to, subject, text, html }) {
  if (!env.RESEND_API_KEY) {
    console.warn("Transactional email was not sent because RESEND_API_KEY is not configured.");
    return false;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.RESEND_FROM || DEFAULT_FROM,
      reply_to: env.RESEND_REPLY_TO || DEFAULT_REPLY_TO,
      to: [to],
      subject,
      text,
      html
    })
  });

  if (response.ok) return true;
  console.error(`Resend failed with ${response.status}: ${await response.text()}`);
  return false;
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;"
  })[character]);
}
