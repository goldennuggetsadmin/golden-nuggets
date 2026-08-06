import { connect } from 'cloudflare:sockets';

async function sendSmtpEmail({ to, subject, text, html }) {
  const host = "smtp.gmail.com";
  const port = 465;
  const user = "goldennuggets.admin@gmail.com";
  const pass = "pdndjrsrdtnpanhf";

  // Establish TLS socket connection to smtp.gmail.com:465
  const socket = connect({ hostname: host, port: port }, { secureTransport: "on" });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let buffer = "";

  async function readResponse() {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Check if response ends with newline and status code
      const lines = buffer.split("\r\n");
      for (const line of lines) {
        if (/^\d{3} /.test(line) || /^\d{3}-/.test(line)) {
          const res = buffer;
          buffer = "";
          return res;
        }
      }
    }
    const res = buffer;
    buffer = "";
    return res;
  }

  async function sendCmd(cmd) {
    await writer.write(encoder.encode(cmd + "\r\n"));
    return await readResponse();
  }

  // 1. Read greeting banner (220)
  const greeting = await readResponse();

  // 2. EHLO
  await sendCmd("EHLO gmail.com");

  // 3. AUTH LOGIN
  await sendCmd("AUTH LOGIN");
  await sendCmd(btoa(user));
  const authRes = await sendCmd(btoa(pass));
  if (!authRes.includes("235")) {
    throw new Error("SMTP Auth Failed: " + authRes);
  }

  // 4. MAIL FROM & RCPT TO
  await sendCmd(`MAIL FROM:<${user}>`);
  await sendCmd(`RCPT TO:<${to}>`);

  // 5. DATA
  await sendCmd("DATA");

  // Construct MIME message
  const mimeMsg = [
    `From: Golden Nuggets Administration <${user}>`,
    `To: <${to}>`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="boundary_gn_email"`,
    ``,
    `--boundary_gn_email`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    text || "Golden Nuggets Password Reset Link",
    ``,
    `--boundary_gn_email`,
    `Content-Type: text/html; charset=utf-8`,
    ``,
    html,
    ``,
    `--boundary_gn_email--`,
    `.`
  ].join("\r\n");

  const dataRes = await sendCmd(mimeMsg);

  // 6. QUIT
  try {
    await sendCmd("QUIT");
    await writer.close();
    await reader.cancel();
  } catch (e) {}

  return dataRes.includes("250");
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const { to, subject, text, html, secret } = body;

    if (secret !== "golden-nuggets-smtp-secret-2026") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const ok = await sendSmtpEmail({ to, subject, text, html });

    return new Response(JSON.stringify({ ok, message: ok ? "Delivered via Cloudflare SMTPS" : "Failed" }), {
      status: ok ? 200 : 500,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function onRequestGet(context) {
  return new Response(JSON.stringify({ service: "Cloudflare SMTPS Relay", status: "online" }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

export async function onRequestOptions(context) {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return onRequestOptions(context);
  }
  if (context.request.method === "GET") {
    return onRequestGet(context);
  }
  return onRequestPost(context);
}
