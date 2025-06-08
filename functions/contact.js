export async function onRequestPost(context) {
  const req = context.request;
  const body = await req.json();

  const { name, email, phone, service, message } = body;

  const payload = {
    personalizations: [
      {
        to: [{ email: "alexdimmler@dependablepainting.work" }]
      }
    ],
    from: { email: "no-reply@dependablepainting.work" },
    subject: `New Inquiry: ${service} from ${name}`,
    content: [
      {
        type: "text/plain",
        value: `Name: ${name}\nEmail: ${email}\nPhone: ${phone || 'N/A'}\nService: ${service}\n\nMessage:\n${message}`
      }
    ]
  };

  const response = await fetch("https://api.mailchannels.net/tx/v1/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (response.ok) {
    return new Response(JSON.stringify({ success: true, category: service }), {
      headers: { "Content-Type": "application/json" }
    });
  } else {
    return new Response("Failed to send", { status: 500 });
  }
}