async function handleSend(context) {
  try {
    const body = await context.request.json();
    const { to, subject, text, html, secret } = body;

    // Security check — secret shared between Railway backend and Cloudflare Function
    if (secret !== "golden-nuggets-smtp-secret-2026") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const payload = {
      personalizations: [
        {
          to: [{ email: to, name: "Golden Nuggets Admin" }],
        },
      ],
      from: {
        email: "goldennuggets.admin@gmail.com",
        name: "Golden Nuggets Administration",
      },
      subject: subject,
      content: [
        {
          type: "text/plain",
          value: text || "Golden Nuggets Password Reset Request",
        },
        {
          type: "text/html",
          value: html,
        },
      ],
    };

    const mcResponse = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const respText = await mcResponse.text();

    return new Response(
      JSON.stringify({
        status: mcResponse.status,
        ok: mcResponse.ok,
        response: respText,
      }),
      {
        status: mcResponse.status,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message, stack: err.stack }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }
  return handleSend(context);
}

export async function onRequestPost(context) {
  return handleSend(context);
}
