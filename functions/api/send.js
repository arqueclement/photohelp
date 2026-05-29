export async function onRequestPost() {
  return new Response(JSON.stringify({
    error: "Envoi direct desactive. Utilisez le partage du telephone ou le telechargement."
  }), {
    status: 410,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
