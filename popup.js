document.addEventListener('DOMContentLoaded', () => {
  const rootUrlInput = document.getElementById('root-url');
  const updateRootUrl = document.getElementById('update-root-url');
  chrome.storage.sync.get(['rules'], (data) => {
    const rules = data.rules || [];
    renderRules(rules);
  });

  updateRootUrl.addEventListener("click", () => {
    const root = rootUrlInput.value.trim();
    chrome.storage.sync.set({ root });
  });
  
  function renderRules(rules) {
    rulesList.innerHTML = '';
    rules.forEach(rule => {
      const ruleElement = document.createElement('div');
      ruleElement.className = `rule ${!rule.enabled ? 'disabled' : ''}`;
      ruleElement.innerHTML = `
        <p><strong>${rule.url}</strong> → ${rule.htmlUrl}</p>
        <p>CSS: ${rule.cssUrls.join(', ')}</p>
        <p>JS: ${rule.jsUrls.join(', ')}</p>
        <button class="toggle" data-id="${rule.id}">
          ${rule.enabled ? 'Disable' : 'Enable'}
        </button>
        <button class="delete" data-id="${rule.id}">Delete</button>
      `;
      rulesList.appendChild(ruleElement);
    });

    // Обработчики кнопок
    document.querySelectorAll('.toggle').forEach(button => {
      button.addEventListener('click', () => {
        const ruleId = parseInt(button.getAttribute('data-id'));
        chrome.storage.sync.get(['rules'], (data) => {
          const rules = data.rules || [];
          const ruleIndex = rules.findIndex(r => r.id === ruleId);
          if (ruleIndex !== -1) {
            rules[ruleIndex].enabled = !rules[ruleIndex].enabled;
            chrome.storage.sync.set({ rules }, () => {
              renderRules(rules);
            });
          }
        });
      });
    });

    document.querySelectorAll('.delete').forEach(button => {
      button.addEventListener('click', () => {
        const ruleId = parseInt(button.getAttribute('data-id'));
        chrome.storage.sync.get(['rules'], (data) => {
          const rules = data.rules || [];
          const updatedRules = rules.filter(r => r.id !== ruleId);
          chrome.storage.sync.set({ rules: updatedRules }, () => {
            renderRules(updatedRules);
          });
        });
      });
    });
  }
});