/** Popup controller - manages settings UI */

const FIELDS = [
  'enabled', 'autoMove', 'showArrows', 'engineDepth', 'useStockfish',
  'humanize', 'minDelay', 'maxDelay', 'showEval', 'multiPv', 'strength'
];

const CHECKBOXES = ['enabled', 'autoMove', 'showArrows', 'useStockfish', 'humanize', 'showEval'];
const RANGES = { engineDepth: 'depthVal', multiPv: 'pvVal', strength: 'strengthVal' };

function loadSettings() {
  const defaults = {
    enabled: true, autoMove: false, showArrows: true, engineDepth: 18,
    useStockfish: true, humanize: true, minDelay: 800, maxDelay: 3500,
    showEval: true, multiPv: 1, strength: 100
  };
  chrome.storage.local.get(defaults, (settings) => {
    if (chrome.runtime.lastError || !settings) return;
    for (const field of FIELDS) {
      const el = document.getElementById(field);
      if (!el) continue;
      if (CHECKBOXES.includes(field)) {
        el.checked = settings[field];
      } else {
        el.value = settings[field];
      }
    }
    for (const [id, display] of Object.entries(RANGES)) {
      const el = document.getElementById(display);
      if (el) el.textContent = document.getElementById(id).value;
    }
  });
}

function saveSettings() {
  const settings = {};
  for (const field of FIELDS) {
    const el = document.getElementById(field);
    if (!el) continue;
    if (CHECKBOXES.includes(field)) {
      settings[field] = el.checked;
    } else if (el.type === 'range' || el.type === 'number') {
      settings[field] = parseInt(el.value);
    } else {
      settings[field] = el.value;
    }
  }

  chrome.storage.local.set(settings);

  // Notify content scripts
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'SETTINGS_UPDATED',
        settings
      });
    }
  });

  document.getElementById('status').textContent = 'Settings saved';
  setTimeout(() => {
    document.getElementById('status').textContent = 'Ready';
  }, 1500);
}

// Bind event listeners
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();

  for (const field of FIELDS) {
    const el = document.getElementById(field);
    if (!el) continue;
    el.addEventListener('change', saveSettings);
    el.addEventListener('input', () => {
      // Update range display values
      for (const [id, display] of Object.entries(RANGES)) {
        if (field === id) {
          document.getElementById(display).textContent = el.value;
        }
      }
    });
  }
});
