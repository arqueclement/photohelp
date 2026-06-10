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
const senderInput = document.querySelector("#senderInput");
const messageInput = document.querySelector("#messageInput");
const statusMessage = document.querySelector("#statusMessage");
const photoState = document.querySelector("#photoState");
const quickReceivedButton = document.querySelector("#quickReceived");
const quickSendButton = document.querySelector("#quickSend");
const quickTrashButton = document.querySelector("#quickTrash");
const quickPhotoButton = document.querySelector("#quickPhoto");
const folderView = document.querySelector("#folderView");
const folderSide = document.querySelector("#folderSide");
const folderContent = document.querySelector("#folderContent");
const backToMainButton = document.querySelector("#backToMain");
const openLoginButton = document.querySelector("#openLogin");
const loginView = document.querySelector("#loginView");
const closeLoginButton = document.querySelector("#closeLogin");
const loginForm = document.querySelector("#loginForm");
const loginPseudoInput = document.querySelector("#loginPseudo");
const loginEmailInput = document.querySelector("#loginEmail");
const loginCodeInput = document.querySelector("#loginCode");
const loginMessage = document.querySelector("#loginMessage");
const photoDialog = document.querySelector("#photoDialog");
const dialogPhoto = document.querySelector("#dialogPhoto");
const closePhotoDialogButton = document.querySelector("#closePhotoDialog");
const printPickerDialog = document.querySelector("#printPickerDialog");
const printPickerList = document.querySelector("#printPickerList");
const closePrintPickerButton = document.querySelector("#closePrintPicker");
const selectAllPrintPhotosButton = document.querySelector("#selectAllPrintPhotos");
const printSelectedPhotosButton = document.querySelector("#printSelectedPhotos");
const siteNotice = document.querySelector("#siteNotice");
const siteNoticeTitle = document.querySelector("#siteNoticeTitle");
const siteNoticeText = document.querySelector("#siteNoticeText");
const siteNoticeOpenButton = document.querySelector("#siteNoticeOpen");
const siteNoticeCloseButton = document.querySelector("#siteNoticeClose");
const quickBadges = document.querySelectorAll("[data-badge]");

const MAX_TOTAL_BYTES = 18 * 1024 * 1024;
const SERVER_SEND_LIMIT_BYTES = 5 * 1024 * 1024;
const ACCOUNTS_KEY = "photocours-accounts";
const SESSION_KEY = "photocours-session";
const DELIVERIES_KEY = "photocours-deliveries";
const RECEIVED_COUNT_KEY = "photocours-received-count";
const RECEIVED_POLL_MS = 30000;

let photos = [];
let receivedPhotos = [];
let sentPhotos = [];
let deletedPhotos = [];
let cameraStream = null;
let activeFolderView = "";
let receivedPollTimer = null;
let siteNoticeFolder = "received";

function setStatus(message) {
  statusMessage.textContent = message;
}

function setQuickBadge(name, count) {
  const badge = document.querySelector(`[data-badge="${name}"]`);
  if (!badge) return;

  badge.textContent = count > 99 ? "99+" : String(count);
  badge.hidden = count <= 0;
}

function updateQuickBadges() {
  setQuickBadge("received", receivedPhotos.length);
  setQuickBadge("send", getVisibleSentPhotos().length);
  setQuickBadge("trash", deletedPhotos.length);
  setQuickBadge("photo", photos.length);
}

function getAccounts() {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY)) || {};
  } catch (error) {
    return {};
  }
}

function saveAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function rememberAccount(email, pseudo, code = "") {
  const accounts = getAccounts();
  const current = typeof accounts[email] === "object" ? accounts[email] : {};
  accounts[email] = {
    ...current,
    code: code || current.code || "",
    pseudo
  };
  saveAccounts(accounts);
}

function getNameFromEmail(email) {
  return email.split("@")[0].replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
}

function getAccountCode(account) {
  return typeof account === "string" ? account : account?.code;
}

function normalizePseudo(value) {
  return value.trim().toLowerCase();
}

function getReceivedCountKey(pseudo = getCurrentPseudo()) {
  return `${RECEIVED_COUNT_KEY}:${normalizePseudo(pseudo || "none")}`;
}

function findAccountByPseudo(pseudo) {
  const normalizedPseudo = normalizePseudo(pseudo);
  const accounts = getAccounts();

  return Object.entries(accounts).find(([, account]) => {
    if (typeof account === "string") return false;
    return normalizePseudo(account.pseudo || "") === normalizedPseudo;
  });
}

function getCurrentPseudo() {
  const email = localStorage.getItem(SESSION_KEY);
  const account = email ? getAccounts()[email] : null;
  return typeof account === "object" ? account.pseudo || "" : "";
}

function getDeliveries() {
  try {
    return JSON.parse(localStorage.getItem(DELIVERIES_KEY)) || {};
  } catch (error) {
    return {};
  }
}

function saveDeliveries(deliveries) {
  localStorage.setItem(DELIVERIES_KEY, JSON.stringify(deliveries));
}

function getReceivedPhotosForCurrentUser() {
  const pseudo = getCurrentPseudo();
  if (!pseudo) return [];

  return getDeliveries()[normalizePseudo(pseudo)] || [];
}

function deliverPhotosToPseudo(recipientPseudo, sender, message, course) {
  const key = normalizePseudo(recipientPseudo);
  const deliveredAt = new Date().toISOString();
  const deliveries = getDeliveries();
  const deliveredPhotos = photos.map((photo) => ({
    ...photo,
    recipient: recipientPseudo,
    sender,
    message,
    course,
    deliveredAt
  }));

  deliveries[key] = [...deliveredPhotos, ...(deliveries[key] || [])];
  saveDeliveries(deliveries);
  receivedPhotos = getReceivedPhotosForCurrentUser();
}

function setConnectedEmail(email, pseudo = "") {
  localStorage.setItem(SESSION_KEY, email);
  openLoginButton.textContent = email;
  senderInput.value = getNameFromEmail(email);
  setupPushNotifications();
  startReceivedPolling();
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "default") return;

  try {
    await Notification.requestPermission();
  } catch (error) {
    // Some browsers only allow this from direct user actions.
  }
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return output;
}

async function setupPushNotifications() {
  const pseudo = getCurrentPseudo();
  if (!pseudo || !("serviceWorker" in navigator) || !("PushManager" in window)) return;

  await requestNotificationPermission();
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  try {
    const keyResponse = await fetch("/api/push-key");
    if (!keyResponse.ok) return;

    const { publicKey } = await keyResponse.json();
    const registration = await navigator.serviceWorker.ready;
    const existingSubscription = await registration.pushManager.getSubscription();
    const subscription = existingSubscription || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    await fetch("/api/push-subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pseudo, subscription })
    });
  } catch (error) {
    setStatus("Notifications push indisponibles sur cet appareil pour le moment.");
  }
}

async function getApiMessage(response) {
  try {
    const data = await response.json();
    return data.message || data.error || "Erreur du serveur.";
  } catch (error) {
    return "Erreur du serveur.";
  }
}

function loadConnectedEmail() {
  const email = localStorage.getItem(SESSION_KEY);
  if (email) {
    const account = getAccounts()[email];
    const pseudo = typeof account === "object" ? account.pseudo : "";
    setConnectedEmail(email, pseudo);
  }
}

function openLoginView() {
  loginView.hidden = false;
  loginMessage.textContent = "";
  loginEmailInput.focus();
}

function closeLoginView() {
  loginView.hidden = true;
}

async function handleLogin(event) {
  event.preventDefault();

  const pseudo = loginPseudoInput.value.trim();
  const email = loginEmailInput.value.trim().toLowerCase();
  const code = loginCodeInput.value.trim();

  if (!pseudo || !email || !code) {
    loginMessage.textContent = "Entrez un pseudo, une email et un code.";
    return;
  }

  loginMessage.textContent = "Connexion...";

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pseudo, email, code })
    });

    if (!response.ok) {
      loginMessage.textContent = await getApiMessage(response);
      return;
    }

    const result = await response.json();
    rememberAccount(result.email, result.pseudo, code);
    setConnectedEmail(result.email, result.pseudo);
    loginMessage.textContent = result.created ? "Compte cree. Vous etes connecte." : "Connexion reussie.";
    setStatus(`Connecte avec ${result.email}.`);
    closeLoginView();
    await loadReceivedPhotosFromServer();
  } catch (error) {
    loginMessage.textContent = "Connexion impossible. Verifiez que la base D1 est bien branchee au site.";
  }
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
  updateQuickBadges();
  setStatus(`${photos.length} photo${photos.length > 1 ? "s" : ""} ajoutee${photos.length > 1 ? "s" : ""}. Total: ${formatBytes(getTotalBytes())}. Reste: ${formatBytes(getRemainingBytes())}.`);
  stopCamera();
  return true;
}

function clearPhotos() {
  deletedPhotos = [
    ...photos.map((photo) => ({ ...photo, deletedAt: new Date().toISOString() })),
    ...deletedPhotos
  ];
  photos = [];
  stopCamera();
  renderPhotos();
  updateQuickBadges();
  setStatus("Photos envoyees dans la corbeille.");
  openFolderView("trash");
}

function rememberSentPhotos(recipient) {
  if (!photos.length) return;

  const sentAt = new Date().toISOString();
  const senderEmail = getCurrentEmail();
  sentPhotos = [
    ...photos.map((photo) => ({ ...photo, sender: getSenderName(), senderEmail, recipient, sentAt })),
    ...sentPhotos
  ];
  updateQuickBadges();
}

function getDisplayName() {
  const course = courseInput.value.trim();
  return course || "clément";
}

function createPhotoCards(items, label) {
  if (!items.length) {
    return `<p class="folder-empty">Aucune photo.</p>`;
  }

  return items.map((photo, index) => `
    <button class="folder-photo-card" type="button" data-photo-src="${photo.dataUrl}">
      <img src="${photo.dataUrl}" alt="${label} ${index + 1}">
      <strong>${label}</strong>
      <span>${formatBytes(photo.size)}</span>
    </button>
  `).join("");
}

function updateAppBadge(count) {
  syncServiceWorkerBadge(count);
  if (!("setAppBadge" in navigator) || !("clearAppBadge" in navigator)) return;

  if (count > 0) {
    navigator.setAppBadge(count).catch(() => {});
  } else {
    navigator.clearAppBadge().catch(() => {});
  }
}

function syncServiceWorkerBadge(count) {
  if (!("serviceWorker" in navigator)) return;

  const message = { type: "SET_BADGE", count };
  navigator.serviceWorker.controller?.postMessage(message);
  navigator.serviceWorker.ready
    .then((registration) => registration.active?.postMessage(message))
    .catch(() => {});
}

function showSiteNotice(folder, title, text) {
  siteNoticeFolder = folder;
  siteNoticeTitle.textContent = title;
  siteNoticeText.textContent = text;
  siteNotice.hidden = false;
  window.clearTimeout(showSiteNotice.timer);
  showSiteNotice.timer = window.setTimeout(() => {
    siteNotice.hidden = true;
  }, 9000);
}

async function showReceivedNotification(newCount, totalCount) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const title = newCount > 1 ? "Nouvelles photos reçues" : "Nouvelle photo reçue";
  const body = newCount > 1
    ? `${newCount} nouvelles photos sont arrivees. Total: ${totalCount}.`
    : `1 nouvelle photo est arrivee. Total: ${totalCount}.`;

  try {
    const registration = await navigator.serviceWorker?.ready;
    if (registration?.showNotification) {
      await registration.showNotification(title, {
        body,
        badge: "icons/icon-192.svg",
        icon: "icons/icon-192.svg",
        tag: "photocours-received"
      });
      return;
    }
  } catch (error) {
    // Fall back to a page notification below.
  }

  new Notification(title, {
    body,
    icon: "icons/icon-192.svg",
    tag: "photocours-received"
  });
}

function handleReceivedCount(newCount) {
  const key = getReceivedCountKey();
  const storedCount = localStorage.getItem(key);
  const oldCount = storedCount === null ? newCount : Number(storedCount);

  updateAppBadge(newCount);
  updateQuickBadges();
  localStorage.setItem(key, String(newCount));

  if (storedCount !== null && newCount > oldCount) {
    const difference = newCount - oldCount;
    showSiteNotice(
      "received",
      difference > 1 ? "Nouvelles photos dans Recue" : "Nouvelle photo dans Recue",
      difference > 1
        ? `${difference} nouvelles photos sont arrivees dans la categorie Recue.`
        : "1 nouvelle photo est arrivee dans la categorie Recue."
    );
    showReceivedNotification(newCount - oldCount, newCount);
  }
}

async function loadReceivedPhotosFromServer() {
  const pseudo = getCurrentPseudo();
  if (!pseudo) {
    receivedPhotos = [];
    updateAppBadge(0);
    updateQuickBadges();
    return;
  }

  try {
    const response = await fetch(`/api/received?pseudo=${encodeURIComponent(pseudo)}`);
    if (!response.ok) return;

    const result = await response.json();
    receivedPhotos = result.photos || [];
    handleReceivedCount(receivedPhotos.length);
    updateQuickBadges();
    if (activeFolderView === "received") {
      openFolderView("received");
    }
  } catch (error) {
    setStatus("Impossible de charger les photos recues pour le moment.");
  }
}

function startReceivedPolling() {
  if (receivedPollTimer) {
    clearInterval(receivedPollTimer);
  }

  if (!getCurrentPseudo()) return;

  receivedPollTimer = setInterval(() => {
    loadReceivedPhotosFromServer();
  }, RECEIVED_POLL_MS);
}

async function loadTrashPhotosFromServer() {
  const pseudo = getCurrentPseudo();
  if (!pseudo) return;

  try {
    const response = await fetch(`/api/trash?pseudo=${encodeURIComponent(pseudo)}`);
    if (!response.ok) return;

    const result = await response.json();
    const localPhotos = deletedPhotos.filter((photo) => !photo.id);
    deletedPhotos = [...(result.photos || []), ...localPhotos];
    updateQuickBadges();
    if (activeFolderView === "trash") {
      openFolderView("trash");
    }
  } catch (error) {
    setStatus("Impossible de charger la corbeille pour le moment.");
  }
}

function openPhotoDialog(src) {
  dialogPhoto.src = src;
  if (photoDialog.showModal) {
    photoDialog.showModal();
    return;
  }

  photoDialog.setAttribute("open", "");
}

function closePhotoDialog() {
  photoDialog.close?.();
  photoDialog.removeAttribute("open");
}

function openFolderView(view) {
  const email = emailInput.value.trim() || "sophie";
  const displayName = getDisplayName();

  folderView.hidden = false;
  document.body.classList.add("is-folder-open");

  if (view === "received") {
    folderSide.innerHTML = `
      <button class="folder-tab is-active" type="button">recue</button>
      <div class="folder-person">
        <span class="folder-avatar" aria-hidden="true"></span>
        <strong>clément</strong>
      </div>
    `;
    folderContent.innerHTML = `
      <button class="folder-tab" type="button">photos reçues</button>
      <div class="folder-card-row">
        ${createPhotoCards(receivedPhotos, "photo reçue")}
      </div>
    `;
    return;
  }

  if (view === "send") {
    folderSide.innerHTML = `
      <button class="folder-tab is-active" type="button">envoyer</button>
      <p class="folder-recipient">photos envoyées</p>
    `;
    folderContent.innerHTML = `
      <div class="folder-card-row">
        ${createPhotoCards(sentPhotos, `photo de ${displayName}`)}
      </div>
    `;
    return;
  }

  if (view === "trash") {
    folderSide.innerHTML = `
      <button class="folder-tab is-active" type="button">photo supprimer</button>
    `;
    folderContent.innerHTML = `
      <div class="folder-card-row">
        ${createPhotoCards(deletedPhotos, "photo supprimer")}
      </div>
    `;
    return;
  }

  folderSide.innerHTML = `
    <button class="folder-tab is-active" type="button">photo</button>
  `;
  folderContent.innerHTML = `
    <div class="folder-card-row folder-card-grid">
      ${createPhotoCards(photos, "photo non supprimer")}
    </div>
  `;
}

function closeFolderView() {
  folderView.hidden = true;
  document.body.classList.remove("is-folder-open");
  activeFolderView = "";
}

function getSenderName() {
  return senderInput.value.trim() || localStorage.getItem(SESSION_KEY) || "la personne connectee";
}

function getCurrentEmail() {
  return localStorage.getItem(SESSION_KEY) || "";
}

function getVisibleSentPhotos() {
  const currentEmail = getCurrentEmail();
  if (!currentEmail) return [];

  return sentPhotos.filter((photo) => photo.senderEmail === currentEmail);
}

function getFolderPhotos(view) {
  const folders = {
    received: receivedPhotos,
    send: getVisibleSentPhotos(),
    trash: deletedPhotos,
    photo: photos
  };

  return folders[view] || [];
}

function getFolderInfo(view) {
  const displayName = getSenderName();
  const folders = {
    received: {
      title: "Recue",
      subtitle: "Photos que les autres vous ont envoyees",
      label: "photo recue",
      items: receivedPhotos
    },
    send: {
      title: "Envoyer",
      subtitle: "Photos que vous avez envoyees",
      label: `photo de ${displayName}`,
      items: getVisibleSentPhotos()
    },
    trash: {
      title: "Corbeille",
      subtitle: "Photos supprimees",
      label: "photo supprimer",
      items: deletedPhotos
    },
    photo: {
      title: "Photo",
      subtitle: "Photos prises sur cet appareil",
      label: "photo non supprimer",
      items: photos
    }
  };

  return folders[view] || folders.received;
}

function createFolderNav(view) {
  const visibleSentPhotos = getVisibleSentPhotos();
  const folderItems = [
    ["received", "Recue", receivedPhotos.length],
    ["send", "Envoyer", visibleSentPhotos.length],
    ["trash", "Corbeille", deletedPhotos.length],
    ["photo", "Photo", photos.length]
  ];

  return `
    <div class="mailbox-brand">
      <strong>PhotoCours</strong>
      <span>${localStorage.getItem(SESSION_KEY) || "non connecte"}</span>
    </div>
    <nav class="mailbox-nav" aria-label="Dossiers PhotoCours">
      ${folderItems.map(([key, label, count]) => `
        <button class="mailbox-nav-item ${view === key ? "is-active" : ""}" type="button" data-folder="${key}">
          <span>${label}</span>
          <strong>${count}</strong>
        </button>
      `).join("")}
    </nav>
  `;
}

function createPrintPickerItems(items) {
  if (!items.length) {
    return `<p class="folder-empty">Aucune photo a imprimer.</p>`;
  }

  return items.map((photo, index) => `
    <label class="print-picker-item">
      <input type="checkbox" value="${index}" checked>
      <img src="${photo.dataUrl}" alt="Photo ${index + 1}">
      <span>
        <strong>${photo.course || `Photo ${index + 1}`}</strong>
        <small>${formatBytes(photo.size)}</small>
      </span>
    </label>
  `).join("");
}

function getCurrentDisplayPseudo() {
  return getCurrentPseudo() || "moi";
}

function getPhotoSender(photo, view) {
  if (photo.sender) return photo.sender;
  if (view === "send") return getSenderName();
  return "inconnu";
}

function getPhotoRecipient(photo, view) {
  if (photo.recipient) return photo.recipient;
  if (photo.recipientPseudo) return photo.recipientPseudo;
  if (view === "received") return getCurrentDisplayPseudo();
  return "inconnu";
}

function getMailboxDownloadName(photo, index) {
  if (photo.fileName) return photo.fileName;

  const course = (photo.course || courseInput.value.trim() || "photo")
    .replace(/[^a-z0-9-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return `${course || "photo"}-${index + 1}.png`;
}

function createMailboxRows(items, label, view) {
  if (!items.length) {
    return `<p class="folder-empty">Aucune photo dans ce dossier.</p>`;
  }

  return items.map((photo, index) => {
    const course = photo.course || courseInput.value.trim() || `Photo ${index + 1}`;
    const sender = getPhotoSender(photo, view);
    const recipient = getPhotoRecipient(photo, view);
    const date = photo.deliveredAt || photo.sentAt || photo.deletedAt || "";
    const dateLabel = date ? new Date(date).toLocaleDateString("fr-FR") : "aujourd'hui";

    return `
      <article class="mailbox-row ${index === 0 ? "is-selected" : ""}">
        <button class="mailbox-row-open" type="button" data-photo-src="${photo.dataUrl}">
          <img src="${photo.dataUrl}" alt="${label} ${index + 1}">
          <span class="mailbox-row-main">
            <strong>${course}</strong>
            <small>De : ${sender} - A : ${recipient}</small>
          </span>
          <span class="mailbox-row-meta">
            <strong>${formatBytes(photo.size)}</strong>
            <small>${dateLabel}</small>
          </span>
        </button>
        <span class="mailbox-actions">
          <button class="mailbox-download" type="button" data-download-photo data-index="${index}" aria-label="Telecharger">&#8595;</button>
          <button class="mailbox-more" type="button" data-toggle-menu aria-label="Options">...</button>
          <span class="mailbox-menu">
            <button type="button" data-delete-photo data-folder="${view}" data-index="${index}">
              ${view === "trash" ? "Supprimer definitivement" : "Mettre dans la corbeille"}
            </button>
          </span>
        </span>
      </article>
    `;
  }).join("");
}

function downloadMailboxPhoto(view, index) {
  const photo = getFolderPhotos(view)[index];
  if (!photo) return;

  const link = document.createElement("a");
  link.href = photo.dataUrl;
  link.download = getMailboxDownloadName(photo, index);
  link.click();
  setStatus("Photo telechargee.");
}

function openPrintPicker(view) {
  const items = getFolderPhotos(view);
  if (!items.length) {
    setStatus("Aucune photo a imprimer dans cette categorie.");
    return;
  }

  activeFolderView = view;
  printPickerList.innerHTML = createPrintPickerItems(items);
  if (printPickerDialog.showModal) {
    printPickerDialog.showModal();
    return;
  }

  printPickerDialog.setAttribute("open", "");
}

function closePrintPicker() {
  printPickerDialog.close?.();
  printPickerDialog.removeAttribute("open");
}

function getA4PrintHtml(items, title = "Impression PhotoCours") {
  return `
    <!doctype html>
    <html lang="fr">
      <head>
        <title>${title}</title>
        <style>
          @page { size: A4 portrait; margin: 0; }
          * { box-sizing: border-box; }
          html, body { margin: 0; background: #fff; }
          .sheet {
            display: grid;
            place-items: center;
            width: 210mm;
            height: 297mm;
            page-break-after: always;
            break-after: page;
            overflow: hidden;
            background: #fff;
          }
          .sheet:last-child {
            page-break-after: auto;
            break-after: auto;
          }
          img {
            display: block;
            max-width: 210mm;
            max-height: 297mm;
            width: auto;
            height: auto;
            object-fit: contain;
          }
          @media screen {
            body { background: #e8edf4; }
            .sheet {
              margin: 16px auto;
              box-shadow: 0 12px 35px rgba(31, 42, 68, 0.18);
            }
          }
        </style>
      </head>
      <body>
        ${items.map((photo, index) => `
          <section class="sheet">
            <img src="${photo.dataUrl}" alt="Photo ${index + 1}">
          </section>
        `).join("")}
        <script>
          window.onload = () => window.print();
        <\/script>
      </body>
    </html>
  `;
}

function printSelectedFolderPhotos() {
  const selectedIndexes = Array.from(printPickerList.querySelectorAll("input:checked"))
    .map((input) => Number(input.value));
  const items = getFolderPhotos(activeFolderView);
  const selectedPhotos = selectedIndexes.map((index) => items[index]).filter(Boolean);

  if (!selectedPhotos.length) {
    setStatus("Selectionnez au moins une photo a imprimer.");
    return;
  }

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    setStatus("Autorisez les fenetres pop-up pour imprimer.");
    return;
  }

  printWindow.document.write(getA4PrintHtml(selectedPhotos));
  printWindow.document.close();
  closePrintPicker();
}

async function deletePhotoFromServer(photo, permanent = false) {
  const pseudo = getCurrentPseudo();
  if (!photo.id || !pseudo) return true;

  const response = await fetch(`/api/photo?id=${encodeURIComponent(photo.id)}&pseudo=${encodeURIComponent(pseudo)}&permanent=${permanent ? "1" : "0"}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    setStatus(await getApiMessage(response));
    return false;
  }

  return true;
}

async function deletePhotoAt(view, index) {
  const folders = {
    received: receivedPhotos,
    send: getVisibleSentPhotos(),
    trash: deletedPhotos,
    photo: photos
  };
  const list = folders[view];
  const photo = list?.[index];
  if (!photo) return;

  if (view === "received") {
    const deleted = await deletePhotoFromServer(photo, false);
    if (!deleted) return;
    receivedPhotos.splice(index, 1);
    deletedPhotos = [{ ...photo, deletedAt: new Date().toISOString() }, ...deletedPhotos];
  }

  if (view === "send") {
    const realIndex = sentPhotos.indexOf(photo);
    if (realIndex >= 0) {
      sentPhotos.splice(realIndex, 1);
    }
    deletedPhotos = [{ ...photo, deletedAt: new Date().toISOString() }, ...deletedPhotos];
  }

  if (view === "trash") {
    if (photo.id) {
      const deleted = await deletePhotoFromServer(photo, true);
      if (!deleted) return;
    }
    deletedPhotos.splice(index, 1);
  }

  if (view === "photo") {
    deletedPhotos = [{ ...photo, deletedAt: new Date().toISOString() }, ...deletedPhotos];
    photos.splice(index, 1);
    renderPhotos();
  }

  updateQuickBadges();
  setStatus(view === "trash" ? "Photo supprimee definitivement." : "Photo mise dans la corbeille.");
  openFolderView(view);
}

function createFolderPreview(info, view) {
  const firstPhoto = info.items[0];

  if (!firstPhoto) {
    return `
      <aside class="folder-preview">
        <h3>Apercu</h3>
        <p>Selectionnez une photo pour la voir ici.</p>
      </aside>
    `;
  }

  const sender = getPhotoSender(firstPhoto, view);
  const recipient = getPhotoRecipient(firstPhoto, view);

  return `
    <aside class="folder-preview">
      <h3>${firstPhoto.course || info.title}</h3>
      <button class="folder-preview-photo" type="button" data-photo-src="${firstPhoto.dataUrl}">
        <img src="${firstPhoto.dataUrl}" alt="${info.label}">
      </button>
      <dl>
        <div><dt>Taille</dt><dd>${formatBytes(firstPhoto.size)}</dd></div>
        <div><dt>De</dt><dd>${sender}</dd></div>
        <div><dt>A</dt><dd>${recipient}</dd></div>
      </dl>
      <p>${firstPhoto.message || "Aucun message."}</p>
    </aside>
  `;
}

function openFolderView(view) {
  const info = getFolderInfo(view);
  activeFolderView = view;

  folderView.hidden = false;
  document.body.classList.add("is-folder-open");
  folderSide.innerHTML = createFolderNav(view);
  folderContent.innerHTML = `
    <section class="mailbox-list">
      <header class="mailbox-header">
        <div>
          <h2>${info.title}</h2>
          <p>${info.subtitle}</p>
        </div>
        <div class="mailbox-header-actions">
          <strong>${info.items.length} photo${info.items.length > 1 ? "s" : ""}</strong>
          <button class="mailbox-print" type="button" data-print-folder="${view}" ${info.items.length ? "" : "disabled"}>Imprimer</button>
        </div>
      </header>
      <div class="mailbox-rows">
        ${createMailboxRows(info.items, info.label, view)}
      </div>
    </section>
    ${createFolderPreview(info, view)}
  `;
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
    setStatus("Le partage de plusieurs photos n'est pas disponible sur ce navigateur. Telechargez les photos puis envoyez-les avec l'application de votre choix.");
    return;
  }

  try {
    await navigator.share({
      files,
      title: course ? `Photo de cours - ${course}` : "Photo de cours",
      text: `${messageInput.value.trim() || "Bonjour, voici la photo de mon cours a imprimer."}\n\n${photos.length} photo${photos.length > 1 ? "s" : ""} - ${formatBytes(getTotalBytes())}`
    });
    rememberSentPhotos("partage");
    setStatus("Partage ouvert. Choisissez l'application pour envoyer les photos.");
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

  printWindow.document.write(getA4PrintHtml(photos, "Impression du cours"));
  printWindow.document.close();
}

async function sendEmail(event) {
  event.preventDefault();

  if (!photos.length) {
    setStatus("Ajoutez une photo avant d'envoyer.");
    return;
  }

  const recipientPseudo = emailInput.value.trim();
  if (!recipientPseudo) {
    setStatus("Entrez un pseudo de reception.");
    emailInput.focus();
    return;
  }

  if (getTotalBytes() > SERVER_SEND_LIMIT_BYTES) {
    setStatus(`Envoi trop lourd: ${formatBytes(getTotalBytes())} / ${formatBytes(SERVER_SEND_LIMIT_BYTES)}. Supprimez une photo ou envoyez en plusieurs fois.`);
    return;
  }

  const message = messageInput.value.trim();
  const course = courseInput.value.trim();
  const sender = senderInput.value.trim() || localStorage.getItem(SESSION_KEY) || "";
  const senderEmail = localStorage.getItem(SESSION_KEY) || "";
  const formData = new FormData();

  formData.append("recipientPseudo", recipientPseudo);
  formData.append("senderName", sender);
  formData.append("senderEmail", senderEmail);
  formData.append("course", course);
  formData.append("message", message);
  getPhotoFiles().forEach((file) => formData.append("photos", file));

  setStatus("Envoi en cours...");

  try {
    const response = await fetch("/api/send", {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      setStatus(await getApiMessage(response));
      if (response.status === 404) emailInput.focus();
      return;
    }

    const result = await response.json();
    rememberSentPhotos(recipientPseudo);
    setStatus(`${result.count} photo${result.count > 1 ? "s envoyees" : " envoyee"} sur le site a ${recipientPseudo}.`);
    openFolderView("send");
  } catch (error) {
    setStatus("Envoi impossible. Verifiez que la base D1 est bien branchee au site.");
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
folderContent.addEventListener("click", (event) => {
  const printButton = event.target.closest("[data-print-folder]");
  if (printButton) {
    openPrintPicker(printButton.dataset.printFolder);
    return;
  }

  const downloadButton = event.target.closest("[data-download-photo]");
  if (downloadButton) {
    downloadMailboxPhoto(activeFolderView, Number(downloadButton.dataset.index));
    return;
  }

  const deleteButton = event.target.closest("[data-delete-photo]");
  if (deleteButton) {
    deletePhotoAt(deleteButton.dataset.folder, Number(deleteButton.dataset.index));
    return;
  }

  const menuButton = event.target.closest("[data-toggle-menu]");
  if (menuButton) {
    const actions = menuButton.closest(".mailbox-actions");
    const wasOpen = actions.classList.contains("is-open");
    document.querySelectorAll(".mailbox-actions.is-open").forEach((item) => item.classList.remove("is-open"));
    actions.classList.toggle("is-open", !wasOpen);
    return;
  }

  const card = event.target.closest(".folder-photo-card, .mailbox-row-open, .folder-preview-photo");
  if (!card) return;
  openPhotoDialog(card.dataset.photoSrc);
});
closePhotoDialogButton.addEventListener("click", closePhotoDialog);
closePrintPickerButton.addEventListener("click", closePrintPicker);
selectAllPrintPhotosButton.addEventListener("click", () => {
  printPickerList.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.checked = true;
  });
});
printSelectedPhotosButton.addEventListener("click", printSelectedFolderPhotos);
siteNoticeOpenButton.addEventListener("click", () => {
  siteNotice.hidden = true;
  openFolderView(siteNoticeFolder);
  if (siteNoticeFolder === "received") {
    loadReceivedPhotosFromServer();
  }
  if (siteNoticeFolder === "trash") {
    loadTrashPhotosFromServer();
  }
});
siteNoticeCloseButton.addEventListener("click", () => {
  siteNotice.hidden = true;
});

folderSide.addEventListener("click", (event) => {
  const button = event.target.closest("[data-folder]");
  if (!button) return;

  openFolderView(button.dataset.folder);
  if (button.dataset.folder === "received") {
    loadReceivedPhotosFromServer();
  }
  if (button.dataset.folder === "trash") {
    loadTrashPhotosFromServer();
  }
});

quickReceivedButton.addEventListener("click", () => {
  openFolderView("received");
  loadReceivedPhotosFromServer();
});

quickSendButton.addEventListener("click", () => {
  openFolderView("send");
});

quickTrashButton.addEventListener("click", () => {
  openFolderView("trash");
  loadTrashPhotosFromServer();
});

quickPhotoButton.addEventListener("click", () => {
  openFolderView("photo");
});

backToMainButton.addEventListener("click", closeFolderView);
openLoginButton.addEventListener("click", openLoginView);
closeLoginButton.addEventListener("click", closeLoginView);
loginForm.addEventListener("submit", handleLogin);

loadConnectedEmail();
loadReceivedPhotosFromServer();
loadTrashPhotosFromServer();
updateQuickBadges();

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
