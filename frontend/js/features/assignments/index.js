export function mountAssignmentFeature(container) {
  if (!container) {
    return;
  }

  const note = document.createElement("div");
  note.className = "feature-note";
  note.textContent = "Ready for assignment CRUD implementation.";
  container.append(note);
}
