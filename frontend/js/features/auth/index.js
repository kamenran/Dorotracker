export function mountAuthFeature(container) {
  if (!container) {
    return;
  }

  const note = document.createElement("div");
  note.className = "feature-note";
  note.textContent = "Ready for auth/account implementation.";
  container.append(note);
}
