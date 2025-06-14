import { GoogleAuth } from 'google-auth-library';

export async function onRequestPost(context) {
  const { env, request } = context;

  try {
    const { question } = await request.json();
    if (!question) {
      return new Response(JSON.stringify({ error: 'No question provided.' }), { status: 400 });
    }

    // --- Authenticate with Google ---
    const auth = new GoogleAuth({
      credentials: JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON),
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });
    const client = await auth.getClient();
    const accessToken = (await client.getAccessToken()).token;
    
    const projectId = auth.getProjectId();
    const location = 'us-central1'; // Common location, change if needed
    const model = 'text-bison@001'; // A solid, general-purpose text model

    // --- Construct the Prompt for the AI ---
    // This is where you give the AI its personality and context!
    const prompt = `
      You are a friendly and professional AI assistant for "Dependable Painting", a painting company serving Baldwin and Mobile Counties in Alabama.
      Your goal is to answer customer questions accurately based on the company's public information.
      Key information about Dependable Painting:
      - Services: Interior Painting, Exterior Painting, Cabinet Painting, Commercial Painting.
      - Service Area: Baldwin and Mobile Counties, including Fairhope, Daphne, Spanish Fort, Foley, and Bay Minette. They do NOT serve Gulf Shores or Orange Beach.
      - They are fully licensed and insured.
      - They offer free estimates.
      - They are known for quality, reliability, and clear communication.

      Based on this information, please answer the following customer question. Keep your answer concise and helpful.

      Customer Question: "${question}"

      Answer:
    `;

    // --- Call the Vertex AI API ---
    const response = await fetch(
      `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/${model}:predict`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instances: [{ content: prompt }],
          parameters: {
            temperature: 0.2,
            maxOutputTokens: 256,
            topK: 40,
            topP: 0.95,
          },
        }),
      }
    );

    if (!response.ok) {
        const errorBody = await response.text();
        console.error("Vertex AI API Error:", errorBody);
        return new Response(JSON.stringify({ error: 'Failed to get a response from the AI.' }), { status: 502 });
    }

    const data = await response.json();
    const aiContent = data.predictions[0].content;

    // --- Send the AI's Answer Back to the Frontend ---
    return new Response(JSON.stringify({ answer: aiContent }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error("🔥 Unhandled Function Error:", err.stack);
    return new Response(JSON.stringify({ error: 'An internal server error occurred.' }), { status: 500 });
  }
}