export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("Only POST allowed", { status: 405 });
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return new Response("Bad JSON", { status: 400 });
    }

    const { name, email, phone, service, message } = body;

    const lead = {
      name,
      email,
      phone,
      service,
      message,
      timestamp: new Date().toISOString(),
      ip: request.headers.get("CF-Connecting-IP") || "unknown",
      userAgent: request.headers.get("User-Agent") || "unknown"
    };

    // --- 1. Zapier Email Notification ---
    try {
      await fetch("https://hooks.zapier.com/hooks/catch/22988228/uy50rxv/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead)
      });
    } catch (err) {
      console.error("Zapier webhook failed", err);
    }

    // --- 2. Google Sheets Logging (replace with your Apps Script Web App) ---
    try {
      await fetch("https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lead)
      });
    } catch (err) {
      console.error("Sheets webhook failed", err);
    }

    // --- 3. GA4 Event ---
    try {
      await fetch("https://www.google-analytics.com/mp/collect?measurement_id=G-4199PGW8SW&api_secret=YOUR_SECRET", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: crypto.randomUUID(),
          events: [
            {
              name: "lead_submission",
              params: {
                name,
                service,
                platform: "website",
                phone: !!phone,
              }
            }
          ]
        })
      });
    } catch (err) {
      console.error("GA4 push failed", err);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
      status: 200
    });
  }
}