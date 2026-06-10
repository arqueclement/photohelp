import { initDb, json, normalizePseudo } from "./_db.js";

export async function onRequestPost({ request, env }) {
  if (!env.DB) {
    return json({ message: "La base D1 n'est pas branchee. Ajoutez le binding DB dans Cloudflare Pages." }, 500);
  }

  await initDb(env.DB);

  const body = await request.json().catch(() => ({}));
  const pseudoKey = normalizePseudo(body.pseudo || "");
  const subscription = body.subscription;

  if (!pseudoKey || !subscription?.endpoint) {
    return json({ message: "Abonnement notification invalide." }, 400);
  }

  await env.DB.prepare(`
    INSERT OR REPLACE INTO push_subscriptions (endpoint, pseudo_key, subscription_json, created_at)
    VALUES (?, ?, ?, ?)
  `).bind(
    subscription.endpoint,
    pseudoKey,
    JSON.stringify(subscription),
    new Date().toISOString()
  ).run();

  return json({ ok: true });
}
