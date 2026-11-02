browser.mailCards.start({
  version: browser.runtime.getManifest().version,
});

// Update nicht im laufenden Betrieb einspielen (sonst stellt halo.spaces kurz
// alles zurück, bis die neue Version läuft): Thunderbird hält es dann bis zum
// nächsten Start zurück, halo.spaces zeigt einen Hinweis (roter Punkt)
browser.runtime.onUpdateAvailable.addListener(details => {
  browser.mailCards.updateReady(details.version);
});
