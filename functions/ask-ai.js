export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    const { question } = await request.json();
    if (!question) {
      return new Response(JSON.stringify({ error: 'No question provided.' }), { status: 400 });
    }

    // --- Get Secrets ---
    const serviceAccountJson = env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountJson) {
      console.error("Missing GOOGLE_SERVICE_ACCOUNT_JSON secret.");
      return new Response(JSON.stringify({ error: 'Server configuration error.' }), { status: 500 });
    }
    const creds = JSON.parse(serviceAccountJson);

    // --- Authenticate with Google (Manually) ---
    const accessToken = await getGoogleAuthToken(creds);
    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Failed to authenticate with Google." }), { status: 500 });
    }
    
    const projectId = creds.project_id;
    const location = 'us-central1';
    const model = 'gemini-1.5-flash-001'; // Using a modern, fast Gemini model

    // --- Construct the Prompt for the AI ---
    const prompt = `You are a friendly, professional AI assistant for "Dependable Painting", a painting company.
      Based ONLY on the following information, answer the customer's question. If the question cannot be answered from this information, politely say "I do not have that information, but you can contact us directly to find out."
      - Services: Interior Painting, Exterior Painting, Cabinet Painting, Commercial Painting.
      - Service Area: Baldwin and Mobile Counties in Alabama, including Fairhope, Daphne, Spanish Fort, Foley, and Bay Minette.
      - We do NOT serve Gulf Shores or Orange Beach for residential projects.
      - We are fully licensed and insured.
      - We offer free estimates.
      - We are known for quality, reliability, and clear communication.
      Customer Question: "${question}"`;

    // --- Call the Vertex AI API ---
    const response = await fetch(
      `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("Vertex AI API Error:", errorBody);
        return new Response(JSON.stringify({ error: 'Failed to get a response from the AI.' }), { status: 502 });
    }

    const data = await response.json();
    const aiContent = data.candidates[0].content.parts[0].text;

    // --- Send the AI's Answer Back ---
    return new Response(JSON.stringify({ answer: aiContent.trim() }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error("🔥 Unhandled Function Error:", err.stack);
    return new Response(JSON.stringify({ error: 'An internal server error occurred.' }), { status: 500 });
  }
}

// --- Helper Functions for Authentication (No Dependencies) ---

async function getGoogleAuthToken(creds) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: creds.client_email,
    sub: creds.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
  };

  const encodedHeader = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBinary(creds.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signatureInput));
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  
  const jwt = `${signatureInput}.${encodedSignature}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });

  if (!response.ok) {
    console.error("Failed to fetch Google auth token:", await response.text());
    return null;
  }
  
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