import { getVapidConfig, json } from "./_db.js";

export async function onRequestGet({ env }) {
  const config = getVapidConfig(env);

  if (!config) {
    return json({ message: "Notifications push non configurees." }, 500);
  }

  return json({ publicKey: config.publicKey });
}
