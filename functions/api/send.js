import { arrayBufferToBase64, initDb, json, MAX_SEND_BYTES, normalizePseudo } from "./_db.js";

export async function onRequestPost({ request, env }) {
  if (!env.DB) {
    return json({ message: "La base D1 n'est pas branchee. Ajoutez le binding DB dans Cloudflare Pages." }, 500);
  }

  await initDb(env.DB);

  const formData = await request.formData();
  const recipientPseudo = String(formData.get("recipientPseudo") || "").trim();
  const recipientKey = normalizePseudo(recipientPseudo);
  const senderName = String(formData.get("senderName") || "").trim() || "la personne connectee";
  const senderEmail = String(formData.get("senderEmail") || "").trim().toLowerCase();
  const course = String(formData.get("course") || "").trim();
  const message = String(formData.get("message") || "").trim();
  const files = formData.getAll("photos").filter((file) => file && typeof file.arrayBuffer === "function");

  if (!recipientKey) {
    return json({ message: "Entrez un pseudo de reception." }, 400);
  }

  if (!files.length) {
    return json({ message: "Ajoutez une photo avant d'envoyer." }, 400);
  }

  const recipient = await env.DB.prepare("SELECT pseudo FROM accounts WHERE pseudo_key = ?")
    .bind(recipientKey)
    .first();

  if (!recipient) {
    return json({ message: "Le pseudo de reception n'est pas valide." }, 404);
  }

  const totalSize = files.reduce((total, file) => total + file.size, 0);
  if (totalSize > MAX_SEND_BYTES) {
    return json({ message: "Envoi trop lourd. Limite: 5 MB." }, 413);
  }

  const now = new Date().toISOString();

  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const mimeType = file.type || "image/png";
    const dataUrl = `data:${mimeType};base64,${arrayBufferToBase64(buffer)}`;

    await env.DB.prepare(`
      INSERT INTO photos (
        id, recipient_pseudo, recipient_key, sender_name, sender_email,
        course, message, file_name, mime_type, size, data_url, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      crypto.randomUUID(),
      recipient.pseudo,
      recipientKey,
      senderName,
      senderEmail,
      course,
      message,
      file.name || "photo.png",
      mimeType,
      file.size,
      dataUrl,
      now
    ).run();
  }

  return json({
    ok: true,
    count: files.length,
    recipientPseudo: recipient.pseudo
  });
}
