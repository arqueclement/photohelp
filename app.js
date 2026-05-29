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
const photoList = document.querySelector("#photoList");
const emptyState = document.querySelector("#emptyState");
const sendForm = document.querySelector("#sendForm");
const emailInput = document.querySelector("#emailInput");
const courseInput = document.querySelector("#courseInput");
const messageInput = document.querySelector("#messageInput");
const statusMessage = document.querySelector("#statusMessage");
const photoState = document.querySelector("#photoState");

const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

let photos = [];
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

function getTotalBytes() {
  return photos.reduce((total, photo) => total + photo.size, 0);
}

function getRemainingBytes() {
  return Math.max(0, MAX_TOTAL_BYTES - getTotalBytes());
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getDataUrlSize(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function getBaseFileName(index) {
  const course = courseInput.value.trim().replace(/[^a-z0-9-]+/gi, "-") || "cours";
  return `${course}-photo-${index + 1}.png`;
}

function getPhotoFiles() {
  return photos.map((photo, index) => dataUrlToFile(photo.dataUrl, photo.fileName || getBaseFileName(index)));
}

function updatePhotoButtons() {
  const hasPhotos = photos.length > 0;
  const limitReached = getRemainingBytes() <= 0;
  sharePhotoButton.disabled = !canShareFiles();
  downloadPhotoButton.disabled = !hasPhotos;
  printPhotoButton.disabled = !hasPhotos;
  emailPhotoButton.disabled = !hasPhotos;
  takePhotoButton.disabled = !cameraStream || limitReached;
  fileInput.disabled = limitReached;
}

function renderPhotos() {
  if (!photos.length) {
    photoPreview.hidden = true;
    emptyState.hidden = false;
    photoList.hidden = true;
    photoList.innerHTML = "";
    photoState.textContent = `Aucune photo - limite ${formatBytes(MAX_TOTAL_BYTES)}`;
    updatePhotoButtons();
    return;
  }

  const lastPhoto = photos[photos.length - 1];
  photoPreview.src = lastPhoto.dataUrl;
  photoPreview.hidden = false;
  emptyState.hidden = true;
  video.hidden = true;
  photoList.hidden = false;
  photoState.textContent = `${photos.length} photo${photos.length > 1 ? "s" : ""} - ${formatBytes(getTotalBytes())} / ${formatBytes(MAX_TOTAL_BYTES)}`;
  photoList.innerHTML = photos.map((photo, index) => `
    <div class="photo-item">
      <span>Photo ${index + 1}</span>
      <strong>${formatBytes(photo.size)}</strong>
    </div>
  `).join("");
  updatePhotoButtons();
}

function addPhoto(dataUrl, fileName = "") {
  const size = getDataUrlSize(dataUrl);

  if (getTotalBytes() + size > MAX_TOTAL_BYTES) {
    setStatus(`Limite atteinte: ${formatBytes(getTotalBytes())} / ${formatBytes(MAX_TOTAL_BYTES)}. Cette photo fait ${formatBytes(size)} et ne peut pas etre ajoutee.`);
    renderPhotos();
    return false;
  }

  photos.push({
    dataUrl,
    fileName: fileName || getBaseFileName(photos.length),
    size
  });
  renderPhotos();
  setStatus(`${photos.length} photo${photos.length > 1 ? "s" : ""} ajoutee${photos.length > 1 ? "s" : ""}. Total: ${formatBytes(getTotalBytes())}. Reste: ${formatBytes(getRemainingBytes())}.`);
  stopCamera();
  return true;
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
  if (getRemainingBytes() <= 0) {
    setStatus(`Limite atteinte: ${formatBytes(MAX_TOTAL_BYTES)}. Telechargez ou envoyez les photos avant d'en ajouter.`);
    return;
  }

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
  addPhoto(canvas.toDataURL("image/png", 0.95));
}

function downloadPhoto() {
  if (!photos.length) return;

  photos.forEach((photo, index) => {
    const link = document.createElement("a");
    link.href = photo.dataUrl;
    link.download = photo.fileName || getBaseFileName(index);
    link.click();
  });
  setStatus(`${photos.length} photo${photos.length > 1 ? "s telechargees" : " telechargee"}.`);
}

function canShareFiles() {
  if (!navigator.canShare || !navigator.share || !photos.length) return false;

  try {
    return navigator.canShare({ files: getPhotoFiles() });
  } catch (error) {
    return false;
  }
}

async function sharePhoto() {
  if (!photos.length) return;

  const files = getPhotoFiles();
  const course = courseInput.value.trim();

  if (!navigator.share || !navigator.canShare?.({ files })) {
    setStatus("Le partage de plusieurs photos n'est pas disponible sur ce navigateur. Telechargez les photos puis joignez-les a un email.");
    return;
  }

  try {
    await navigator.share({
      files,
      title: course ? `Photo de cours - ${course}` : "Photo de cours",
      text: `${messageInput.value.trim() || "Bonjour, voici la photo de mon cours a imprimer."}\n\n${photos.length} photo${photos.length > 1 ? "s" : ""} - ${formatBytes(getTotalBytes())}`
    });
    setStatus("Partage ouvert. Choisissez votre application mail pour envoyer les photos.");
  } catch (error) {
    setStatus("Partage annule ou impossible. Vous pouvez telecharger les photos.");
  }
}

function printPhoto() {
  if (!photos.length) return;

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
          body { margin: 0; }
          img { display: block; max-width: 100%; max-height: 100vh; margin: 0 auto; object-fit: contain; page-break-after: always; }
        </style>
      </head>
      <body>
        ${photos.map((photo, index) => `<img src="${photo.dataUrl}" alt="Photo du cours ${index + 1}">`).join("")}
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

  if (!photos.length) {
    setStatus("Ajoutez une photo avant d'envoyer le mail.");
    return;
  }

  const email = emailInput.value.trim();
  if (!emailInput.checkValidity()) {
    setStatus("Entrez une adresse email valide.");
    emailInput.focus();
    return;
  }

  const message = messageInput.value.trim();
  const course = courseInput.value.trim();
  const subject = course ? `Photo de cours - ${course}` : "Photo de cours";
  const body = `${message || "Bonjour, voici la photo de mon cours a imprimer."}\n\n${photos.length} photo${photos.length > 1 ? "s" : ""} - ${formatBytes(getTotalBytes())}`;
  const files = getPhotoFiles();

  setStatus("Ouverture de l'application mail...");
  emailPhotoButton.disabled = true;

  try {
    if (navigator.share && navigator.canShare?.({ files })) {
      await navigator.share({
        files,
        title: subject,
        text: `${body}\n\nDestinataire: ${email}`
      });
      setStatus("Partage ouvert. Choisissez Gmail ou Mail, verifiez le destinataire, puis envoyez.");
      return;
    }

    downloadPhoto();
    const mailto = new URL(`mailto:${email}`);
    mailto.searchParams.set("subject", subject);
    mailto.searchParams.set("body", `${body}\n\nLes photos ont ete telechargees. Ajoutez-les en pieces jointes avant d'envoyer.`);
    window.location.href = mailto.toString();
    setStatus("Les photos ont ete telechargees. Ajoutez-les en pieces jointes dans votre mail.");
  } catch (error) {
    setStatus("Partage annule. Vous pouvez recommencer avec Envoyer ou utiliser Telecharger.");
  } finally {
    emailPhotoButton.disabled = false;
  }
}

function handleFile(event) {
  const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith("image/"));
  if (!files.length) return;

  files.forEach((file) => {
    const reader = new FileReader();
    reader.onload = () => addPhoto(reader.result, file.name);
    reader.readAsDataURL(file);
  });
  fileInput.value = "";
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
