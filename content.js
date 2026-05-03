(async () => {
  // Проверка на необходимость подмены
  const currentUrl = window.location.href;
  const rules = await chrome.storage.sync.get(["rules"]).then(rules => rules["rules"]);
  console.log(rules);
  console.log(currentUrl);
  const activeRule = rules.find(rule =>
    rule.enabled && currentUrl.includes(rule.url)
  );
  console.log(activeRule);
  if (!activeRule) return;

  // Очистка страницы
  document.documentElement.innerHTML = '';

  console.log("Start html request");
  // Запрашиваем HTML через background script
  const htmlText = await chrome.runtime.sendMessage({
    action: 'fetchResource',
    url: activeRule.htmlUrl
  });
  console.log("End html request");
  console.log(htmlText);
  document.open();
  document.write(htmlText);
  document.close();

  // Загружаем JS
  console.log("Start js request");
  console.log(activeRule.jsUrls);
  chrome.runtime.sendMessage({
    action: 'executeScript',
    url: activeRule.jsUrls
  });
  console.log("End js request");
})();