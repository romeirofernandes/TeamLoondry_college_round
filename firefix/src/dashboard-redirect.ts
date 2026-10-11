void chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD", hash: location.hash || "#overview" }).then(() => window.close());
