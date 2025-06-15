export async function onRequestPost(context) {
  const { env, request } = context;
  try {
    const { name, email, phone, service, message } = await request.json();
    if (!name || !email || !service || !message) {
      return new Response(JSON.stringify({ error: 'Missing required fields.' }), { status: 400 });
    }
    const serviceAccountJson = env.GOOGLE_SERVICE_ACCOUNT_JSON;
    const userToImpersonate = env.GMAIL_USER_TO_IMPERSONATE;
    if (!serviceAccountJson || !userToImpersonate) {
      console.error("Missing required server configuration secrets.");
      return new Response(JSON.stringify({ error: 'Server configuration error.' }), { status: 500 });
    }
    const creds = JSON.parse(serviceAccountJson);
    const accessToken = await getGoogleAuthToken(creds, userToImpersonate);
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Failed to authenticate with Google." }), { status: 500 });
    }
    const emailSubject = `New Lead: ${service} for ${name}`;
    const emailBody = [
      `Content-Type: text/html; charset="UTF-8"`, `MIME-Version: 1.0`,
      `to: ${userToImpersonate}`,
      `from: Dependable Painting Form <${userToImpersonate}>`,
      `subject: ${emailSubject}`, ``,
      `<h3>New Contact Form Submission</h3>`, `<p><strong>Name:</strong> ${name}</p>`,
      `<p><strong>Reply-To Email:</strong> ${email}</p>`,
      `<p><strong>Phone:</strong> ${phone || 'Not provided'}</p>`,
      `<p><strong>Service Needed:</strong> ${service}</p>`, `<hr>`,
      `<p><strong>Message:</strong></p>`, `<p>${message.replace(/\n/g, '<br>')}</p>`,
    ].join('\n');
    const base64EncodedEmail = btoa(emailBody).replace(/\+/g, '-').replace(/\//g, '_');
    const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: base64EncodedEmail }),
    });
    if (response.ok) {
      return new Response(JSON.stringify({ message: "Form submitted successfully!", category: service }), { status: 200 });
    } else {
      const errorBody = await response.json();
      console.error("Gmail API Error:", errorBody);
      return new Response(JSON.stringify({ error: 'Failed to send the email.' }), { status: 502 });
    }
  } catch (err) {
    console.error("🔥 Unhandled Function Error:", err.stack || err);
    return new Response(JSON.stringify({ error: 'An internal server error occurred.' }), { status: 500 });
  }
}
async function getGoogleAuthToken(creds, userToImpersonate) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: creds.client_email,
    sub: userToImpersonate,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/gmail.send',
  };
  const encodedHeader = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToBinary(creds.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signatureInput));
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const jwt = `${signatureInput}.${encodedSignature}`;
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}` });
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