export async function onRequestPost({ request, env }) {
  try {
    if (!env.RESEND_API_KEY || !env.FROM_EMAIL) {
      return json({ error: "Email service is not configured." }, 500);
    }

    const formData = await request.formData();
    const email = String(formData.get("email") || "").trim();
    const course = String(formData.get("course") || "").trim();
    const message = String(formData.get("message") || "").trim();
    const photo = formData.get("photo");

    if (!isValidEmail(email)) {
      return json({ error: "Invalid email." }, 400);
    }

    if (!(photo instanceof File) || !photo.type.startsWith("image/")) {
      return json({ error: "Missing image." }, 400);
    }

    const bytes = new Uint8Array(await photo.arrayBuffer());
    const subject = `Photo de cours${course ? ` - ${course}` : ""}`;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: env.FROM_EMAIL,
        to: email,
        subject,
        text: `${message || "Bonjour, voici la photo de mon cours a imprimer."}\n`,
        attachments: [
          {
            filename: photo.name || "cours-photo.png",
            content: toBase64(bytes)
          }
        ]
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      if (detail.toLowerCase().includes("testing emails") || detail.toLowerCase().includes("verify a domain")) {
        return json({
          error: "Envoi direct bloque par le service mail.",
          message: "Utilisez Partager ou Telecharger pour envoyer la photo."
        }, 403);
      }

      return json({ error: "L'envoi direct a echoue." }, 502);
    }

    return json({ ok: true });
  } catch (error) {
    return json({ error: "Unexpected server error." }, 500);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function toBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}
