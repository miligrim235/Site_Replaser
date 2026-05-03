chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    return new Promise(async (resolve) => {
      // Проверка на необходимость подмены
      const { rules = [] } = await chrome.storage.sync.get(['rules']);
      const currentUrl = new URL(details.url).hostname;
      const activeRule = rules.find(rule =>
        rule.enabled &&
        currentUrl.includes(rule.originalUrl.replace(/^https?:\/\//, ''))
      );

      if (activeRule && details.type === 'main_frame') {
        resolve({ cancel: true }); 
      } else {
        resolve({ cancel: false });
      }
    });
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);

// Исполнение запросов из content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchResource') {
    chrome.storage.local.get(request.url)
      .then(text => sendResponse(text[request.url]))
      .catch(error => {
       console.error('Fetch error:', error);
        sendResponse(`/* Error loading ${request.url} */`);
      }); 
    return true; // Указываем, что ответ будет отправлен асинхронно
  } else  if (request.action === 'executeScript') {
    const tabId = sender.tab.id; 
    chrome.storage.local.get(request.url)
      .then(code => executeUserCode(tabId, code[request.url]));
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (changes.root) {
    SyncRules();
  }
});

async function executeUserCode(tabId, code) {
  console.log(code);
  await chrome.scripting.executeScript({
    target: { tabId: tabId },
    world: 'MAIN', // Критически важно: это дает доступ к window страницы
    func: (codeToRun) => {
      try {
        new Function(codeToRun)();
      } catch (e) {
        console.error('Ошибка в пользовательском скрипте:', e);
      }
    },
    args: [code] // Передаем строку кода как аргумент
  });
}


/**
 * @param {string} url
 */
function SheetLinkConverter(url) {
  console.log(url);
  const regex = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
  const match = url.match(regex);
  return match ? "https://docs.google.com/spreadsheets/export?exportFormat=csv&id=" + match[1] : url;
}

/**
 * @param {string} url
 */
function googleDriveLinkConverter(url) {
  const pattern = /^https:\/\/drive\.google\.com\/file\/d\/[a-zA-Z0-9_-]+\/view\?usp=drive_link$/;
  if (!pattern.test(url)) {
    return url;
  } else {
    return `https://drive.google.com/uc?export=download&id=${url.split('/d/')[1].split('/')[0]}`;
  }
}6
/**
 * @param {string} rawUrl
 */
async function SyncRules() {
  console.log("sync rools start");
  // получение данных
  const rawUrl = await chrome.storage.sync.get("root");  
  if (!rawUrl.root) {return};
  const url = SheetLinkConverter(rawUrl.root);
  console.log(url);
  const csv = await fetch(url)
    .then(response => response.text())
    .then(text => text.split("\r\n").map(x => x.split(",").map(googleDriveLinkConverter)));
  console.log(csv);
  console.log("on");
  // создание итогового массива
  let rules = [];
  csv.forEach(x => {
    const newRule = {
      id: parseInt(x[0]),
      url: x[1],
      htmlUrl: x[2],
      jsUrls: x[3],
      enabled: x[4] == "1",
      version: parseInt(x[5])
    };
    rules.push(newRule);
  });
  // Синхронизация файлов и DNR
  console.log("sync rools end");
  const oldRules = await chrome.storage.sync.get("rules").then(r => r.rules);
  SyncFiles(rules, oldRules); 
  syncDNR(rules, oldRules);
  // Обновление данных
  chrome.storage.sync.set({"rules": rules});
}

SyncRules();
setInterval(SyncRules, 900000);

async function SyncFiles(rules, oldRules) {
  console.log("sync files start");
  rules.forEach(rule => {
    const oldRule = oldRules === null ? oldRules.find(r => r.id == rule.id) : null;
    if (!oldRule || rule.version > oldRule.version) {
      Promise.all([fetch(rule.htmlUrl).then(response => response.text()), fetch(rule.jsUrls).then(response => response.text())])
      .then((files) => chrome.storage.local.set({[rule.htmlUrl]: files[0], [rule.jsUrls]: files[1]}));
    }
  });
  console.log("sync files end");
}

let firstStart = true; // Флаг состояния

async function syncDNR(rules, oldRules) {
  const idsToRemove = [];
  const rulesToAdd = [];

  if (firstStart) {
    // Сценарий первого запуска: добавляем всё из rules
    for (const rule of rules) {
      rulesToAdd.push(createRuleObject(rule.id, rule.url));
    }
    firstStart = false; // Устанавливаем флаг после формирования списка
  } else {
    // Сценарий последующих вызовов: дифференциальное обновление
    const oldRulesMap = new Map(oldRules.map(r => [r.id, r.url]));
    const newRulesMap = new Map(rules.map(r => [r.id, r.url]));

    // Ищем, что удалить или обновить
    for (const [id, oldUrl] of oldRulesMap) {
      const newUrl = newRulesMap.get(id);
      if (!newUrl || newUrl !== oldUrl) {
        idsToRemove.push(id);
      }
    }

    // Ищем, что добавить
    for (const [id, newUrl] of newRulesMap) {
      const oldUrl = oldRulesMap.get(id);
      if (!oldUrl || oldUrl !== newUrl) {
        rulesToAdd.push(createRuleObject(id, newUrl));
      }
    }
  }

  // Применяем изменения
  if (idsToRemove.length > 0 || rulesToAdd.length > 0) {
    try {
      await chrome.declarativeNetRequest.updateSessionRules({
        removeRuleIds: idsToRemove,
        addRules: rulesToAdd
      });
      console.log(`[DNR] Синхронизация завершена. Удалено: ${idsToRemove.length}, Добавлено: ${rulesToAdd.length}`);
    } catch (err) {
      console.error("[DNR] Ошибка обновления:", err);
    }
  }
}

/**
 * Вспомогательная функция для создания объекта правила
 */
function createRuleObject(id, url) {
  const domain = new URL(url).hostname;
  return {
    id: id,
    priority: 1,
    action: {
      type: "modifyHeaders",
      responseHeaders: [
        { header: "content-security-policy", operation: "remove" },
        { header: "x-content-security-policy", operation: "remove" },
        { header: "content-security-policy-report-only", operation: "remove" }
      ]
    },
    condition: {
      urlFilter: `^${domain}/*`,
      resourceTypes: ["main_frame", "sub_frame"]
    }
  };
}

