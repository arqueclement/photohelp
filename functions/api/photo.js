import { initDb, json, normalizePseudo } from "./_db.js";

export async function onRequestDelete({ request, env }) {
  if (!env.DB) {
    return json({ message: "La base D1 n'est pas branchee. Ajoutez le binding DB dans Cloudflare Pages." }, 500);
  }

  await initDb(env.DB);

  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";
  const pseudoKey = normalizePseudo(url.searchParams.get("pseudo") || "");
  const permanent = url.searchParams.get("permanent") === "1";

  if (!id || !pseudoKey) {
    return json({ message: "Photo introuvable." }, 400);
  }

  if (permanent) {
    await env.DB.prepare("DELETE FROM photos WHERE id = ? AND recipient_key = ?")
      .bind(id, pseudoKey)
      .run();
  } else {
    await env.DB.prepare("UPDATE photos SET deleted_at = ? WHERE id = ? AND recipient_key = ?")
      .bind(new Date().toISOString(), id, pseudoKey)
      .run();
  }

  return json({ ok: true });
}
