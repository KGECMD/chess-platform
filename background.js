/** Background service worker - routes messages between content scripts and engine */

let offscreenReady = false;
let pendingRequests = new Map();
let requestId = 0;

async function ensureOffscreen() {
  if (offscreenReady) return;
  try {
    const exists = await chrome.offscreen.hasDocument();
    if (exists) {
      offscreenReady = true;
      return;
    }
  } catch (_) {}
  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['WORKERS'],
    justification: 'Run chess analysis engine in a worker'
  });
  offscreenReady = true;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'ANALYZE') {
    handleAnalysis(msg, sendResponse);
    return true;
  }
  if (msg.type === 'ENGINE_RESULT') {
    const pending = pendingRequests.get(msg.requestId);
    if (pending) {
      pending(msg.data);
      pendingRequests.delete(msg.requestId);
    }
    return false;
  }
  if (msg.type === 'GET_SETTINGS') {
    chrome.storage.local.get({
      enabled: true,
      autoMove: false,
      showArrows: true,
      engineDepth: 18,
      useStockfish: true,
      humanize: true,
      minDelay: 800,
      maxDelay: 3500,
      showEval: true,
      multiPv: 1,
      strength: 100
    }, sendResponse);
    return true;
  }
  if (msg.type === 'SAVE_SETTINGS') {
    chrome.storage.local.set(msg.settings, () => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

async function handleAnalysis(msg, sendResponse) {
  try {
    await ensureOffscreen();
    const id = ++requestId;
    pendingRequests.set(id, sendResponse);

    chrome.runtime.sendMessage({
      type: 'RUN_ENGINE',
      requestId: id,
      fen: msg.fen,
      depth: msg.depth || 18,
      multiPv: msg.multiPv || 1,
      useStockfish: msg.useStockfish !== false
    });

    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.get(id)({ error: 'timeout' });
        pendingRequests.delete(id);
      }
    }, 30000);
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    enabled: true,
    autoMove: false,
    showArrows: true,
    engineDepth: 18,
    useStockfish: true,
    humanize: true,
    minDelay: 800,
    maxDelay: 3500,
    showEval: true,
    multiPv: 1,
    strength: 100
  });
});
