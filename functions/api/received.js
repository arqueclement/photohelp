import { initDb, json, normalizePseudo } from "./_db.js";

export async function onRequestGet({ request, env }) {
  if (!env.DB) {
    return json({ message: "La base D1 n'est pas branchee. Ajoutez le binding DB dans Cloudflare Pages." }, 500);
  }

  await initDb(env.DB);

  const url = new URL(request.url);
  const pseudo = url.searchParams.get("pseudo") || "";
  const pseudoKey = normalizePseudo(pseudo);

  if (!pseudoKey) {
    return json({ photos: [] });
  }

  const result = await env.DB.prepare(`
    SELECT id, sender_name AS sender, sender_email AS senderEmail, course, message,
           file_name AS fileName, mime_type AS mimeType, size, data_url AS dataUrl,
           created_at AS deliveredAt
    FROM photos
    WHERE recipient_key = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).bind(pseudoKey).all();

  return json({ photos: result.results || [] });
}
