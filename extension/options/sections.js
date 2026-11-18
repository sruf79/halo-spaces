// Optionen von halo.spaces – gemeinsam für die Einstellungsseite (options.js)
// und die Suche in Thunderbirds Einstellungen (implementation.js lädt diese
// Datei über resource://mailcards/options/sections.js). t: Übersetzung
"use strict";

// Nur was sich nicht direkt in der Oberfläche einstellen lässt (wie Apple Mail):
// Breite der Mailliste (Trennlinie ziehen, Doppelklick), doppelte Kontakte
// (Adressbuch → Ansicht), Vorschauzeilen (Mail → Ansicht) und Geburtstage
// (Häkchen am Kalender „Geburtstage“ in der Kalenderliste) und das Adressbuch
// „Gesammelte Adressen“ („…“-Menü der Kontaktliste) stehen hier bewusst nicht;
// ihre Prefs bleiben. type: "action" ist ein Knopf (button) statt Schalter.
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
    { key: "followUp", label: t("Follow-Up Suggestions"), hint: t("Above the inbox: your messages that got no reply.") },
    { key: "senderLogos", label: t("Logos from sender websites"),
      hint: t("Only from the sender’s own website."), info: t("Favicon or BIMI logo of the sender’s domain. Off: no outside requests.") },
    { key: "macContactPhotos", mac: true, label: t("Photos from the Contacts app"),
      hint: t("macOS asks for access once.") },
    { key: "darkMessages", needs: "darkReader", label: t("Dark backgrounds for messages"),
      hint: t("In dark mode."), info: t("Thunderbird recolours HTML messages carefully. Images stay as they are.") },
    { key: "plainTextSystemFont", label: t("Messages in system font"),
      hint: t("Calm and easy to read."), info: t("Messages with their own font keep it. Off: Thunderbird’s fonts.") },
  ]],
  [t("Calendar"), [
    { key: "calendarEmoji", label: t("Emojis before event titles"),
      hint: t("🎂 birthday, 🏋️ training, 🦷 dentist …") },
    { key: "emojiCustom", type: "textarea", showIf: ["calendarEmoji", true], label: t("Own keywords"),
      hint: t("One per line: keyword = emoji. They take precedence."),
      placeholder: t("Book club = 📖\nChoir = 🎶") },
    { key: "weather", label: t("Weather in the Today Pane"),
      hint: t("The symbol next to the title shows the weather."),
      info: t("Asks open-meteo.com about every 30 minutes. Off: no symbol next to the title, no outside requests.") + " " + t("Weather data: Open-Meteo.com, CC BY 4.0") },
    { key: "weatherPlace", type: "place", showIf: ["weather", true], label: t("Place"),
      info: t("The system asks for permission once."), placeholder: t("City") },
  ]],
  // der fünfte Platz der Bereichsleiste (Chat, Erweiterung, Webseite, nichts) steht in den Einstellungen unter „Chat & More“
  [t("Spaces"), [
    { key: "hideSpacesToolbar", label: t("Hide the sidebar tab switcher"),
      hint: t("Only turn this on if you want to hide the switcher. You can still cycle through open tabs with Ctrl+Tab.") },
    { key: "sidebarGlow", label: t("Light glow in the sidebar"), hint: t("In the colour of the active space."),
      info: t("Also colours the dividing line next to the spaces. The tiles stay as they are.") },
  ]],
  [t("Appearance"), [
    { key: "earlyTheme", label: t("Design without flicker at start"),
      hint: t("From the next start."), info: t("Writes a userChrome.css into your profile.") },
  ]],
  // Fehlerbehebung: nur, wenn etwas nicht stimmt (eingeklappt). Design und
  // eigene Symbole lassen sich nur noch über about:config abschalten
  // (extensions.mailcards.bundledTheme, .appleIcons), als Notausgang für Support;
  // Updates nach Thunderbirds Einstellung im Add-ons-Manager
  [t("Troubleshooting"), [
    { key: "calendarOffline", label: t("Offline copy for online calendars"),
      hint: t("Faster loading."), info: t("Re-creates the calendars once.") },
    // Knopf statt Schalter: die Reihenfolge ändert sich per Ziehen in der Leiste
    { key: "spacesOrderReset", type: "action", label: t("Order of spaces"),
      hint: t("Drag a space up or down in the bar."), button: t("Reset") },
    { key: "debug", label: t("Detailed log"),
      hint: t("mail-cards-debug.log in the profile."), info: t("Includes sender addresses.") },
  ], { collapsed: true }],
];
