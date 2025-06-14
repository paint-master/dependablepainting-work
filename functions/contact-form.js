export async function onRequestPost(context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "https://dependablepainting.work",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Content-Type": "application/json"
  };

  try {
    const { name, email, phone, service, message } = await context.request.json();

    if (!name || !email || !service || !message) {
      return new Response(JSON.stringify({ message: "Missing required fields" }), {
        status: 422,
        headers: corsHeaders
      });
    }

    const creds = JSON.parse(context.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const impersonateEmail = context.env.IMPERSONATE_EMAIL;

    const accessToken = await getGoogleAuthToken(creds, impersonateEmail);
    if (!accessToken) {
      return new Response(JSON.stringify({ message: "Google auth failed" }), {
        status: 500,
        headers: corsHeaders
      });
    }

    const emailBody = `New Lead from dependablepainting.work:\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone || 'N/A'}\nService: ${service}\nMessage: ${message}`;
    const rawEmail = [
      `From: \"Form Submission\" <${impersonateEmail}>`,
      `To: ${impersonateEmail}`,
      `Reply-To: ${email}`,
      `Subject: New Lead: ${name} - ${service}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      emailBody
    ].join("\r\n");

    const base64EncodedEmail = btoa(rawEmail)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const gmailResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ raw: base64EncodedEmail })
    });

    if (!gmailResponse.ok) {
      const error = await gmailResponse.text();
      return new Response(JSON.stringify({ message: "Failed to send email", error }), {
        status: 502,
        headers: corsHeaders
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: corsHeaders
    });
  } catch (err) {
    return new Response(JSON.stringify({ message: "Internal server error", error: err.message }), {
      status: 500,
      headers: corsHeaders
    });
  }
}

async function getGoogleAuthToken(creds, impersonateEmail) {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: creds.client_email,
    sub: impersonateEmail,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/gmail.send"
  };

  const encodedHeader = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const signatureInput = `${encodedHeader}.${encodedPayload}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBinary(creds.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signatureInput));
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const jwt = `${signatureInput}.${encodedSignature}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });

  if (!response.ok) return null;

  const data = await response.json();
  return data.access_token;
}

function pemToBinary(pem) {
  const base64 = pem.replace(/-+BEGIN PRIVATE KEY-+/, "").replace(/-+END PRIVATE KEY-+/, "").replace(/\n/g, "");
  const binaryDer = atob(base64);
  const buffer = new ArrayBuffer(binaryDer.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binaryDer.length; i++) {
    view[i] = binaryDer.charCodeAt(i);
  }
  return buffer;
}