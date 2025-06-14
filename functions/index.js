export async function onRequestPost(context) {
  // context.env is where the secrets are stored in Cloudflare Pages.
  const { env } = context;

  try {
    // --- Get Secrets ---
    const serviceAccountJson = env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const impersonateEmail = env.IMPERSONATE_EMAIL;

    if (!serviceAccountJson || !impersonateEmail) {
      console.error("Missing environment variables in Cloudflare Pages settings.");
      return new Response(JSON.stringify({ message: "Server configuration error." }), { status: 500 });
    }
    const creds = JSON.parse(serviceAccountJson);

    // --- Get Data from the Form ---
    const data = await context.request.json();
    const { name, email, phone, service, message } = data;

    if (!name || !email || !service || !message) {
      return new Response(JSON.stringify({ message: "Missing required fields" }), { status: 422 });
    }

    // --- Authenticate with Google ---
    const accessToken = await getGoogleAuthToken(creds, impersonateEmail);
    if (!accessToken) {
      return new Response(JSON.stringify({ message: "Failed to authenticate with Google." }), { status: 500 });
    }
    
    // --- Construct and Send Email ---
    const emailBody = `New Lead from dependablepainting.work:\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone || 'N/A'}\nService: ${service}\nMessage: ${message}`;
    const rawEmail = [
      `From: "Dependable Painting Contact Form" <${impersonateEmail}>`,
      `To: ${impersonateEmail}`,
      `Reply-To: ${email}`,
      `Subject: New Project Lead: ${name} - ${service}`,
      "Content-Type: text/plain; charset=utf-8", "", emailBody
    ].join("\r\n");

    const base64EncodedEmail = btoa(rawEmail).replace(/\+/g, '-').replace(/\//g, '_');

    const gmailResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: base64EncodedEmail })
    });

    if (!gmailResponse.ok) {
      console.error("Gmail API Error:", await gmailResponse.text());
      return new Response(JSON.stringify({ message: "Failed to send message." }), { status: 502 });
    }

    // --- Success Response ---
    return new Response(JSON.stringify({ success: true, category: service }), { status: 200 });

  } catch (err) {
    console.error("🔥 Unhandled Function Error:", err);
    return new Response(JSON.stringify({ message: "An internal error occurred." }), { status: 500 });
  }
}

// Helper functions (these are the same as before)
async function getGoogleAuthToken(creds, impersonateEmail) { /* ... same as before ... */ }
function pemToBinary(pem) { /* ... same as before ... */ }

// Paste the full helper functions here from the previous code block I sent
async function getGoogleAuthToken(creds, impersonateEmail) {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: creds.client_email, sub: impersonateEmail, aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600, scope: "https://www.googleapis.com/auth/gmail.send"
  };
  const encodedHeader = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToBinary(creds.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signatureInput));
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = `${signatureInput}.${encodedSignature}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });
  if (!response.ok) { console.error("Failed to fetch Google auth token:", await response.text()); return null; }
  const data = await response.json();
  return data.access_token;
}
function pemToBinary(pem) {
  const base64 = pem.replace(/-+BEGIN PRIVATE KEY-+\r?\n/, "").replace(/\r?\n-+END PRIVATE KEY-+\r?\n/, "").replace(/\n/g, "");
  const binaryDer = atob(base64);
  const buffer = new ArrayBuffer(binaryDer.length);
  const a = new Uint8Array(buffer);
  for (let i = 0; i < binaryDer.length; i++) { a[i] = binaryDer.charCodeAt(i); }
  return buffer;
}