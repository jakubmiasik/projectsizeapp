(function () {
  'use strict';
  const esc = value => String(value).replace(/[&<>"']/g, c =>
    ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  let recipe, root;
  const input = (field, value, type = 'text') =>
    `<input data-field="${field}" type="${type}" value="${esc(value)}"${type === 'number' ? ' min="0" step="0.01"' : ''} aria-label="${field}">`;
  function collect() {
    const config = structuredClone(recipe);
    config.pmPercent = Number(root.querySelector('[data-global="pmPercent"]').value);
    config.productivePercent = Number(root.querySelector('[data-global="productivePercent"]').value);
    root.querySelectorAll('[data-recipe-section]').forEach(block => {
      const section = config.sections.find(s => s.id === block.dataset.recipeSection);
      section.title = block.querySelector('[data-field="title"]').value;
      block.querySelectorAll('[data-choice]').forEach(row => {
        const o = section.options[Number(row.dataset.choice)];
        row.querySelectorAll('[data-field]').forEach(el => {
          o[el.dataset.field] = el.type === 'number' ? Number(el.value) : el.value;
        });
      });
    });
    Object.keys(SizingRecipe.types).forEach(key => {
      config.projectTypes[key] = [...root.querySelectorAll('[data-recipe-type]')]
        .filter(el => el.dataset.recipeType === key && el.checked).map(el => el.dataset.section);
    });
    return SizingRecipe.validate(config);
  }
  function render(target, config) {
    root = target; recipe = structuredClone(config);
    root.innerHTML = `
      <p class="modal-copy">High-level sizing is separate from the detailed activity rate card.
      Each choice adds fixed hours plus a percentage of another included section's base hours.
      Section uplifts and safety buffer apply next, then PM. Excluded dependencies contribute zero.
      Saved sizing versions retain their recipe, these defaults apply to new sizings.</p>
      <div class="sizing-recipe-globals">
        <label>PM uplift (%) <input type="number" min="0" max="500" step="0.1" data-global="pmPercent" value="${recipe.pmPercent}"></label>
        <label>Productive time (%) <input type="number" min="1" max="100" step="1" data-global="productivePercent" value="${recipe.productivePercent}"></label>
      </div>
      <div class="sizing-recipe-scroll"><table class="admin-cal-table">
        <thead><tr><th>Include section</th>${Object.values(SizingRecipe.types).map(name => `<th>${esc(name)}</th>`).join('')}</tr></thead>
        <tbody>${recipe.sections.map(s => `<tr><th>${esc(s.title)}</th>${Object.keys(SizingRecipe.types).map(key =>
          `<td><input type="checkbox" data-recipe-type="${key}" data-section="${s.id}"${recipe.projectTypes[key].includes(s.id) ? ' checked' : ''} aria-label="${esc(SizingRecipe.types[key] + ': ' + s.title)}"></td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>
      ${recipe.sections.map(s => `<details class="admin-cal-group" data-recipe-section="${s.id}">
        <summary>${esc(s.title)}</summary>
        <label>Section title ${input('title', s.title)}</label>
        <div class="sizing-recipe-scroll"><table class="admin-cal-table">
          <thead><tr><th>Choice</th><th>Description</th><th>Fixed hours</th><th>Dependent section</th><th>% of base hours</th></tr></thead>
          <tbody>${s.options.map((o, i) => `<tr data-choice="${i}">
            <td>${input('label', o.label)}</td><td>${input('sub', o.sub)}</td><td>${input('hours', o.hours, 'number')}</td>
            <td><select data-field="source" aria-label="Dependent section"><option value="">None</option>${recipe.sections.filter(other => other.id !== s.id).map(other =>
              `<option value="${other.id}"${other.id === o.source ? ' selected' : ''}>${esc(other.title)}</option>`).join('')}</select></td>
            <td>${input('percent', o.percent, 'number')}</td></tr>`).join('')}</tbody>
        </table></div><button type="button" class="btn" data-add-choice="${s.id}">Add choice</button>
      </details>`).join('')}
      <button type="button" class="btn" data-add-section>Add sizing section</button>
      <p class="modal-copy">To retire a section, untick it for all types. Choices retain their order so saved selections remain compatible.
      Save defaults below to publish changes.</p>`;
    root.onclick = event => {
      const addChoice = event.target.closest('[data-add-choice]');
      const addSection = event.target.closest('[data-add-section]');
      if (!addChoice && !addSection) return;
      try {
        const next = collect();
        if (addChoice) {
          next.sections.find(s => s.id === addChoice.dataset.addChoice).options.push({
            label: 'New choice', sub: '', hours: 0, source: '', percent: 0
          });
        } else {
          next.sections.push({ id: 'custom_' + crypto.randomUUID().replace(/-/g, ''), title: 'New sizing section', scope: 'custom',
            options: [{label: 'Standard', sub: 'Describe the high-level work included.', hours: 8, source: '', percent: 0},
              {label: 'Not in scope', sub: 'No work in this section.', hours: 0, source: '', percent: 0}] });
        }
        SizingRecipe.validate(next);
        render(root, next);
        const id = addChoice ? addChoice.dataset.addChoice : next.sections.at(-1).id;
        const details = root.querySelector(`[data-recipe-section="${id}"]`);
        details.open = true; details.scrollIntoView({block: 'nearest'});
      } catch (err) {
        AppShell.toast(err.message, 'error');
      }
    };
  }
  window.SizingCalibration = {render, collect};
})();
