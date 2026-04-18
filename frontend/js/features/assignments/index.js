export function mountAssignmentFeature(container) {
  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="placeholder-page">
      <div class="placeholder-card">
        <h3>Assignments page placeholder</h3>
        <p>Ready for a dedicated assignment list, edit flow, filters, and future CRUD screens.</p>
      </div>
    </div>
  `;
}
