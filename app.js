const input = document.querySelector("#photos");
const email = document.querySelector("#email");
const subject = document.querySelector("#subject");
const shareButton = document.querySelector("#share");
const clearButton = document.querySelector("#clear");
const preview = document.querySelector("#preview");
const count = document.querySelector("#count");
const statusText = document.querySelector("#status");
const template = document.querySelector("#photo-card-template");

let photos = [];
let nextId = 1;

function updateStatus() {
  const total = photos.length;
  count.textContent = String(total);
  shareButton.disabled = total === 0;
  clearButton.disabled = total === 0;
  statusText.textContent = total === 0
    ? "Aucune photo ajoutee pour le moment."
    : `${total} page${total > 1 ? "s" : ""} prete${total > 1 ? "s" : ""} a envoyer.`;
}

function renderPhotos() {
  preview.innerHTML = "";

  photos.forEach((photo, index) => {
    const card = template.content.firstElementChild.cloneNode(true);
    const image = card.querySelector("img");
    const label = card.querySelector("span");
    const remove = card.querySelector("button");

    image.src = URL.createObjectURL(photo.file);
    image.alt = `Page ${index + 1}`;
    image.onload = () => URL.revokeObjectURL(image.src);
    label.textContent = `Page ${index + 1}`;
    remove.addEventListener("click", () => {
      photos = photos.filter((item) => item.id !== photo.id);
      renderPhotos();
    });

    preview.append(card);
  });

  updateStatus();
}

function addPhotos(files) {
  const imageFiles = [...files].filter((file) => file.type.startsWith("image/"));
  const newPhotos = imageFiles.map((file) => ({
    id: `${Date.now()}-${nextId++}-${file.name}-${file.size}`,
    file,
  }));

  photos = [...photos, ...newPhotos];
  renderPhotos();
  input.value = "";
}

async function sharePhotos() {
  if (photos.length === 0) return;

  const recipient = email.value.trim();
  const mailSubject = subject.value.trim() || "Mes cours a imprimer";
  const files = photos.map((photo, index) => {
    const extension = photo.file.name.split(".").pop() || "jpg";
    return new File([photo.file], `cours-page-${index + 1}.${extension}`, {
      type: photo.file.type || "image/jpeg",
    });
  });

  const shareData = {
    title: mailSubject,
    text: recipient
      ? `A envoyer a : ${recipient}\n\nVoici mes cours a imprimer.`
      : "Voici mes cours a imprimer.",
    files,
  };

  if (navigator.canShare && navigator.canShare({ files })) {
    try {
      await navigator.share(shareData);
      statusText.textContent = "Partage ouvert. Choisis ton application email pour envoyer les photos.";
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }

  files.forEach((file) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(file);
    link.download = file.name;
    link.click();
    URL.revokeObjectURL(link.href);
  });

  const body = encodeURIComponent(
    "Les photos viennent d'etre telechargees. Ajoute-les en pieces jointes avant d'envoyer le message."
  );
  const url = `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(mailSubject)}&body=${body}`;
  window.location.href = url;
  statusText.textContent = "Les photos ont ete telechargees. Ajoute-les au mail si ton telephone ne l'a pas fait automatiquement.";
}

input.addEventListener("change", (event) => addPhotos(event.target.files));
shareButton.addEventListener("click", sharePhotos);
clearButton.addEventListener("click", () => {
  photos = [];
  renderPhotos();
});

updateStatus();
