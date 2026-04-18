export function mountTimerFeature(container) {
  if (!container) {
    return;
  }

  const note = document.createElement("div");
  note.className = "feature-note";
  note.textContent = "Ready for Pomodoro/progress implementation.";
  container.append(note);
}
