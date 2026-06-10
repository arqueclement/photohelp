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
      created_at TEXT NOT NULL
    )
  `).run();
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
