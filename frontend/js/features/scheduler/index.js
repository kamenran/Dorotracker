export function mountSchedulerFeature(container) {
  if (!container) {
    return;
  }

  const note = document.createElement("div");
  note.className = "feature-note";
  note.textContent = "Ready for scheduler/rescheduler implementation.";
  container.append(note);
}
