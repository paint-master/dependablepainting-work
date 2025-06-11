export default {
  async fetch(request): Promise<Response> {
    // Set CORS headers to allow requests from your website
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*", // Or for better security: "https://your-website-domain.com"
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // The browser will send an OPTIONS request first to check CORS.
    // This handles that request.
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Handle GET requests gracefully.
    if (request.method === "GET") {
      return new Response("This endpoint accepts POST requests from the contact form.", {
        headers: { "Content-Type": "text/plain", ...corsHeaders },
      });
    }

    // Handle the POST request from the form.
    if (request.method === "POST") {
      try {
        // Get the form data from the request body.
        const { name, email, phone, service, message } = await request.json();

        // Construct the plain text body for the email.
        const emailBody = `
          New contact form submission from your website:\n
          --------------------------------------------------\n
          Name: ${name}\n
          Email: ${email}\n
          Phone: ${phone || 'Not provided'}\n
          Service Needed: ${service}\n
          --------------------------------------------------\n
          Message:\n
          ${message}
        `;

        // Create the email using the MailChannels API structure.
        const mail = {
          personalizations: [
            {
              to: [{ email: "alexdimmler@dependablepainting.work" }],
            },
          ],
          from: {
            email: "no-reply@dependablepainting.work",
            name: "Dependable Painting Form",
          },
          // Set the "Reply-To" to the user's email for convenience.
          reply_to: {
             email: email,
             name: name,
          },
          subject: `New Lead: ${name} - ${service}`,
          content: [
            {
              type: "text/plain",
              value: emailBody,
            },
          ],
        };

        // Send the email via the MailChannels API.
        const sendRequest = new Request("https://api.mailchannels.net/tx/v1/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mail),
        });

        const response = await fetch(sendRequest);

        // Check if the email was sent successfully (MailChannels returns 202 Accepted).
        if (response.status === 202) {
          return new Response(
            JSON.stringify({ success: true, message: "Message sent successfully!" }),
            { headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        } else {
          // If MailChannels returns an error, pass that error back.
          const errorData = await response.text();
          throw new Error(`MailChannels Error (${response.status}): ${errorData}`);
        }
      } catch (error) {
        // Handle any errors that occur during the process.
        return new Response(
          JSON.stringify({ success: false, message: error.message }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // Return a 405 Method Not Allowed for any other request types.
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders,
    });
  },
};