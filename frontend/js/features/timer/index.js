export function mountTimerFeature(container) {
  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="placeholder-page">
      <div class="placeholder-card">
        <h3>Pomodoro page placeholder</h3>
        <p>Ready for timer controls, break cycles, progress charts, and completed-session history.</p>
      </div>
    </div>
  `;
}
