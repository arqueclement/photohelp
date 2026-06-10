import { getSenderName, initDb, json, normalizePseudo } from "./_db.js";

export async function onRequestPost({ request, env }) {
  if (!env.DB) {
    return json({ message: "La base D1 n'est pas branchee. Ajoutez le binding DB dans Cloudflare Pages." }, 500);
  }

  await initDb(env.DB);

  const body = await request.json().catch(() => ({}));
  const pseudo = String(body.pseudo || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const code = String(body.code || "").trim();
  const pseudoKey = normalizePseudo(pseudo);

  if (!pseudo || !email || !code) {
    return json({ message: "Entrez un pseudo, une email et un code." }, 400);
  }

  const account = await env.DB.prepare("SELECT email, pseudo, code FROM accounts WHERE email = ?")
    .bind(email)
    .first();

  if (account && account.code !== code) {
    return json({ message: "Cette email a deja un compte. Veuillez reessayer un nouveau code." }, 403);
  }

  const pseudoAccount = await env.DB.prepare("SELECT email FROM accounts WHERE pseudo_key = ?")
    .bind(pseudoKey)
    .first();

  if (pseudoAccount && pseudoAccount.email !== email) {
    return json({ message: "Ce pseudo est deja utilise." }, 409);
  }

  const now = new Date().toISOString();

  if (account) {
    await env.DB.prepare("UPDATE accounts SET pseudo = ?, pseudo_key = ? WHERE email = ?")
      .bind(pseudo, pseudoKey, email)
      .run();
  } else {
    await env.DB.prepare("INSERT INTO accounts (email, pseudo, pseudo_key, code, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(email, pseudo, pseudoKey, code, now)
      .run();
  }

  return json({
    ok: true,
    created: !account,
    email,
    pseudo,
    senderName: getSenderName(email)
  });
}
