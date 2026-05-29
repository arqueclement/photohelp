const startCameraButton = document.querySelector("#startCamera");
const takePhotoButton = document.querySelector("#takePhoto");
const sharePhotoButton = document.querySelector("#sharePhoto");
const downloadPhotoButton = document.querySelector("#downloadPhoto");
const printPhotoButton = document.querySelector("#printPhoto");
const emailPhotoButton = document.querySelector("#emailPhoto");
const fileInput = document.querySelector("#fileInput");
const video = document.querySelector("#cameraPreview");
const canvas = document.querySelector("#photoCanvas");
const photoPreview = document.querySelector("#photoPreview");
const emptyState = document.querySelector("#emptyState");
const sendForm = document.querySelector("#sendForm");
const emailInput = document.querySelector("#emailInput");
const courseInput = document.querySelector("#courseInput");
const messageInput = document.querySelector("#messageInput");
const statusMessage = document.querySelector("#statusMessage");
const photoState = document.querySelector("#photoState");

let photoDataUrl = "";
let cameraStream = null;

function setStatus(message) {
  statusMessage.textContent = message;
}

function stopCamera() {
  if (!cameraStream) return;

  cameraStream.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  video.srcObject = null;
  takePhotoButton.disabled = true;
}

function setPhoto(dataUrl) {
  photoDataUrl = dataUrl;
  photoPreview.src = dataUrl;
  photoPreview.hidden = false;
  emptyState.hidden = true;
  video.hidden = true;
  photoState.textContent = "Photo prete";
  sharePhotoButton.disabled = !canShareFiles();
  downloadPhotoButton.disabled = false;
  printPhotoButton.disabled = false;
  emailPhotoButton.disabled = false;
  setStatus("Photo ajoutee. Vous pouvez telecharger, imprimer ou envoyer l'email.");
  stopCamera();
}

function getFileName() {
  const course = courseInput.value.trim().replace(/[^a-z0-9-]+/gi, "-") || "cours";
  return `${course}-photo.png`;
}

function dataUrlToFile(dataUrl, fileName) {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], fileName, { type: mime });
}

async function startCamera() {
  try {
    stopCamera();
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });

    video.srcObject = cameraStream;
    video.hidden = false;
    photoPreview.hidden = true;
    emptyState.hidden = true;
    takePhotoButton.disabled = false;
    photoState.textContent = "Camera ouverte";
    setStatus("Camera ouverte. Cadrez la feuille puis prenez la photo.");
  } catch (error) {
    setStatus("Impossible d'ouvrir la camera. Vous pouvez choisir une photo depuis le telephone.");
  }
}

function takePhoto() {
  const width = video.videoWidth;
  const height = video.videoHeight;

  if (!width || !height) {
    setStatus("La camera n'est pas encore prete. Reessayez dans une seconde.");
    return;
  }

  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(video, 0, 0, width, height);
  setPhoto(canvas.toDataURL("image/png", 0.95));
}

function downloadPhoto() {
  if (!photoDataUrl) return;

  const link = document.createElement("a");
  link.href = photoDataUrl;
  link.download = getFileName();
  link.click();
}

function canShareFiles() {
  if (!navigator.canShare || !navigator.share || !photoDataUrl) return false;

  try {
    return navigator.canShare({ files: [dataUrlToFile(photoDataUrl, getFileName())] });
  } catch (error) {
    return false;
  }
}

async function sharePhoto() {
  if (!photoDataUrl) return;

  const file = dataUrlToFile(photoDataUrl, getFileName());
  const course = courseInput.value.trim();

  if (!navigator.share || !navigator.canShare?.({ files: [file] })) {
    setStatus("Le partage avec piece jointe n'est pas disponible sur ce navigateur. Telechargez la photo puis joignez-la a un email.");
    return;
  }

  try {
    await navigator.share({
      files: [file],
      title: course ? `Photo de cours - ${course}` : "Photo de cours",
      text: messageInput.value.trim() || "Bonjour, voici la photo de mon cours a imprimer."
    });
    setStatus("Partage ouvert. Choisissez votre application mail pour envoyer la photo.");
  } catch (error) {
    setStatus("Partage annule ou impossible. Vous pouvez telecharger la photo.");
  }
}

function getFriendlySendError(result, status) {
  const rawMessage = `${result?.message || ""} ${result?.detail || ""} ${result?.error || ""}`.toLowerCase();

  if (status === 403 || rawMessage.includes("testing emails") || rawMessage.includes("verify a domain")) {
    return "Envoi direct bloque par le service mail. Touchez Partager, choisissez votre application mail, puis envoyez la photo.";
  }

  if (status === 500) {
    return "L'envoi direct n'est pas encore configure. Utilisez Partager ou Telecharger pour envoyer la photo.";
  }

  return "Envoi direct impossible pour le moment. Utilisez Partager ou Telecharger pour envoyer la photo.";
}

function printPhoto() {
  if (!photoDataUrl) return;

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    setStatus("Autorisez les fenetres pop-up pour imprimer la photo.");
    return;
  }

  printWindow.document.write(`
    <!doctype html>
    <html lang="fr">
      <head>
        <title>Impression du cours</title>
        <style>
          body { margin: 0; display: grid; min-height: 100vh; place-items: center; }
          img { max-width: 100%; max-height: 100vh; object-fit: contain; }
        </style>
      </head>
      <body>
        <img src="${photoDataUrl}" alt="Photo du cours">
        <script>
          window.onload = () => window.print();
        <\/script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

async function sendEmail(event) {
  event.preventDefault();

  if (!photoDataUrl) {
    setStatus("Ajoutez une photo avant d'envoyer l'email.");
    return;
  }

  const email = emailInput.value.trim();
  if (!emailInput.checkValidity()) {
    setStatus("Entrez une adresse email valide.");
    emailInput.focus();
    return;
  }

  const file = dataUrlToFile(photoDataUrl, getFileName());
  const message = messageInput.value.trim();

  setStatus("Envoi de l'email en cours...");
  emailPhotoButton.disabled = true;

  try {
    const formData = new FormData();
    formData.append("email", email);
    formData.append("course", courseInput.value.trim());
    formData.append("message", message);
    formData.append("photo", file);

    const response = await fetch("/api/send", {
      method: "POST",
      body: formData
    });

    if (response.ok) {
      setStatus("Email envoye directement. Vous pouvez maintenant l'imprimer depuis votre boite mail.");
      return;
    }

    const result = await response.json().catch(() => ({}));
    setStatus(getFriendlySendError(result, response.status));
  } catch (error) {
    setStatus("Envoi direct impossible pour le moment. Utilisez Partager ou Telecharger pour envoyer la photo.");
  } finally {
    emailPhotoButton.disabled = false;
  }
}

function handleFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => setPhoto(reader.result);
  reader.readAsDataURL(file);
}

startCameraButton.addEventListener("click", startCamera);
takePhotoButton.addEventListener("click", takePhoto);
sharePhotoButton.addEventListener("click", sharePhoto);
downloadPhotoButton.addEventListener("click", downloadPhoto);
printPhotoButton.addEventListener("click", printPhoto);
sendForm.addEventListener("submit", sendEmail);
fileInput.addEventListener("change", handleFile);

if (!navigator.mediaDevices?.getUserMedia) {
  startCameraButton.disabled = true;
  setStatus("Votre navigateur ne permet pas l'ouverture directe de la camera. Choisissez une photo.");
}

if (!navigator.share || !navigator.canShare) {
  sharePhotoButton.title = "Disponible sur certains telephones";
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
