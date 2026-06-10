export const MAX_SEND_BYTES = 5 * 1024 * 1024;

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

export function normalizePseudo(value = "") {
  return value.trim().toLowerCase();
}

export function getSenderName(email = "") {
  return email.split("@")[0].replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
}

export async function initDb(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS accounts (
      email TEXT PRIMARY KEY,
      pseudo TEXT NOT NULL,
      pseudo_key TEXT UNIQUE NOT NULL,
      code TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      recipient_pseudo TEXT NOT NULL,
      recipient_key TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      sender_email TEXT,
      course TEXT,
      message TEXT,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      data_url TEXT NOT NULL,
      created_at TEXT NOT NULL,
      deleted_at TEXT
    )
  `).run();

  try {
    await db.prepare("ALTER TABLE photos ADD COLUMN deleted_at TEXT").run();
  } catch (error) {
    // Old databases already have this column after the first migration.
  }

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      pseudo_key TEXT NOT NULL,
      subscription_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `).run();
}

export function getVapidConfig(env) {
  const publicKey = env.VAPID_PUBLIC_KEY || "";
  const privateKey = env.VAPID_PRIVATE_KEY || "";
  const subject = env.VAPID_SUBJECT || "mailto:photocours@example.com";

  if (!publicKey || !privateKey) return null;

  return { publicKey, privateKey, subject };
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function createVapidJwt(endpoint, config) {
  const audience = new URL(endpoint).origin;
  const publicBytes = base64UrlToBytes(config.publicKey);
  const x = bytesToBase64Url(publicBytes.slice(1, 33));
  const y = bytesToBase64Url(publicBytes.slice(33, 65));
  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x,
      y,
      d: config.privateKey,
      ext: false
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const header = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: config.subject
  })));
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(`${header}.${payload}`)
  ));

  return `${header}.${payload}.${bytesToBase64Url(signature)}`;
}

export async function sendPushNotification(subscription, config) {
  const token = await createVapidJwt(subscription.endpoint, config);
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${token}, k=${config.publicKey}`,
      TTL: "2419200",
      Urgency: "normal"
    }
  });

  return response.ok || response.status === 201 || response.status === 202;
}

export function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}
