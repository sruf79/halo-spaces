/* halo.spaces – Brücke in den Import-Assistenten (about:import).
 *
 * Wird von PstImport.hookWizard per loadSubScript in das Fenster des
 * Assistenten geladen und sieht dort dessen let/const (Steps, showTab,
 * restart, ImporterController), die von außen nicht erreichbar sind. */
/* global Steps, showTab, restart, ImporterController */
window.__haloImportBridge = {
  steps: () => Steps,
  showTab: (...args) => showTab(...args),
  restart: () => restart(),
  notifications: () => ImporterController.notificationBox,
};
