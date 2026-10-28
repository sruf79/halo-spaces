// Optionen von halo.spaces – gemeinsam für die Einstellungsseite (options.js)
// und die Suche in Thunderbirds Einstellungen (implementation.js lädt diese
// Datei über resource://mailcards/options/sections.js). t: Übersetzung
"use strict";

// Nur was sich nicht direkt in der Oberfläche einstellen lässt (wie Apple Mail):
// Breite der Mailliste (Trennlinie ziehen, Doppelklick), doppelte Kontakte
// (Adressbuch → Ansicht), Vorschauzeilen (Mail → Ansicht) und Geburtstage
// (Häkchen am Kalender „Geburtstage“ in der Kalenderliste) stehen hier
// bewusst nicht; ihre Prefs bleiben.
// Wenig auf einmal (wie Apple): je Zeile ein kurzer Satz, Einzelheiten im ⓘ
// (info); Zeilen mit showIf: [Schlüssel, Werte …] erscheinen erst, wenn die
// Option davor passt; collapsed: Abschnitt eingeklappt. Keine Gedankenstriche
// in den Texten
var SECTIONS = t => [
  [t("Mail"), [
    { key: "fullConversation", label: t("Show whole conversation"),
      hint: t("Received and sent messages together."), info: t("From all folders. Older read messages are collapsed.") },
    { key: "conversationNewestFirst", showIf: ["fullConversation", true], label: t("Show most recent message at the top") },
    { key: "unreadTint", label: t("Tint unread messages"),
      hint: t("Light accent colour behind unread messages.") },
    { key: "undoSend", type: "select", options: [0, 10, 20, 30], labels: { 0: t("Off") }, unit: t("seconds"),
      label: t("Undo Send"), hint: t("Time to take a sent message back.") },
    { key: "quickReply", label: t("Quick Reply"), hint: t("Reply field below the message."),
      info: t("Sends a short reply without a new window. More opens the full reply.") },
    { key: "senderLogos", label: t("Logos from sender websites"),
      hint: t("Only from the sender’s own website."), info: t("Favicon or BIMI logo of the sender’s domain. Off: no outside requests.") },
    { key: "macContactPhotos", mac: true, label: t("Photos from the Contacts app"),
      hint: t("macOS asks for access once.") },
    { key: "darkMessages", needs: "darkReader", label: t("Dark backgrounds for messages"),
      hint: t("In dark mode."), info: t("Thunderbird recolours HTML messages carefully. Images stay as they are.") },
    { key: "plainTextSystemFont", label: t("Messages in system font"),
      hint: t("Calm and easy to read."), info: t("Messages with their own font keep it. Off: Thunderbird’s fonts.") },
    { key: "hideCollectedAddresses", label: t("Hide “Collected Addresses”"),
      hint: t("In the address book sidebar."), info: t("Completion while writing keeps working.") },
  ]],
  [t("Calendar"), [
    { key: "calendarEmoji", label: t("Emojis before event titles"),
      hint: t("🎂 birthday, 🏋️ training, 🦷 dentist …") },
    { key: "emojiCustom", type: "textarea", showIf: ["calendarEmoji", true], label: t("Own keywords"),
      hint: t("One per line: keyword = emoji. They take precedence."),
      placeholder: t("Book club = 📖\nChoir = 🎶") },
    { key: "weather", label: t("Weather in the Today Pane"),
      hint: t("The symbol next to the title shows the weather."),
      info: t("Asks open-meteo.com about every 30 minutes. Off: the sun stays, no outside requests.") + " " + t("Weather data: Open-Meteo.com, CC BY 4.0") },
    { key: "weatherPlace", type: "place", showIf: ["weather", true], label: t("Place"),
      hint: t("Empty: your current location."), info: t("The system asks for permission once."), placeholder: t("Current location") },
    { key: "calendarOffline", label: t("Offline copy for online calendars"),
      hint: t("Faster loading."), info: t("Re-creates the calendars once.") },
  ]],
  // fünfter Platz der Bereichsleiste: Chat oder (bei Aus) Webseite, Erweiterung oder nichts
  [t("Spaces"), [
    { key: "showChat", type: "chat", label: t("Chat"), hint: t("In the spaces bar.") },
    { key: "fifthSpace", type: "select", options: ["web", "addon", "none"], showIf: ["fifthSpace", "web", "addon", "none"],
      labels: { addon: t("Space of an add-on"), web: t("Website"), none: t("Nothing") },
      label: t("Instead"), hint: t("Only one of them, in the place of Chat.") },
    { key: "fifthSpaceAddon", type: "select", choices: "fifthSpaceAddons", showIf: ["fifthSpace", "addon"],
      label: t("Add-on"), hint: t("Opens unchanged in its own tab.") },
    { key: "fifthSpaceUrl", type: "url", showIf: ["fifthSpace", "web"], label: t("Address"),
      hint: t("Opens like an app."), info: t("No address bar. Links to other sites open in your browser."), placeholder: "https://…" },
    { key: "fifthSpaceIcon", type: "select", options: ["mask", "original"], showIf: ["fifthSpace", "addon", "web"],
      labels: { mask: t("In the space colour"), original: t("Original") },
      label: t("Symbol"), hint: t("Original: unchanged on a white surface.") },
  ]],
  [t("Appearance"), [
    { key: "inlinePrompts", label: t("Dialogs inside the window"),
      hint: t("Questions appear as a sheet at the top."), info: t("Dialogs without title bar. For newly opened windows.") },
    { key: "earlyTheme", label: t("Design without flicker at start"),
      hint: t("From the next start."), info: t("Writes a userChrome.css into your profile.") },
  ]],
  [t("Updates"), [
    { key: "autoUpdate", label: t("Install updates at start"), hint: t("At most every 6 hours."), info: t("Active after a restart.") },
  ]],
  // Fehlerbehebung: nur abschalten, wenn etwas nicht stimmt (eingeklappt)
  [t("Troubleshooting"), [
    { key: "bundledTheme", label: t("halo.spaces design"), hint: t("After a restart.") },
    { key: "appleIcons", label: t("Own icons"), hint: t("After a restart.") },
    { key: "debug", label: t("Detailed log"),
      hint: t("mail-cards-debug.log in the profile."), info: t("Includes sender addresses.") },
  ], { collapsed: true }],
];
