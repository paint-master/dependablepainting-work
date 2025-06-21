export async function onRequestPost({ request, env }) {
  try {
    const data = await request.json();
    const { name, email, phone, service, message } = data;
    if (!name || !email || !service || !message) {
      return new Response(JSON.stringify({ error: "Missing required fields." }), { status: 400 });
    }
    const to = env.CONTACT_RECIPIENT_EMAIL;
    const from = env.CONTACT_SENDER_EMAIL || `no-reply@${new URL(request.url).hostname}`;
    if (!to) {
      console.error("CONTACT_RECIPIENT_EMAIL env var is not set");
      return new Response(JSON.stringify({ error: "Server configuration error." }), { status: 500 });
    }
    const subject = `New Lead: ${service} for ${name}`;
    const htmlContent = `
      <h3>New Contact Form Submission</h3>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Reply-To Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone || "Not provided"}</p>
      <p><strong>Service Needed:</strong> ${service}</p>
      <hr>
      <p><strong>Message:</strong></p>
      <p>${message.replace(/\n/g, "<br>")}</p>
    `;
    const mailPayload = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from, name: "Dependable Painting" },
      subject,
      content: [{ type: "text/html", value: htmlContent }]
    };
    const mailResp = await fetch("https://api.mailchannels.net/tx/v1/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mailPayload)
    });
    if (!mailResp.ok) {
      console.error("Mail send failed", await mailResp.text());
      return new Response(JSON.stringify({ error: "Failed to send the email." }), { status: 502 });
    }
    return new Response(JSON.stringify({ message: "Form submitted successfully!", category: service }), { status: 200 });
  } catch (err) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: "An internal server error occurred." }), { status: 500 });
  }
}
