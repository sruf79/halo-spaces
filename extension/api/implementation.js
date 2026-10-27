/* halo.spaces – Erweiterung zum Design (Vorschau, Absenderbilder, Adressbuch, Bereiche).
 *
 * Hängt sich in die Thread-Karten jedes about:3pane-Fensters ein und ergänzt
 *  - eine zweizeilige Textvorschau (aus der Vorschau-Eigenschaft der Nachricht,
 *    bei Bedarf über folder.fetchMsgPreviewText nachgeladen),
 *  - ein rundes Absenderbild: Adressbuchfoto → BIMI-Logo → Website-Icon → Initialen.
 */

"use strict";

var { ExtensionCommon } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { DNS } = ChromeUtils.importESModule("resource:///modules/DNS.sys.mjs");
var { NetUtil } = ChromeUtils.importESModule("resource://gre/modules/NetUtil.sys.mjs");
var { MsgHdrToMimeMessage } = ChromeUtils.importESModule(
  "resource:///modules/gloda/MimeMessage.sys.mjs"
);
var { ExtensionSupport } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionSupport.sys.mjs"
);
var { setTimeout, clearTimeout, setInterval, clearInterval } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

// ---------------------------------------------------------------------------
// Texte der Oberfläche an einem Ort: Englisch ist der Schlüssel, darunter die
// Übersetzungen. Weitere Sprachen: eine Tabelle wie DE ergänzen und in
// TRANSLATIONS eintragen.
// ---------------------------------------------------------------------------
const DE = {
  "Install version {v}": "Version {v} installieren",
  "+{n} more": "+{n} weitere",
  "{n} message": "{n} E-Mail",
  "{n} messages": "{n} E-Mails",
  "{n} contact": "{n} Kontakt",
  "{n} contacts": "{n} Kontakte",
  "{name}’s Birthday": "{name} hat Geburtstag",
  "Born {year}": "Geboren {year}",
  "Hi,": "Hallo,",
  "1 day before": "1 Tag vorher",
  "1 hour before": "1 Stunde vorher",
  "15 minutes before": "15 Minuten vorher",
  "30 minutes before": "30 Minuten vorher",
  "5 minutes before": "5 Minuten vorher",
  "Add": "Hinzufügen",
  "Add Alert or Repeat": "Hinweis oder Wiederholung hinzufügen",
  "Add Due Date or Alert": "Fälligkeit oder Hinweis hinzufügen",
  "Add Invitees…": "Teilnehmer hinzufügen …",
  "Add Location": "Ort hinzufügen",
  "Add Notes or URL": "Notizen oder URL hinzufügen",
  "Alert": "Hinweis",
  "All Day": "Ganztägig",
  "all-day": "ganztägig",
  "Appearance": "Erscheinungsbild",
  "At time of event": "Zum Termin",
  "Automatic (like macOS)": "Automatisch (wie macOS)",
  "Birthdays": "Geburtstage",
  "Busy": "Beschäftigt",
  "Cancel": "Abbrechen",
  "Checking for updates …": "Suche nach Updates …",
  "Dark": "Dunkel",
  "Delete": "Löschen",
  "Due": "Fällig",
  "en": "de",
  "Ends": "Ende",
  "Event": "Termin",
  "Every Day": "Täglich",
  "Every Month": "Monatlich",
  "Every Week": "Wöchentlich",
  "Every Year": "Jährlich",
  "Forward": "Weiterleiten",
  "Free": "Frei",
  "halo.spaces is up to date": "halo.spaces ist aktuell",
  "Hide Sidebar": "Seitenleiste ausblenden",
  "Hide Spaces": "Bereiche ausblenden",
  "Hide Today Pane": "Heute-Leiste ausblenden",
  "Installation failed": "Installation fehlgeschlagen",
  "Installing …": "Wird installiert …",
  "Light": "Hell",
  "Light, dark or follow macOS": "Hell, dunkel oder wie macOS",
  "Contacts": "Kontakte",
  "Show Address Book “{name}”": "Adressbuch „{name}“ anzeigen",
  "Merge Duplicate Contacts": "Doppelte Kontakte zusammenführen",
  "Message List Display Options": "Darstellung der Liste",
  "More Options…": "Mehr Optionen …",
  "Never": "Nie",
  "New Event": "Neuer Termin",
  "New Task": "Neue Aufgabe",
  "Next Month": "Nächster Monat",
  "No calendar for tasks": "Kein Kalender für Aufgaben",
  "No Due Date": "Kein Fälligkeitsdatum",
  "No writable calendar": "Kein beschreibbarer Kalender",
  "None": "Keine",
  "Previous Month": "Voriger Monat",
  "Repeat": "Wiederholen",
  "Reply": "Antworten",
  "Reply All": "Allen antworten",
  "Show Outbox": "Postausgang zeigen",
  "The message could not be sent": "Die Nachricht konnte nicht gesendet werden",
  "The message was kept in the Outbox.": "Die Nachricht liegt weiter im Postausgang.",
  "Show As": "Anzeigen als",
  "Show Names As": "Namen anzeigen als",
  "Show Sidebar": "Seitenleiste einblenden",
  "Show Spaces": "Bereiche einblenden",
  "Show Today Pane": "Heute-Leiste einblenden",
  "Sort": "Sortieren",
  "Starts": "Beginn",
  "Task": "Aufgabe",
  "View": "Ansicht",
  "Preview Lines": "Vorschauzeilen",
  "1 Line": "1 Zeile",
  "{n} Lines": "{n} Zeilen",
  "Logos from sender websites": "Logos von Absender-Websites",
  "Photos from the Contacts app": "Fotos aus der Kontakte-App",
  "macOS asks for access once": "macOS fragt einmal nach dem Zugriff",
  "Calendar": "Kalender",
  "Emojis before event titles": "Emojis vor Termintiteln",
  "🎂 birthday, 🏋️ training, 🦷 dentist …": "🎂 Geburtstag, 🏋️ Training, 🦷 Zahnarzt …",
  "Own keywords": "Eigene Stichwörter",
  "Book club = 📖\nChoir = 🎶": "Hellas Kagran = ⚽\nChor = 🎶",
  "Offline copy for online calendars": "Offline-Kopie für Online-Kalender",
  "halo.spaces design": "Design von halo.spaces",
  "Own icons": "Eigene Symbole",
  "Troubleshooting": "Fehlerbehebung",
  "Detailed log": "Ausführliches Protokoll",
  "saved": "gesichert",
  "Check for Updates": "Nach Updates suchen",
  "Settings…": "Einstellungen …",
  "Send Feedback": "Feedback senden",
  "Say Thanks": "Danke sagen",
  "This message is from a mailing list.": "Diese Nachricht stammt von einem Verteiler.",
  "Unsubscribe": "Abmelden",
  "Unsubscribe from messages from {name}?": "Keine Nachrichten mehr von {name} erhalten?",
  "The sender will be told directly that you no longer want these messages.": "Der Absender erfährt direkt, dass du diese Nachrichten nicht mehr möchtest.",
  "Close": "Schließen",
  "More name fields": "Weitere Namensfelder",
  "Fewer name fields": "Weniger Namensfelder",
  "More fields": "Weitere Felder",
  "Fewer fields": "Weniger Felder",
  "Install updates at start": "Updates beim Start installieren",
  "Messages in system font": "Mails in Systemschrift",
  "Yesterday": "Gestern",
  "No Results": "Keine Ergebnisse",
  "No tasks match your search.": "Keine Aufgabe passt zur Suche.",
  "No Tasks": "Keine Aufgaben",
  "Tasks you add appear here.": "Neue Aufgaben erscheinen hier.",
  "No tasks in this view.": "Keine Aufgaben in dieser Ansicht.",
  "No Task List Selected": "Keine Aufgabenliste ausgewählt",
  "Choose a calendar that supports tasks in the sidebar.": "Wähle links einen Kalender, der Aufgaben unterstützt.",
  "Searching": "Suche",
  "All Mailboxes": "Alle Postfächer",
  "{n} result": "{n} Treffer",
  "{n} results": "{n} Treffer",
  "Address Books": "Adressbücher",
  "Today Pane": "Heute-Leiste",
  "Search": "Suchen",
  "Search Contacts": "Kontakte durchsuchen",
  "Search Tasks": "Aufgaben durchsuchen",
  "Search All Mailboxes": "Alle Postfächer durchsuchen",
  "Welcome to halo.spaces": "Willkommen bei halo.spaces",
  "Open Settings": "Einstellungen öffnen",
  "Continue": "Weiter",
  "Time": "Uhrzeit",
  "Tint unread messages": "Ungelesene Mails hinterlegen",
  "You unsubscribed from this mailing list.": "Du hast diesen Verteiler abbestellt.",
  "Card View": "Kartenansicht",
  "Table View: Classic": "Tabelle: Klassisch",
  "Show Contact Photo": "Kontaktfoto anzeigen",
  "Show Only Unread Messages": "Nur ungelesene E-Mails anzeigen",
  "Show All Messages": "Alle E-Mails anzeigen",
  "Design without flicker at start": "Design ohne Aufblitzen beim Start",
  "Show whole conversation": "Ganze Konversation zeigen",
  "Search Calendar": "Kalender durchsuchen",
  "Search Chat": "Chat durchsuchen",
  "Search Settings": "Einstellungen durchsuchen",
  "Search {name}": "„{name}“ durchsuchen",
  "Title": "Titel",
  "Add Location or Video Call": "Ort oder Videoanruf hinzufügen",
  "Add Invitees": "Teilnehmer hinzufügen",
  "Filter Tasks": "Aufgaben filtern",
  "Choose…": "Auswählen …",
  "Zoom": "Zoomen",
  "Table View": "Tabellenansicht",
  "Dialogs inside the window": "Dialoge im Fenster",
  "Hide “Collected Addresses”": "„Collected Addresses“ ausblenden",
  "Show Format Bar": "Formatleiste einblenden",
  "Hide Format Bar": "Formatleiste ausblenden",
  "Begin forwarded message:": "Beginn der weitergeleiteten Nachricht:",
  "Today, {time}": "Heute, {time}",
  "Yesterday, {time}": "Gestern, {time}",
  "Show": "Zeigen",
  "Keyboard Shortcuts": "Tastaturkurzbefehle",
  "Show all keyboard shortcuts of Thunderbird": "Alle Tastaturkurzbefehle von Thunderbird zeigen",
  "Dark backgrounds for messages": "Dunkle Hintergründe für Nachrichten",
  "{n} task": "{n} Aufgabe",
  "{n} tasks": "{n} Aufgaben",
  "Tasks": "Aufgaben",
  "Task List Display Options": "Darstellung der Aufgabenliste",
  "Weather in the Today Pane": "Wetter in der Today-Pane",
  "Current location": "Aktueller Standort",
  "City not found": "Stadt nicht gefunden",
  "Weather in the Today Pane?": "Wetter in der Today-Pane?",
  "City …": "Stadt …",
  "No": "Nein",
  "e.g. Vienna": "z. B. Wien",
  "OK": "OK",
  "Open System Settings": "Systemeinstellungen öffnen",
  "Locating …": "Standort wird ermittelt …",
  "Searching …": "Suche …",
  "Weather data: Open-Meteo.com, CC BY 4.0": "Wetterdaten: Open-Meteo.com, CC BY 4.0",
  "Undo Send": "Senden rückgängig",
  "Sending {n} messages …": "{n} Nachrichten werden gesendet …",
  "Sending “{s}” …": "„{s}“ wird gesendet …",
  "Sending …": "Wird gesendet …",
  "Off": "Aus",
  "seconds": "Sekunden",
  "More …": "Mehr …",
  "Send": "Senden",
  "Reply to {name} …": "Antworten an {name} …",
  "Reply sent": "Antwort gesendet",
  "Send Later": "Später senden",
  "Send Now": "Jetzt senden",
  "Send {time} Tonight": "Heute um {time} senden",
  "Send {time} Tomorrow": "Morgen um {time} senden",
  "Send Later …": "Später senden …",
  "Schedule": "Planen",
  "Remind Me": "Erinnern",
  "Remind Me in 1 Hour": "In 1 Stunde erinnern",
  "Remind Me Tonight": "Heute Abend erinnern",
  "Remind Me Tomorrow": "Morgen erinnern",
  "Remind Me Next Week": "Nächste Woche erinnern",
  "Reminder": "Erinnerung",
  "(no subject)": "(kein Betreff)",
  "Follow Up": "Nachfassen",
  "Dismiss": "Ausblenden",
  "No reply for {d} days: “{s}” to {to}": "Seit {d} Tagen keine Antwort: „{s}“ an {to}",
  "My Location": "Mein Standort",
  "Spaces": "Bereiche",
  "Chat": "Chat",
  "Space of an add-on": "Bereich einer Erweiterung",
  "Website": "Webseite",
  "Add-on": "Erweiterung",
  "Address": "Adresse",
  "In the space colour": "In der Bereichsfarbe",
  "Original": "Original",
  "Symbol": "Symbol",
  "No add-on with its own space installed": "Keine Erweiterung mit eigenem Bereich installiert",
  "none installed": "keine installiert",
  "Not a valid web address": "Keine gültige Webadresse",
  "Website …": "Webseite …",
  "e.g. calendar.example.com": "z. B. kalender.example.com",
  "Received and sent messages together.": "Empfangene und gesendete Mails zusammen.",
  "From all folders, newest first.": "Aus allen Ordnern, neueste zuerst.",
  "Light accent colour behind unread messages.": "Helle Akzentfarbe hinter ungelesenen Mails.",
  "Time to take a sent message back.": "Zeit, um eine gesendete Mail zurückzuholen.",
  "Only from the sender’s own website.": "Nur von der eigenen Webseite des Absenders.",
  "Favicon or BIMI logo of the sender’s domain. Off: no outside requests.": "Favicon oder BIMI-Logo der Absenderdomain. Aus: keine Anfragen nach außen.",
  "In dark mode.": "Im Dunkelmodus.",
  "Thunderbird recolours HTML messages carefully. Images stay as they are.": "Thunderbird färbt HTML-Mails behutsam um. Bilder bleiben, wie sie sind.",
  "Calm and easy to read.": "Ruhig und gut lesbar.",
  "Messages with their own font keep it. Off: Thunderbird’s fonts.": "Mails mit eigener Schrift behalten sie. Aus: Schriften von Thunderbird.",
  "In the address book sidebar.": "In der Seitenleiste des Adressbuchs.",
  "Completion while writing keeps working.": "Die Vervollständigung beim Schreiben funktioniert weiter.",
  "One per line: keyword = emoji. They take precedence.": "Eines pro Zeile: Stichwort = Emoji. Sie haben Vorrang.",
  "The symbol next to the title shows the weather.": "Das Symbol neben dem Titel zeigt das Wetter.",
  "Asks open-meteo.com about every 30 minutes. Off: the sun stays, no outside requests.": "Fragt etwa alle 30 Minuten bei open-meteo.com nach. Aus: die Sonne bleibt, keine Anfragen nach außen.",
  "Place": "Ort",
  "Empty: your current location.": "Leer: dein aktueller Standort.",
  "The system asks for permission once.": "Das System fragt einmal um Erlaubnis.",
  "Faster loading.": "Schnelleres Laden.",
  "Re-creates the calendars once.": "Legt die Kalender einmal neu an.",
  "In the spaces bar.": "In der Bereichsleiste.",
  "Instead": "Stattdessen",
  "Only one of them, in the place of Chat.": "Nur eines davon, auf dem Platz des Chats.",
  "Nothing": "Nichts",
  "Opens unchanged in its own tab.": "Öffnet sich unverändert im eigenen Tab.",
  "Opens like an app.": "Öffnet sich wie eine App.",
  "No address bar. Links to other sites open in your browser.": "Ohne Adressleiste. Links zu anderen Seiten öffnen im Browser.",
  "Original: unchanged on a white surface.": "Original: unverändert auf weißer Fläche.",
  "Questions appear as a sheet at the top.": "Nachfragen erscheinen als Kachel oben im Fenster.",
  "Dialogs without title bar. For newly opened windows.": "Dialoge ohne Titelleiste. Für neu geöffnete Fenster.",
  "From the next start.": "Ab dem nächsten Start.",
  "Writes a userChrome.css into your profile.": "Schreibt eine userChrome.css in dein Profil.",
  "At most every 6 hours.": "Höchstens alle 6 Stunden.",
  "Active after a restart.": "Aktiv nach einem Neustart.",
  "After a restart.": "Nach einem Neustart.",
  "mail-cards-debug.log in the profile.": "mail-cards-debug.log im Profil.",
  "Includes sender addresses.": "Enthält Absenderadressen.",
  "halo.spaces Settings": "halo.spaces Einstellungen",
  "Yes": "Ja",
  "The symbol next to the title then shows the weather. Asks open-meteo.com about every 30 minutes.": "Das Symbol neben dem Titel zeigt dann das Wetter. Fragt etwa alle 30 Minuten bei open-meteo.com nach.",
  "Do you use Chat?": "Verwendest du den Chat?",
  "Instead in its place:": "Stattdessen auf seinem Platz:",
  "Saved": "Gespeichert",
  "Thunderbird now looks calm and tidy.": "Thunderbird sieht jetzt ruhig und aufgeräumt aus.",
  "Light and dark now follow your system.": "Hell und dunkel folgen jetzt deinem System.",
  "halo.spaces is made for macOS. On Windows and Linux it is still being tested. If something looks odd, we'd love a quick note!": "halo.spaces ist für macOS gemacht. Unter Windows und Linux wird es noch getestet. Wenn etwas komisch aussieht, freuen wir uns über eine kurze Nachricht!",
  "Installed. Active in a moment.": "Installiert. Gleich aktiv.",
  "No connection. Try again.": "Keine Verbindung. Nochmal versuchen.",
  "Only messages from this folder. Turn on Global Search to include your replies from Sent.": "Nur Mails aus diesem Ordner. Schalte die globale Suche ein, um auch deine Antworten aus „Gesendet“ zu sehen.",
  "Location access is off. Allow it in System Settings or enter a city.": "Ortungsdienste sind aus. Erlaube sie in den Systemeinstellungen oder gib eine Stadt ein.",
  "Location unavailable. Enter a city.": "Standort nicht verfügbar. Gib eine Stadt ein.",
  "macOS asks for access once.": "macOS fragt einmal um Erlaubnis.",
};
const FR = {
  "Install version {v}": "Installer la version {v}",
  "+{n} more": "+{n} autres",
  "{n} message": "{n} message",
  "{n} messages": "{n} messages",
  "{n} contact": "{n} contact",
  "{n} contacts": "{n} contacts",
  "{name}’s Birthday": "Anniversaire de {name}",
  "Born {year}": "Né(e) en {year}",
  "Hi,": "Bonjour,",
  "1 day before": "1 jour avant",
  "1 hour before": "1 heure avant",
  "15 minutes before": "15 minutes avant",
  "30 minutes before": "30 minutes avant",
  "5 minutes before": "5 minutes avant",
  "Add": "Ajouter",
  "Add Alert or Repeat": "Ajouter une alerte ou une répétition",
  "Add Due Date or Alert": "Ajouter une échéance ou une alerte",
  "Add Invitees…": "Ajouter des invités…",
  "Add Location": "Ajouter un lieu",
  "Add Notes or URL": "Ajouter des notes ou une URL",
  "Alert": "Alerte",
  "All Day": "Toute la journée",
  "all-day": "toute la journée",
  "Appearance": "Apparence",
  "At time of event": "À l’heure de l’événement",
  "Automatic (like macOS)": "Automatique (comme macOS)",
  "Birthdays": "Anniversaires",
  "Busy": "Occupé",
  "Cancel": "Annuler",
  "Checking for updates …": "Recherche de mises à jour …",
  "Dark": "Sombre",
  "Delete": "Supprimer",
  "Due": "Échéance",
  "Ends": "Fin",
  "Event": "Événement",
  "Every Day": "Tous les jours",
  "Every Month": "Tous les mois",
  "Every Week": "Toutes les semaines",
  "Every Year": "Tous les ans",
  "Forward": "Transférer",
  "Free": "Disponible",
  "halo.spaces is up to date": "halo.spaces est à jour",
  "Hide Sidebar": "Masquer la barre latérale",
  "Hide Spaces": "Masquer les espaces",
  "Hide Today Pane": "Masquer le volet Aujourd’hui",
  "Installation failed": "Échec de l’installation",
  "Installing …": "Installation …",
  "Light": "Clair",
  "Light, dark or follow macOS": "Clair, sombre ou comme macOS",
  "Contacts": "Contacts",
  "Show Address Book “{name}”": "Afficher le carnet d’adresses « {name} »",
  "Merge Duplicate Contacts": "Fusionner les contacts en double",
  "Message List Display Options": "Options d’affichage de la liste",
  "More Options…": "Plus d’options…",
  "Never": "Jamais",
  "New Event": "Nouvel événement",
  "New Task": "Nouvelle tâche",
  "Next Month": "Mois suivant",
  "No calendar for tasks": "Aucun calendrier pour les tâches",
  "No Due Date": "Sans échéance",
  "No writable calendar": "Aucun calendrier modifiable",
  "None": "Aucune",
  "Previous Month": "Mois précédent",
  "Repeat": "Répéter",
  "Reply": "Répondre",
  "Reply All": "Répondre à tous",
  "Show Outbox": "Afficher la boîte d’envoi",
  "The message could not be sent": "Le message n’a pas pu être envoyé",
  "The message was kept in the Outbox.": "Le message a été conservé dans la boîte d’envoi.",
  "Show As": "Afficher comme",
  "Show Names As": "Afficher les noms",
  "Show Sidebar": "Afficher la barre latérale",
  "Show Spaces": "Afficher les espaces",
  "Show Today Pane": "Afficher le volet Aujourd’hui",
  "Sort": "Trier",
  "Starts": "Début",
  "Task": "Tâche",
  "View": "Présentation",
  "Preview Lines": "Lignes d’aperçu",
  "1 Line": "1 ligne",
  "{n} Lines": "{n} lignes",
  "Logos from sender websites": "Logos des sites des expéditeurs",
  "Photos from the Contacts app": "Photos de l’app Contacts",
  "macOS asks for access once": "macOS demande l’accès une fois",
  "Calendar": "Calendrier",
  "Emojis before event titles": "Emojis devant les titres d’événements",
  "🎂 birthday, 🏋️ training, 🦷 dentist …": "🎂 anniversaire, 🏋️ sport, 🦷 dentiste …",
  "Own keywords": "Mots-clés personnels",
  "Book club = 📖\nChoir = 🎶": "Club de lecture = 📖\nChorale = 🎶",
  "Offline copy for online calendars": "Copie hors ligne des calendriers en ligne",
  "halo.spaces design": "Design halo.spaces",
  "Own icons": "Icônes propres",
  "Troubleshooting": "Dépannage",
  "Detailed log": "Journal détaillé",
  "saved": "enregistré",
  "Check for Updates": "Rechercher des mises à jour",
  "Settings…": "Réglages…",
  "Send Feedback": "Envoyer un avis",
  "Say Thanks": "Dire merci",
  "Mail": "Mail",
  "This message is from a mailing list.": "Ce message provient d’une liste de diffusion.",
  "Unsubscribe": "Se désabonner",
  "Unsubscribe from messages from {name}?": "Ne plus recevoir de messages de {name} ?",
  "The sender will be told directly that you no longer want these messages.": "L’expéditeur sera informé directement que vous ne souhaitez plus recevoir ces messages.",
  "Close": "Fermer",
  "More name fields": "Autres champs du nom",
  "Fewer name fields": "Moins de champs du nom",
  "More fields": "Autres champs",
  "Fewer fields": "Moins de champs",
  "Updates": "Mises à jour",
  "Install updates at start": "Installer les mises à jour au démarrage",
  "Messages in system font": "Messages dans la police système",
  "Yesterday": "Hier",
  "No Results": "Aucun résultat",
  "No tasks match your search.": "Aucune tâche ne correspond à la recherche.",
  "No Tasks": "Aucune tâche",
  "Tasks you add appear here.": "Les tâches ajoutées apparaissent ici.",
  "No tasks in this view.": "Aucune tâche dans cette vue.",
  "No Task List Selected": "Aucune liste de tâches sélectionnée",
  "Choose a calendar that supports tasks in the sidebar.": "Choisissez dans la barre latérale un calendrier qui prend en charge les tâches.",
  "Searching": "Recherche",
  "All Mailboxes": "Toutes les boîtes",
  "{n} result": "{n} résultat",
  "{n} results": "{n} résultats",
  "Address Books": "Carnets d’adresses",
  "Today Pane": "Volet Aujourd’hui",
  "Search": "Rechercher",
  "Search Contacts": "Rechercher des contacts",
  "Search Tasks": "Rechercher des tâches",
  "Search All Mailboxes": "Rechercher dans toutes les boîtes",
  "Welcome to halo.spaces": "Bienvenue dans halo.spaces",
  "Open Settings": "Ouvrir les paramètres",
  "Continue": "Continuer",
  "Time": "Heure",
  "Tint unread messages": "Teinter les messages non lus",
  "You unsubscribed from this mailing list.": "Vous vous êtes désabonné de cette liste de diffusion.",
  "Card View": "Vue en cartes",
  "Table View: Classic": "Tableau : classique",
  "Show Contact Photo": "Afficher la photo du contact",
  "Show Only Unread Messages": "Afficher uniquement les messages non lus",
  "Show All Messages": "Afficher tous les messages",
  "Design without flicker at start": "Design sans clignotement au démarrage",
  "Show whole conversation": "Afficher toute la conversation",
  "Search Calendar": "Rechercher dans le calendrier",
  "Search Chat": "Rechercher dans le chat",
  "Search Settings": "Rechercher dans les réglages",
  "Search {name}": "Rechercher dans « {name} »",
  "Title": "Titre",
  "Add Location or Video Call": "Ajouter un lieu ou un appel vidéo",
  "Add Invitees": "Ajouter des invités",
  "Filter Tasks": "Filtrer les tâches",
  "Choose…": "Choisir…",
  "Zoom": "Zoom",
  "Table View": "Vue tableau",
  "Dialogs inside the window": "Dialogues dans la fenêtre",
  "Hide “Collected Addresses”": "Masquer « Collected Addresses »",
  "Show Format Bar": "Afficher la barre de mise en forme",
  "Hide Format Bar": "Masquer la barre de mise en forme",
  "Begin forwarded message:": "Début du message réexpédié :",
  "Today, {time}": "Aujourd’hui, {time}",
  "Yesterday, {time}": "Hier, {time}",
  "Show": "Afficher",
  "Keyboard Shortcuts": "Raccourcis clavier",
  "Show all keyboard shortcuts of Thunderbird": "Afficher tous les raccourcis clavier de Thunderbird",
  "Dark backgrounds for messages": "Fonds sombres pour les messages",
  "{n} task": "{n} tâche",
  "{n} tasks": "{n} tâches",
  "Tasks": "Tâches",
  "Task List Display Options": "Options d’affichage de la liste des tâches",
  "Weather in the Today Pane": "Météo dans le panneau Aujourd’hui",
  "Current location": "Position actuelle",
  "City not found": "Ville introuvable",
  "Weather in the Today Pane?": "Météo dans le panneau Aujourd’hui ?",
  "City …": "Ville …",
  "No": "Non",
  "e.g. Vienna": "p. ex. Vienne",
  "OK": "OK",
  "Open System Settings": "Ouvrir les réglages du système",
  "Locating …": "Localisation …",
  "Searching …": "Recherche …",
  "Weather data: Open-Meteo.com, CC BY 4.0": "Données météo : Open-Meteo.com, CC BY 4.0",
  "Undo Send": "Annuler l’envoi",
  "Sending {n} messages …": "Envoi de {n} messages …",
  "Sending “{s}” …": "Envoi de « {s} » …",
  "Sending …": "Envoi …",
  "Off": "Désactivé",
  "seconds": "secondes",
  "More …": "Plus …",
  "Send": "Envoyer",
  "Reply to {name} …": "Répondre à {name} …",
  "Reply sent": "Réponse envoyée",
  "Send Later": "Envoyer plus tard",
  "Send Now": "Envoyer maintenant",
  "Send {time} Tonight": "Envoyer ce soir à {time}",
  "Send {time} Tomorrow": "Envoyer demain à {time}",
  "Send Later …": "Envoyer plus tard …",
  "Schedule": "Planifier",
  "Remind Me": "Me le rappeler",
  "Remind Me in 1 Hour": "Rappeler dans 1 heure",
  "Remind Me Tonight": "Rappeler ce soir",
  "Remind Me Tomorrow": "Rappeler demain",
  "Remind Me Next Week": "Rappeler la semaine prochaine",
  "Reminder": "Rappel",
  "(no subject)": "(sans objet)",
  "Follow Up": "Relancer",
  "Dismiss": "Masquer",
  "No reply for {d} days: “{s}” to {to}": "Pas de réponse depuis {d} jours : « {s} » à {to}",
  "My Location": "Ma position",
  "Spaces": "Espaces",
  "Chat": "Chat",
  "Space of an add-on": "Espace d’un module",
  "Website": "Site web",
  "Add-on": "Module",
  "Address": "Adresse",
  "In the space colour": "Dans la couleur de l’espace",
  "Original": "Original",
  "Symbol": "Symbole",
  "No add-on with its own space installed": "Aucun module avec son propre espace installé",
  "none installed": "aucun installé",
  "Not a valid web address": "Adresse web non valide",
  "Website …": "Site web …",
  "e.g. calendar.example.com": "p. ex. agenda.example.com",
  "Received and sent messages together.": "Messages reçus et envoyés ensemble.",
  "From all folders, newest first.": "De tous les dossiers, les plus récents d’abord.",
  "Light accent colour behind unread messages.": "Couleur d’accent claire derrière les messages non lus.",
  "Time to take a sent message back.": "Délai pour reprendre un message envoyé.",
  "Only from the sender’s own website.": "Uniquement depuis le site de l’expéditeur.",
  "Favicon or BIMI logo of the sender’s domain. Off: no outside requests.": "Favicon ou logo BIMI du domaine de l’expéditeur. Désactivé : aucune requête externe.",
  "In dark mode.": "En mode sombre.",
  "Thunderbird recolours HTML messages carefully. Images stay as they are.": "Thunderbird recolore les messages HTML avec soin. Les images restent inchangées.",
  "Calm and easy to read.": "Calme et lisible.",
  "Messages with their own font keep it. Off: Thunderbird’s fonts.": "Les messages avec leur propre police la gardent. Désactivé : polices de Thunderbird.",
  "In the address book sidebar.": "Dans la barre latérale du carnet d’adresses.",
  "Completion while writing keeps working.": "La saisie semi-automatique continue de fonctionner.",
  "One per line: keyword = emoji. They take precedence.": "Un par ligne : mot clé = emoji. Ils sont prioritaires.",
  "The symbol next to the title shows the weather.": "Le symbole à côté du titre indique la météo.",
  "Asks open-meteo.com about every 30 minutes. Off: the sun stays, no outside requests.": "Interroge open-meteo.com environ toutes les 30 minutes. Désactivé : le soleil reste, aucune requête externe.",
  "Place": "Lieu",
  "Empty: your current location.": "Vide : votre position actuelle.",
  "The system asks for permission once.": "Le système demande l’autorisation une fois.",
  "Faster loading.": "Chargement plus rapide.",
  "Re-creates the calendars once.": "Recrée les agendas une fois.",
  "In the spaces bar.": "Dans la barre des espaces.",
  "Instead": "À la place",
  "Only one of them, in the place of Chat.": "Un seul, à la place du Chat.",
  "Nothing": "Rien",
  "Opens unchanged in its own tab.": "S’ouvre tel quel dans son propre onglet.",
  "Opens like an app.": "S’ouvre comme une app.",
  "No address bar. Links to other sites open in your browser.": "Sans barre d’adresse. Les liens vers d’autres sites s’ouvrent dans le navigateur.",
  "Original: unchanged on a white surface.": "Original : inchangé sur fond blanc.",
  "Questions appear as a sheet at the top.": "Les questions apparaissent en haut de la fenêtre.",
  "Dialogs without title bar. For newly opened windows.": "Dialogues sans barre de titre. Pour les nouvelles fenêtres.",
  "From the next start.": "À partir du prochain démarrage.",
  "Writes a userChrome.css into your profile.": "Écrit un userChrome.css dans votre profil.",
  "At most every 6 hours.": "Au plus toutes les 6 heures.",
  "Active after a restart.": "Actif après un redémarrage.",
  "After a restart.": "Après un redémarrage.",
  "mail-cards-debug.log in the profile.": "mail-cards-debug.log dans le profil.",
  "Includes sender addresses.": "Contient les adresses des expéditeurs.",
  "halo.spaces Settings": "Réglages de halo.spaces",
  "Yes": "Oui",
  "The symbol next to the title then shows the weather. Asks open-meteo.com about every 30 minutes.": "Le symbole à côté du titre indique alors la météo. Interroge open-meteo.com environ toutes les 30 minutes.",
  "Do you use Chat?": "Utilisez-vous le Chat ?",
  "Instead in its place:": "À sa place :",
  "Saved": "Enregistré",
  "Thunderbird now looks calm and tidy.": "Thunderbird est désormais calme et épuré.",
  "Light and dark now follow your system.": "Clair et sombre suivent désormais votre système.",
  "halo.spaces is made for macOS. On Windows and Linux it is still being tested. If something looks odd, we'd love a quick note!": "halo.spaces est conçu pour macOS. Sous Windows et Linux, il est encore en test. Si quelque chose semble bizarre, un petit mot nous fera plaisir !",
  "Installed. Active in a moment.": "Installé. Actif dans un instant.",
  "No connection. Try again.": "Pas de connexion. Réessayez.",
  "Only messages from this folder. Turn on Global Search to include your replies from Sent.": "Uniquement les messages de ce dossier. Activez la recherche globale pour inclure vos réponses des Envoyés.",
  "Location access is off. Allow it in System Settings or enter a city.": "La localisation est désactivée. Autorisez-la dans les Réglages système ou saisissez une ville.",
  "Location unavailable. Enter a city.": "Position indisponible. Saisissez une ville.",
  "macOS asks for access once.": "macOS demande l’accès une fois.",
};
const ES = {
  "Install version {v}": "Instalar la versión {v}",
  "+{n} more": "+{n} más",
  "{n} message": "{n} mensaje",
  "{n} messages": "{n} mensajes",
  "{n} contact": "{n} contacto",
  "{n} contacts": "{n} contactos",
  "{name}’s Birthday": "Cumpleaños de {name}",
  "Born {year}": "Nació en {year}",
  "Hi,": "Hola:",
  "1 day before": "1 día antes",
  "1 hour before": "1 hora antes",
  "15 minutes before": "15 minutos antes",
  "30 minutes before": "30 minutos antes",
  "5 minutes before": "5 minutos antes",
  "Add": "Añadir",
  "Add Alert or Repeat": "Añadir aviso o repetición",
  "Add Due Date or Alert": "Añadir vencimiento o aviso",
  "Add Invitees…": "Añadir invitados…",
  "Add Location": "Añadir ubicación",
  "Add Notes or URL": "Añadir notas o URL",
  "Alert": "Aviso",
  "All Day": "Todo el día",
  "all-day": "todo el día",
  "Appearance": "Apariencia",
  "At time of event": "A la hora del evento",
  "Automatic (like macOS)": "Automático (como macOS)",
  "Birthdays": "Cumpleaños",
  "Busy": "Ocupado",
  "Cancel": "Cancelar",
  "Checking for updates …": "Buscando actualizaciones …",
  "Dark": "Oscuro",
  "Delete": "Eliminar",
  "Due": "Vence",
  "Ends": "Termina",
  "Event": "Evento",
  "Every Day": "Cada día",
  "Every Month": "Cada mes",
  "Every Week": "Cada semana",
  "Every Year": "Cada año",
  "Forward": "Reenviar",
  "Free": "Libre",
  "halo.spaces is up to date": "halo.spaces está actualizado",
  "Hide Sidebar": "Ocultar barra lateral",
  "Hide Spaces": "Ocultar espacios",
  "Hide Today Pane": "Ocultar panel Hoy",
  "Installation failed": "Error en la instalación",
  "Installing …": "Instalando …",
  "Light": "Claro",
  "Light, dark or follow macOS": "Claro, oscuro o como macOS",
  "Contacts": "Contactos",
  "Show Address Book “{name}”": "Mostrar la libreta de direcciones “{name}”",
  "Merge Duplicate Contacts": "Combinar contactos duplicados",
  "Message List Display Options": "Opciones de vista de la lista",
  "More Options…": "Más opciones…",
  "Never": "Nunca",
  "New Event": "Nuevo evento",
  "New Task": "Nueva tarea",
  "Next Month": "Mes siguiente",
  "No calendar for tasks": "Ningún calendario para tareas",
  "No Due Date": "Sin vencimiento",
  "No writable calendar": "Ningún calendario editable",
  "None": "Ninguno",
  "Previous Month": "Mes anterior",
  "Repeat": "Repetir",
  "Reply": "Responder",
  "Reply All": "Responder a todos",
  "Show Outbox": "Mostrar bandeja de salida",
  "The message could not be sent": "No se pudo enviar el mensaje",
  "The message was kept in the Outbox.": "El mensaje se ha guardado en la bandeja de salida.",
  "Show As": "Mostrar como",
  "Show Names As": "Mostrar nombres como",
  "Show Sidebar": "Mostrar barra lateral",
  "Show Spaces": "Mostrar espacios",
  "Show Today Pane": "Mostrar panel Hoy",
  "Sort": "Ordenar",
  "Starts": "Empieza",
  "Task": "Tarea",
  "View": "Ver",
  "Preview Lines": "Líneas de vista previa",
  "1 Line": "1 línea",
  "{n} Lines": "{n} líneas",
  "Logos from sender websites": "Logotipos de los sitios web de los remitentes",
  "Photos from the Contacts app": "Fotos de la app Contactos",
  "macOS asks for access once": "macOS pide acceso una vez",
  "Calendar": "Calendario",
  "Emojis before event titles": "Emojis antes de los títulos de eventos",
  "🎂 birthday, 🏋️ training, 🦷 dentist …": "🎂 cumpleaños, 🏋️ entrenamiento, 🦷 dentista …",
  "Own keywords": "Palabras clave propias",
  "Book club = 📖\nChoir = 🎶": "Club de lectura = 📖\nCoro = 🎶",
  "Offline copy for online calendars": "Copia sin conexión de calendarios en línea",
  "halo.spaces design": "Diseño de halo.spaces",
  "Own icons": "Iconos propios",
  "Troubleshooting": "Solución de problemas",
  "Detailed log": "Registro detallado",
  "saved": "guardado",
  "Check for Updates": "Buscar actualizaciones",
  "Settings…": "Ajustes…",
  "Send Feedback": "Enviar comentarios",
  "Say Thanks": "Dar las gracias",
  "Mail": "Correo",
  "This message is from a mailing list.": "Este mensaje procede de una lista de correo.",
  "Unsubscribe": "Darse de baja",
  "Unsubscribe from messages from {name}?": "¿Dejar de recibir mensajes de {name}?",
  "The sender will be told directly that you no longer want these messages.": "Se informará directamente al remitente de que ya no quieres estos mensajes.",
  "Close": "Cerrar",
  "More name fields": "Más campos de nombre",
  "Fewer name fields": "Menos campos de nombre",
  "More fields": "Más campos",
  "Fewer fields": "Menos campos",
  "Updates": "Actualizaciones",
  "Install updates at start": "Instalar actualizaciones al iniciar",
  "Messages in system font": "Mensajes en la fuente del sistema",
  "Yesterday": "Ayer",
  "No Results": "Sin resultados",
  "No tasks match your search.": "Ninguna tarea coincide con la búsqueda.",
  "No Tasks": "No hay tareas",
  "Tasks you add appear here.": "Las tareas que añadas aparecerán aquí.",
  "No tasks in this view.": "No hay tareas en esta vista.",
  "No Task List Selected": "No hay ninguna lista de tareas seleccionada",
  "Choose a calendar that supports tasks in the sidebar.": "Elige en la barra lateral un calendario que admita tareas.",
  "Searching": "Buscando",
  "All Mailboxes": "Todos los buzones",
  "{n} result": "{n} resultado",
  "{n} results": "{n} resultados",
  "Address Books": "Libretas de direcciones",
  "Today Pane": "Panel Hoy",
  "Search": "Buscar",
  "Search Contacts": "Buscar contactos",
  "Search Tasks": "Buscar tareas",
  "Search All Mailboxes": "Buscar en todos los buzones",
  "Welcome to halo.spaces": "Bienvenido a halo.spaces",
  "Open Settings": "Abrir ajustes",
  "Continue": "Continuar",
  "Time": "Hora",
  "Tint unread messages": "Resaltar mensajes no leídos",
  "You unsubscribed from this mailing list.": "Te has dado de baja de esta lista de correo.",
  "Card View": "Vista de tarjetas",
  "Table View: Classic": "Tabla: clásica",
  "Show Contact Photo": "Mostrar foto del contacto",
  "Show Only Unread Messages": "Mostrar solo los mensajes no leídos",
  "Show All Messages": "Mostrar todos los mensajes",
  "Design without flicker at start": "Diseño sin parpadeo al iniciar",
  "Show whole conversation": "Mostrar toda la conversación",
  "Search Calendar": "Buscar en el calendario",
  "Search Chat": "Buscar en el chat",
  "Search Settings": "Buscar en Ajustes",
  "Search {name}": "Buscar en «{name}»",
  "Title": "Título",
  "Add Location or Video Call": "Añadir ubicación o videollamada",
  "Add Invitees": "Añadir invitados",
  "Filter Tasks": "Filtrar tareas",
  "Choose…": "Elegir…",
  "Zoom": "Zoom",
  "Table View": "Vista de tabla",
  "Dialogs inside the window": "Diálogos dentro de la ventana",
  "Hide “Collected Addresses”": "Ocultar “Collected Addresses”",
  "Show Format Bar": "Mostrar barra de formato",
  "Hide Format Bar": "Ocultar barra de formato",
  "Begin forwarded message:": "Inicio del mensaje reenviado:",
  "Today, {time}": "Hoy, {time}",
  "Yesterday, {time}": "Ayer, {time}",
  "Show": "Mostrar",
  "Keyboard Shortcuts": "Atajos de teclado",
  "Show all keyboard shortcuts of Thunderbird": "Mostrar todos los atajos de teclado de Thunderbird",
  "Dark backgrounds for messages": "Fondos oscuros para los mensajes",
  "{n} task": "{n} tarea",
  "{n} tasks": "{n} tareas",
  "Tasks": "Tareas",
  "Task List Display Options": "Opciones de visualización de la lista de tareas",
  "Weather in the Today Pane": "Tiempo en el panel Hoy",
  "Current location": "Ubicación actual",
  "City not found": "Ciudad no encontrada",
  "Weather in the Today Pane?": "¿Tiempo en el panel Hoy?",
  "City …": "Ciudad …",
  "No": "No",
  "e.g. Vienna": "p. ej. Viena",
  "OK": "OK",
  "Open System Settings": "Abrir ajustes del sistema",
  "Locating …": "Localizando …",
  "Searching …": "Buscando …",
  "Weather data: Open-Meteo.com, CC BY 4.0": "Datos meteorológicos: Open-Meteo.com, CC BY 4.0",
  "Undo Send": "Deshacer envío",
  "Sending {n} messages …": "Enviando {n} mensajes …",
  "Sending “{s}” …": "Enviando «{s}» …",
  "Sending …": "Enviando …",
  "Off": "Desactivado",
  "seconds": "segundos",
  "More …": "Más …",
  "Send": "Enviar",
  "Reply to {name} …": "Responder a {name} …",
  "Reply sent": "Respuesta enviada",
  "Send Later": "Enviar más tarde",
  "Send Now": "Enviar ahora",
  "Send {time} Tonight": "Enviar esta noche a las {time}",
  "Send {time} Tomorrow": "Enviar mañana a las {time}",
  "Send Later …": "Enviar más tarde …",
  "Schedule": "Programar",
  "Remind Me": "Recordármelo",
  "Remind Me in 1 Hour": "Recordar en 1 hora",
  "Remind Me Tonight": "Recordar esta noche",
  "Remind Me Tomorrow": "Recordar mañana",
  "Remind Me Next Week": "Recordar la próxima semana",
  "Reminder": "Recordatorio",
  "(no subject)": "(sin asunto)",
  "Follow Up": "Hacer seguimiento",
  "Dismiss": "Descartar",
  "No reply for {d} days: “{s}” to {to}": "Sin respuesta desde hace {d} días: «{s}» a {to}",
  "My Location": "Mi ubicación",
  "Spaces": "Espacios",
  "Chat": "Chat",
  "Space of an add-on": "Espacio de un complemento",
  "Website": "Sitio web",
  "Add-on": "Complemento",
  "Address": "Dirección",
  "In the space colour": "En el color del espacio",
  "Original": "Original",
  "Symbol": "Símbolo",
  "No add-on with its own space installed": "No hay complementos con espacio propio instalados",
  "none installed": "ninguno instalado",
  "Not a valid web address": "Dirección web no válida",
  "Website …": "Sitio web …",
  "e.g. calendar.example.com": "p. ej. calendario.example.com",
  "Received and sent messages together.": "Mensajes recibidos y enviados juntos.",
  "From all folders, newest first.": "De todas las carpetas, los más recientes primero.",
  "Light accent colour behind unread messages.": "Color de acento claro detrás de los mensajes no leídos.",
  "Time to take a sent message back.": "Tiempo para recuperar un mensaje enviado.",
  "Only from the sender’s own website.": "Solo desde el sitio web del remitente.",
  "Favicon or BIMI logo of the sender’s domain. Off: no outside requests.": "Favicon o logotipo BIMI del dominio del remitente. Desactivado: ninguna solicitud externa.",
  "In dark mode.": "En modo oscuro.",
  "Thunderbird recolours HTML messages carefully. Images stay as they are.": "Thunderbird recolorea los mensajes HTML con cuidado. Las imágenes no cambian.",
  "Calm and easy to read.": "Tranquilo y fácil de leer.",
  "Messages with their own font keep it. Off: Thunderbird’s fonts.": "Los mensajes con fuente propia la conservan. Desactivado: fuentes de Thunderbird.",
  "In the address book sidebar.": "En la barra lateral de la libreta de direcciones.",
  "Completion while writing keeps working.": "El autocompletado al escribir sigue funcionando.",
  "One per line: keyword = emoji. They take precedence.": "Uno por línea: palabra clave = emoji. Tienen prioridad.",
  "The symbol next to the title shows the weather.": "El símbolo junto al título muestra el tiempo.",
  "Asks open-meteo.com about every 30 minutes. Off: the sun stays, no outside requests.": "Consulta open-meteo.com cada 30 minutos aprox. Desactivado: el sol se queda, ninguna solicitud externa.",
  "Place": "Lugar",
  "Empty: your current location.": "Vacío: tu ubicación actual.",
  "The system asks for permission once.": "El sistema pide permiso una vez.",
  "Faster loading.": "Carga más rápida.",
  "Re-creates the calendars once.": "Vuelve a crear los calendarios una vez.",
  "In the spaces bar.": "En la barra de espacios.",
  "Instead": "En su lugar",
  "Only one of them, in the place of Chat.": "Solo uno, en el lugar del chat.",
  "Nothing": "Nada",
  "Opens unchanged in its own tab.": "Se abre sin cambios en su propia pestaña.",
  "Opens like an app.": "Se abre como una app.",
  "No address bar. Links to other sites open in your browser.": "Sin barra de direcciones. Los enlaces a otros sitios se abren en el navegador.",
  "Original: unchanged on a white surface.": "Original: sin cambios sobre fondo blanco.",
  "Questions appear as a sheet at the top.": "Las preguntas aparecen arriba en la ventana.",
  "Dialogs without title bar. For newly opened windows.": "Diálogos sin barra de título. Para ventanas nuevas.",
  "From the next start.": "A partir del próximo inicio.",
  "Writes a userChrome.css into your profile.": "Escribe un userChrome.css en tu perfil.",
  "At most every 6 hours.": "Como máximo cada 6 horas.",
  "Active after a restart.": "Activo tras reiniciar.",
  "After a restart.": "Tras reiniciar.",
  "mail-cards-debug.log in the profile.": "mail-cards-debug.log en el perfil.",
  "Includes sender addresses.": "Incluye las direcciones de los remitentes.",
  "halo.spaces Settings": "Ajustes de halo.spaces",
  "Yes": "Sí",
  "The symbol next to the title then shows the weather. Asks open-meteo.com about every 30 minutes.": "El símbolo junto al título mostrará el tiempo. Consulta open-meteo.com cada 30 minutos aprox.",
  "Do you use Chat?": "¿Usas el chat?",
  "Instead in its place:": "En su lugar:",
  "Saved": "Guardado",
  "Thunderbird now looks calm and tidy.": "Thunderbird ahora se ve tranquilo y ordenado.",
  "Light and dark now follow your system.": "Claro y oscuro siguen ahora a tu sistema.",
  "halo.spaces is made for macOS. On Windows and Linux it is still being tested. If something looks odd, we'd love a quick note!": "halo.spaces está hecho para macOS. En Windows y Linux aún se está probando. Si algo se ve raro, ¡agradecemos un breve aviso!",
  "Installed. Active in a moment.": "Instalado. Activo en un momento.",
  "No connection. Try again.": "Sin conexión. Inténtalo de nuevo.",
  "Only messages from this folder. Turn on Global Search to include your replies from Sent.": "Solo mensajes de esta carpeta. Activa la búsqueda global para incluir tus respuestas de Enviados.",
  "Location access is off. Allow it in System Settings or enter a city.": "El acceso a la ubicación está desactivado. Permítelo en Ajustes del sistema o escribe una ciudad.",
  "Location unavailable. Enter a city.": "Ubicación no disponible. Escribe una ciudad.",
  "macOS asks for access once.": "macOS pide acceso una vez.",
};
const IT = {
  "Install version {v}": "Installa la versione {v}",
  "+{n} more": "+{n} altri",
  "{n} message": "{n} messaggio",
  "{n} messages": "{n} messaggi",
  "{n} contact": "{n} contatto",
  "{n} contacts": "{n} contatti",
  "{name}’s Birthday": "Compleanno di {name}",
  "Born {year}": "Nato/a nel {year}",
  "Hi,": "Ciao,",
  "1 day before": "1 giorno prima",
  "1 hour before": "1 ora prima",
  "15 minutes before": "15 minuti prima",
  "30 minutes before": "30 minuti prima",
  "5 minutes before": "5 minuti prima",
  "Add": "Aggiungi",
  "Add Alert or Repeat": "Aggiungi avviso o ripetizione",
  "Add Due Date or Alert": "Aggiungi scadenza o avviso",
  "Add Invitees…": "Aggiungi invitati…",
  "Add Location": "Aggiungi luogo",
  "Add Notes or URL": "Aggiungi note o URL",
  "Alert": "Avviso",
  "All Day": "Tutto il giorno",
  "all-day": "tutto il giorno",
  "Appearance": "Aspetto",
  "At time of event": "All’ora dell’evento",
  "Automatic (like macOS)": "Automatico (come macOS)",
  "Birthdays": "Compleanni",
  "Busy": "Occupato",
  "Cancel": "Annulla",
  "Checking for updates …": "Ricerca aggiornamenti …",
  "Dark": "Scuro",
  "Delete": "Elimina",
  "Due": "Scadenza",
  "Ends": "Fine",
  "Event": "Evento",
  "Every Day": "Ogni giorno",
  "Every Month": "Ogni mese",
  "Every Week": "Ogni settimana",
  "Every Year": "Ogni anno",
  "Forward": "Inoltra",
  "Free": "Libero",
  "halo.spaces is up to date": "halo.spaces è aggiornato",
  "Hide Sidebar": "Nascondi barra laterale",
  "Hide Spaces": "Nascondi spazi",
  "Hide Today Pane": "Nascondi pannello Oggi",
  "Installation failed": "Installazione non riuscita",
  "Installing …": "Installazione …",
  "Light": "Chiaro",
  "Light, dark or follow macOS": "Chiaro, scuro o come macOS",
  "Contacts": "Contatti",
  "Show Address Book “{name}”": "Mostra la rubrica “{name}”",
  "Merge Duplicate Contacts": "Unisci contatti duplicati",
  "Message List Display Options": "Opzioni di visualizzazione dell’elenco",
  "More Options…": "Altre opzioni…",
  "Never": "Mai",
  "New Event": "Nuovo evento",
  "New Task": "Nuova attività",
  "Next Month": "Mese successivo",
  "No calendar for tasks": "Nessun calendario per le attività",
  "No Due Date": "Nessuna scadenza",
  "No writable calendar": "Nessun calendario modificabile",
  "None": "Nessuno",
  "Previous Month": "Mese precedente",
  "Repeat": "Ripeti",
  "Reply": "Rispondi",
  "Reply All": "Rispondi a tutti",
  "Show Outbox": "Mostra posta in uscita",
  "The message could not be sent": "Impossibile inviare il messaggio",
  "The message was kept in the Outbox.": "Il messaggio è rimasto nella posta in uscita.",
  "Show As": "Mostra come",
  "Show Names As": "Mostra nomi come",
  "Show Sidebar": "Mostra barra laterale",
  "Show Spaces": "Mostra spazi",
  "Show Today Pane": "Mostra pannello Oggi",
  "Sort": "Ordina",
  "Starts": "Inizio",
  "Task": "Attività",
  "View": "Visualizza",
  "Preview Lines": "Righe di anteprima",
  "1 Line": "1 riga",
  "{n} Lines": "{n} righe",
  "Logos from sender websites": "Loghi dai siti dei mittenti",
  "Photos from the Contacts app": "Foto dall’app Contatti",
  "macOS asks for access once": "macOS chiede l’accesso una volta",
  "Calendar": "Calendario",
  "Emojis before event titles": "Emoji prima dei titoli degli eventi",
  "🎂 birthday, 🏋️ training, 🦷 dentist …": "🎂 compleanno, 🏋️ allenamento, 🦷 dentista …",
  "Own keywords": "Parole chiave personali",
  "Book club = 📖\nChoir = 🎶": "Club del libro = 📖\nCoro = 🎶",
  "Offline copy for online calendars": "Copia offline dei calendari online",
  "halo.spaces design": "Design di halo.spaces",
  "Own icons": "Icone proprie",
  "Troubleshooting": "Risoluzione dei problemi",
  "Detailed log": "Registro dettagliato",
  "saved": "salvato",
  "Check for Updates": "Cerca aggiornamenti",
  "Settings…": "Impostazioni…",
  "Send Feedback": "Invia feedback",
  "Say Thanks": "Dì grazie",
  "Mail": "Posta",
  "This message is from a mailing list.": "Questo messaggio proviene da una mailing list.",
  "Unsubscribe": "Annulla iscrizione",
  "Unsubscribe from messages from {name}?": "Non ricevere più messaggi da {name}?",
  "The sender will be told directly that you no longer want these messages.": "Il mittente verrà informato direttamente che non desideri più questi messaggi.",
  "Close": "Chiudi",
  "More name fields": "Altri campi del nome",
  "Fewer name fields": "Meno campi del nome",
  "More fields": "Altri campi",
  "Fewer fields": "Meno campi",
  "Updates": "Aggiornamenti",
  "Install updates at start": "Installa gli aggiornamenti all’avvio",
  "Messages in system font": "Messaggi nel font di sistema",
  "Yesterday": "Ieri",
  "No Results": "Nessun risultato",
  "No tasks match your search.": "Nessuna attività corrisponde alla ricerca.",
  "No Tasks": "Nessuna attività",
  "Tasks you add appear here.": "Le attività aggiunte appaiono qui.",
  "No tasks in this view.": "Nessuna attività in questa vista.",
  "No Task List Selected": "Nessun elenco attività selezionato",
  "Choose a calendar that supports tasks in the sidebar.": "Scegli nella barra laterale un calendario che supporta le attività.",
  "Searching": "Ricerca",
  "All Mailboxes": "Tutte le caselle",
  "{n} result": "{n} risultato",
  "{n} results": "{n} risultati",
  "Address Books": "Rubriche",
  "Today Pane": "Pannello Oggi",
  "Search": "Cerca",
  "Search Contacts": "Cerca contatti",
  "Search Tasks": "Cerca attività",
  "Search All Mailboxes": "Cerca in tutte le caselle",
  "Welcome to halo.spaces": "Benvenuto in halo.spaces",
  "Open Settings": "Apri impostazioni",
  "Continue": "Continua",
  "Time": "Ora",
  "Tint unread messages": "Evidenzia i messaggi non letti",
  "You unsubscribed from this mailing list.": "Hai annullato l’iscrizione a questa lista.",
  "Card View": "Vista a schede",
  "Table View: Classic": "Tabella: classica",
  "Show Contact Photo": "Mostra foto del contatto",
  "Show Only Unread Messages": "Mostra solo i messaggi non letti",
  "Show All Messages": "Mostra tutti i messaggi",
  "Design without flicker at start": "Design senza sfarfallio all’avvio",
  "Show whole conversation": "Mostra l’intera conversazione",
  "Search Calendar": "Cerca nel calendario",
  "Search Chat": "Cerca nella chat",
  "Search Settings": "Cerca nelle impostazioni",
  "Search {name}": "Cerca in «{name}»",
  "Title": "Titolo",
  "Add Location or Video Call": "Aggiungi luogo o videochiamata",
  "Add Invitees": "Aggiungi invitati",
  "Filter Tasks": "Filtra attività",
  "Choose…": "Scegli…",
  "Zoom": "Zoom",
  "Table View": "Vista tabella",
  "Dialogs inside the window": "Finestre di dialogo nella finestra",
  "Hide “Collected Addresses”": "Nascondi “Collected Addresses”",
  "Show Format Bar": "Mostra barra di formattazione",
  "Hide Format Bar": "Nascondi barra di formattazione",
  "Begin forwarded message:": "Inizio messaggio inoltrato:",
  "Today, {time}": "Oggi, {time}",
  "Yesterday, {time}": "Ieri, {time}",
  "Show": "Mostra",
  "Keyboard Shortcuts": "Scorciatoie da tastiera",
  "Show all keyboard shortcuts of Thunderbird": "Mostra tutte le scorciatoie da tastiera di Thunderbird",
  "Dark backgrounds for messages": "Sfondi scuri per i messaggi",
  "{n} task": "{n} attività",
  "{n} tasks": "{n} attività",
  "Tasks": "Attività",
  "Task List Display Options": "Opzioni di visualizzazione dell’elenco attività",
  "Weather in the Today Pane": "Meteo nel pannello Oggi",
  "Current location": "Posizione attuale",
  "City not found": "Città non trovata",
  "Weather in the Today Pane?": "Meteo nel pannello Oggi?",
  "City …": "Città …",
  "No": "No",
  "e.g. Vienna": "es. Vienna",
  "OK": "OK",
  "Open System Settings": "Apri impostazioni di sistema",
  "Locating …": "Localizzazione …",
  "Searching …": "Ricerca …",
  "Weather data: Open-Meteo.com, CC BY 4.0": "Dati meteo: Open-Meteo.com, CC BY 4.0",
  "Undo Send": "Annulla invio",
  "Sending {n} messages …": "Invio di {n} messaggi …",
  "Sending “{s}” …": "Invio di «{s}» …",
  "Sending …": "Invio …",
  "Off": "Disattivato",
  "seconds": "secondi",
  "More …": "Altro …",
  "Send": "Invia",
  "Reply to {name} …": "Rispondi a {name} …",
  "Reply sent": "Risposta inviata",
  "Send Later": "Invia più tardi",
  "Send Now": "Invia ora",
  "Send {time} Tonight": "Invia stasera alle {time}",
  "Send {time} Tomorrow": "Invia domani alle {time}",
  "Send Later …": "Invia più tardi …",
  "Schedule": "Pianifica",
  "Remind Me": "Ricordamelo",
  "Remind Me in 1 Hour": "Ricorda tra 1 ora",
  "Remind Me Tonight": "Ricorda stasera",
  "Remind Me Tomorrow": "Ricorda domani",
  "Remind Me Next Week": "Ricorda la prossima settimana",
  "Reminder": "Promemoria",
  "(no subject)": "(nessun oggetto)",
  "Follow Up": "Sollecita",
  "Dismiss": "Ignora",
  "No reply for {d} days: “{s}” to {to}": "Nessuna risposta da {d} giorni: «{s}» a {to}",
  "My Location": "La mia posizione",
  "Spaces": "Spazi",
  "Chat": "Chat",
  "Space of an add-on": "Spazio di un componente aggiuntivo",
  "Website": "Sito web",
  "Add-on": "Componente aggiuntivo",
  "Address": "Indirizzo",
  "In the space colour": "Nel colore dello spazio",
  "Original": "Originale",
  "Symbol": "Simbolo",
  "No add-on with its own space installed": "Nessun componente con spazio proprio installato",
  "none installed": "nessuno installato",
  "Not a valid web address": "Indirizzo web non valido",
  "Website …": "Sito web …",
  "e.g. calendar.example.com": "es. calendario.example.com",
  "Received and sent messages together.": "Messaggi ricevuti e inviati insieme.",
  "From all folders, newest first.": "Da tutte le cartelle, i più recenti prima.",
  "Light accent colour behind unread messages.": "Colore d’accento chiaro dietro i messaggi non letti.",
  "Time to take a sent message back.": "Tempo per riprendere un messaggio inviato.",
  "Only from the sender’s own website.": "Solo dal sito web del mittente.",
  "Favicon or BIMI logo of the sender’s domain. Off: no outside requests.": "Favicon o logo BIMI del dominio del mittente. Disattivato: nessuna richiesta esterna.",
  "In dark mode.": "In modalità scura.",
  "Thunderbird recolours HTML messages carefully. Images stay as they are.": "Thunderbird ricolora i messaggi HTML con cura. Le immagini restano invariate.",
  "Calm and easy to read.": "Calmo e facile da leggere.",
  "Messages with their own font keep it. Off: Thunderbird’s fonts.": "I messaggi con un proprio carattere lo mantengono. Disattivato: caratteri di Thunderbird.",
  "In the address book sidebar.": "Nella barra laterale della rubrica.",
  "Completion while writing keeps working.": "Il completamento durante la scrittura continua a funzionare.",
  "One per line: keyword = emoji. They take precedence.": "Uno per riga: parola chiave = emoji. Hanno la precedenza.",
  "The symbol next to the title shows the weather.": "Il simbolo accanto al titolo mostra il meteo.",
  "Asks open-meteo.com about every 30 minutes. Off: the sun stays, no outside requests.": "Interroga open-meteo.com circa ogni 30 minuti. Disattivato: il sole resta, nessuna richiesta esterna.",
  "Place": "Luogo",
  "Empty: your current location.": "Vuoto: la tua posizione attuale.",
  "The system asks for permission once.": "Il sistema chiede il permesso una volta.",
  "Faster loading.": "Caricamento più rapido.",
  "Re-creates the calendars once.": "Ricrea i calendari una volta.",
  "In the spaces bar.": "Nella barra degli spazi.",
  "Instead": "Al suo posto",
  "Only one of them, in the place of Chat.": "Solo uno, al posto della chat.",
  "Nothing": "Niente",
  "Opens unchanged in its own tab.": "Si apre invariato nella propria scheda.",
  "Opens like an app.": "Si apre come un’app.",
  "No address bar. Links to other sites open in your browser.": "Senza barra degli indirizzi. I link ad altri siti si aprono nel browser.",
  "Original: unchanged on a white surface.": "Originale: invariato su fondo bianco.",
  "Questions appear as a sheet at the top.": "Le domande appaiono in alto nella finestra.",
  "Dialogs without title bar. For newly opened windows.": "Finestre di dialogo senza barra del titolo. Per le nuove finestre.",
  "From the next start.": "Dal prossimo avvio.",
  "Writes a userChrome.css into your profile.": "Scrive un userChrome.css nel tuo profilo.",
  "At most every 6 hours.": "Al massimo ogni 6 ore.",
  "Active after a restart.": "Attivo dopo un riavvio.",
  "After a restart.": "Dopo un riavvio.",
  "mail-cards-debug.log in the profile.": "mail-cards-debug.log nel profilo.",
  "Includes sender addresses.": "Contiene gli indirizzi dei mittenti.",
  "halo.spaces Settings": "Impostazioni di halo.spaces",
  "Yes": "Sì",
  "The symbol next to the title then shows the weather. Asks open-meteo.com about every 30 minutes.": "Il simbolo accanto al titolo mostrerà il meteo. Interroga open-meteo.com circa ogni 30 minuti.",
  "Do you use Chat?": "Usi la chat?",
  "Instead in its place:": "Al suo posto:",
  "Saved": "Salvato",
  "Thunderbird now looks calm and tidy.": "Ora Thunderbird appare calmo e ordinato.",
  "Light and dark now follow your system.": "Chiaro e scuro ora seguono il tuo sistema.",
  "halo.spaces is made for macOS. On Windows and Linux it is still being tested. If something looks odd, we'd love a quick note!": "halo.spaces è pensato per macOS. Su Windows e Linux è ancora in prova. Se qualcosa sembra strano, ci farebbe piacere un breve messaggio!",
  "Installed. Active in a moment.": "Installato. Attivo tra un attimo.",
  "No connection. Try again.": "Nessuna connessione. Riprova.",
  "Only messages from this folder. Turn on Global Search to include your replies from Sent.": "Solo messaggi di questa cartella. Attiva la ricerca globale per includere le tue risposte da Inviati.",
  "Location access is off. Allow it in System Settings or enter a city.": "La localizzazione è disattivata. Consentila nelle Impostazioni di sistema o inserisci una città.",
  "Location unavailable. Enter a city.": "Posizione non disponibile. Inserisci una città.",
  "macOS asks for access once.": "macOS chiede l’accesso una volta.",
};
const TRANSLATIONS = { de: DE, fr: FR, es: ES, it: IT };
// tr("+{n} more", { n: 3 }) – Platzhalter in geschweiften Klammern
function uiLanguage() {
  const lang = Services.locale.appLocaleAsBCP47.split("-")[0];
  return TRANSLATIONS[lang] ? lang : "en";
}
function tr(english, vars = null) {
  const text = TRANSLATIONS[uiLanguage()]?.[english] ?? english;
  return vars ? text.replace(/\{(\w+)\}/g, (all, key) => (key in vars ? String(vars[key]) : all)) : text;
}

const STYLE_ID = "mail-cards-style";
const TOOLBAR_PREF = "extensions.mailcards.toolbarApplied";
const PREVIEW_PREF = "extensions.mailcards.previewLines";
// Kontaktfoto bzw. Initialen links in den Karten (Drei-Punkte-Menü über der Liste)
const CONTACT_PHOTOS_PREF = "extensions.mailcards.contactPhotos";
// Reihenfolge wie in der Apple-Mail-Toolbar: Abrufen, Verfassen |
// Antworten, Allen antworten, Weiterleiten | Archiv, Löschen, Spam |
// Verschieben | Markieren … Suchfeld ganz rechts.
const APPLE_TOOLBAR = [
  "spacer",
  "get-messages",
  "write-message",
  "reply",
  "reply-all",
  "forward-inline",
  "archive",
  "delete",
  "junk",
  "move-to",
  "mark-as",
  "spacer",
  "search-bar",
];
// Gleiches Layout in den übrigen Bereichen: Knöpfe links, Suchfeld rechts.
// Adressbuch: „Neuer Kontakt“ (mit Text) | Kapsel „Neues Adressbuch · Neue Liste“.
const SPACE_TOOLBARS = {
  addressbook: ["spacer", "create-contact", "create-address-book", "create-list", "spacer", "search-bar"],
  calendar: ["spacer", "new-event", "new-task", "spacer", "search-bar"],
  tasks: ["spacer", "new-task", "new-event", "spacer", "search-bar"],
  chat: ["spacer", "spacer", "search-bar"],
  settings: ["spacer", "spacer", "search-bar"],
};
const SPACE_TOOLBAR_PREF = "extensions.mailcards.spaceToolbarsApplied";
// Feedback aus dem Hilfe-Menü geht an diese Adresse
const FEEDBACK_ADDRESS = "halo.cat@icloud.com";
// „Danke sagen“ im Info-Fenster; UTM-Parameter zeigen in Google Analytics
// der Spendenseite, dass der Aufruf aus halo.spaces kam
const DONATE_URL = "https://buymeacoffee.com/diversion"
  + "?utm_source=halo.spaces&utm_medium=thunderbird-addon&utm_campaign=donate&utm_content=about-window";
const CACHE_FILE = "mail-cards-logos.json";
const DAY = 24 * 60 * 60 * 1000;
const HIT_TTL = 30 * DAY;
const MISS_TTL = 7 * DAY;
const FETCH_TIMEOUT = 6000;

// Kontofarben – überall gleich (Mail, Adressbuch): die in den
// Kontoeinstellungen gewählte Farbe, sonst eine feste Farbe aus dem Namen.
// Adressbücher heißen wie ihr Konto (Google, iCloud) und bekommen dieselbe.
const ACCOUNT_PALETTE = ["#0A84FF", "#30B850", "#FF8A00", "#FF2D78", "#AF52DE", "#8E8E93"];
function accountColor(name) {
  try {
    const { FolderTreeProperties } = ChromeUtils.importESModule("resource:///modules/FolderTreeProperties.sys.mjs");
    for (const server of MailServices.accounts.allServers) {
      if (server.prettyName == name) {
        const color = FolderTreeProperties.getColor(server.rootFolder.URI);
        if (color) {
          return color;
        }
        break;
      }
    }
  } catch {}
  return ACCOUNT_PALETTE[[...String(name)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % ACCOUNT_PALETTE.length];
}
// Farbpunkt vor Konto- und Adressbuchnamen (Ordnerliste, Adressbuchliste):
// --mc-acc an der Zeile, gezeichnet von userChrome.css
function colorAccountRows(doc, restorers = null) {
  const paint = () => {
    // Kontonamen bei jedem Lauf frisch lesen: umbenannte oder neue Konten
    // sollen ihren Punkt sofort bekommen, nicht erst nach einem Neustart
    const names = new Set();
    try {
      for (const server of MailServices.accounts.allServers) {
        if (server.type != "none") {
          names.add(server.prettyName); // „Lokale Ordner“ bleibt ohne Farbe
        }
      }
    } catch {}
    for (const li of doc.querySelectorAll("#folderTree li, #books li.bookRow")) {
      const name = (li.querySelector(":scope > .container .name, .bookRow-name")?.textContent || "").trim();
      if (names.has(name)) {
        const c = accountColor(name);
        if (li.style.getPropertyValue("--mc-acc") != c) {
          li.style.setProperty("--mc-acc", c);
        }
      } else if (li.style.getPropertyValue("--mc-acc")) {
        li.style.removeProperty("--mc-acc");
      }
    }
  };
  paint();
  if (!doc.__mcAccRows) {
    doc.__mcAccRows = true;
    const target = doc.getElementById("folderTree") || doc.getElementById("books");
    let mo = null;
    if (target) {
      let pending = false;
      mo = new doc.defaultView.MutationObserver(() => {
        if (!pending) {
          pending = true;
          doc.defaultView.setTimeout(() => { pending = false; paint(); }, 50);
        }
      });
      mo.observe(target, { childList: true, subtree: true });
    }
    const obs = { observe: () => paint() };
    Services.obs.addObserver(obs, "server-color-changed");
    let removed = false;
    const cleanup = () => {
      mo?.disconnect();
      if (!removed) {
        removed = true;
        try {
          Services.obs.removeObserver(obs, "server-color-changed");
        } catch {}
      }
    };
    doc.defaultView.addEventListener("unload", cleanup, { once: true });
    // beim Abschalten/Update: sonst malt die alte Fassung weiter
    restorers?.push(() => {
      cleanup();
      delete doc.__mcAccRows;
    });
  }
}

// sehr dunkle Farben (Schwarz, Dunkelgrau) brauchen im Dunkelmodus Hilfe
function isVeryDark(color) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(color).trim());
  if (!m) {
    return false;
  }
  const n = parseInt(m[1], 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) < 70;
}

// Adressbuch: „Total contacts …“ unten erscheint erst, wenn alle Bücher
// geladen sind – bis dahin bleibt die Zeile leer. Den zuletzt gezeigten Text
// merken und sofort zeigen; Thunderbird ersetzt ihn mit dem aktuellen Wert.
const CARD_COUNT_PREF = "extensions.mailcards.cardCountText";
function cacheCardCount(doc, restorers = null) {
  const el = doc?.getElementById("cardCount");
  if (!el || el.__mcCached) {
    return;
  }
  el.__mcCached = true;
  if (!el.textContent.trim()) {
    el.textContent = Services.prefs.getStringPref(CARD_COUNT_PREF, "");
  }
  const remember = () => {
    const text = el.textContent.trim();
    // nur die Gesamtzahl „aller Adressbücher“ merken (so öffnet das Adressbuch)
    if (text && el.hasAttribute("data-l10n-id") && doc.getElementById("books")?.selectedIndex == 0 &&
        text != Services.prefs.getStringPref(CARD_COUNT_PREF, "")) {
      Services.prefs.setStringPref(CARD_COUNT_PREF, text);
    }
  };
  remember();
  const mo = new doc.defaultView.MutationObserver(remember);
  mo.observe(el, { childList: true, characterData: true, subtree: true });
  restorers?.push(() => {
    mo.disconnect();
    delete el.__mcCached;
  });
}

// Einstellungen → Appearance: „Erscheinungsbild“ Automatisch / Hell / Dunkel.
// Schaltet zwischen Thunderbirds eingebauten Themes um; das Design folgt dem
// über prefers-color-scheme (die Themes „System“, „Light“, „Dark“).
const APPEARANCE_THEMES = {
  auto: "default-theme@mozilla.org",
  light: "thunderbird-compact-light@mozilla.org",
  dark: "thunderbird-compact-dark@mozilla.org",
};
// Kennung dieser geladenen Fassung: Einfügungen einer älteren Fassung (Update
// ohne Neustart, 3.2.0 räumte sie nicht weg) werden ersetzt statt übernommen
const HOOK_OWNER = {};
// vorhandenes Element dieser Fassung liefern, das einer älteren entfernen
function ownedElement(doc, id) {
  const el = doc.getElementById(id);
  if (el && el.__mcOwner !== HOOK_OWNER) {
    el.remove();
    return null;
  }
  return el;
}

// Adressbuch: kleine Überschrift über der Liste wie „Favoriten“ in der Mail
// und „Kalender“ im Kalender
function hookBooksHeader(cw, restorers = null) {
  const doc = cw.document;
  const books = doc.getElementById("books");
  if (!books || ownedElement(doc, "mcBooksHeader")) {
    return;
  }
  const header = doc.createElement("div");
  header.id = "mcBooksHeader";
  header.__mcOwner = HOOK_OWNER;
  header.textContent = tr("Address Books");
  books.before(header);
  restorers?.push(() => header.remove());
}

function hookAppearanceChoice(cw, restorers = null) {
  const doc = cw.document;
  const colorGroup = doc.getElementById("colorGroup");
  if (!colorGroup) {
    return;
  }
  const existing = ownedElement(doc, "mcAppearanceGroup");
  if (existing) {
    // Thunderbird blendet beim Seitenwechsel alles ohne passende Kategorie aus
    existing.setAttribute("data-category", "paneAppearance");
    existing.hidden = colorGroup.hidden;
    return;
  }
  const X = "http://www.w3.org/1999/xhtml";
  const group = doc.createElementNS(X, "fieldset");
  group.id = "mcAppearanceGroup";
  group.__mcOwner = HOOK_OWNER;
  group.setAttribute("data-category", "paneAppearance");
  group.hidden = colorGroup.hidden;
  const legend = doc.createElementNS(X, "legend");
  legend.textContent = tr("Appearance");
  const row = doc.createXULElement("hbox");
  row.setAttribute("align", "center");
  const label = doc.createXULElement("label");
  label.setAttribute("value", tr("Light, dark or follow macOS"));
  label.setAttribute("flex", "1");
  const list = doc.createXULElement("menulist");
  list.id = "mcAppearance";
  const popup = doc.createXULElement("menupopup");
  for (const [value, text] of [["auto", tr("Automatic (like macOS)")], ["light", tr("Light")], ["dark", tr("Dark")]]) {
    const item = doc.createXULElement("menuitem");
    item.setAttribute("value", value);
    item.setAttribute("label", text);
    popup.appendChild(item);
  }
  list.appendChild(popup);
  row.append(label, list);
  group.append(legend, row);
  colorGroup.before(group);
  restorers?.push(() => group.remove());
  const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
  const sync = async () => {
    const themes = await AddonManager.getAddonsByTypes(["theme"]);
    const active = themes.find(a => a.isActive)?.id;
    const key = Object.keys(APPEARANCE_THEMES).find(k => APPEARANCE_THEMES[k] == active);
    list.value = key || "auto";
  };
  sync();
  list.addEventListener("command", async () => {
    const addon = await AddonManager.getAddonByID(APPEARANCE_THEMES[list.value]);
    await addon?.enable();
  });
}

// Einstellungen: Kontoeinstellungen, Add-ons und halo.spaces als eigene
// Kategorien in der Seitenleiste. Ihr Inhalt erscheint rechts im selben Tab
// (die Seitenleiste mit General, Appearance … bleibt stehen) – statt wie bei
// Thunderbird in eigenen Tabs über die Links unten in der Leiste. Diese
// Links bleiben im Dokument (Thunderbird ruft sie evtl. selbst auf), nur
// ausgeblendet. Die halo.spaces-Seite ist dieselbe wie „Add-ons → halo.spaces
// → Einstellungen“ (options_ui), eingebettet wie dort.
const PREF_PANES = [
  { value: "paneMcAccounts", footer: "accountButton", src: "about:accountsettings" },
  { value: "paneMcAddons", footer: "addonsButton", src: "about:addons" },
  // Symbol ohne seine weiße Kachel, auf den Ring zugeschnitten – so groß wie die farbigen Kacheln der übrigen
  { value: "paneMcHalo", label: "halo.spaces", icon: "resource://mailcards/about/icon.svg", crop: "8 8 48 48", options: true },
];
const HALO_PANE = "paneMcHalo";
const dataURIs = new Map();
// crop: neuer viewBox („x y b h“) – dann ohne das erste <rect> (Kachel des Symbols)
function dataURI(url, crop = null) {
  const key = url + (crop || "");
  if (!dataURIs.has(key)) {
    const channel = NetUtil.newChannel({ uri: url, loadUsingSystemPrincipal: true });
    const stream = channel.open();
    let text = NetUtil.readInputStreamToString(stream, stream.available(), { charset: "UTF-8" });
    stream.close();
    if (crop) {
      text = text.replace(/viewBox="[^"]*"/, `viewBox="${crop}"`).replace(/<rect\b[^>]*\/>/, "");
    }
    dataURIs.set(key, "data:image/svg+xml;charset=utf-8," + encodeURIComponent(text));
  }
  return dataURIs.get(key);
}
function hookPrefCategories(cw, restorers = null) {
  const doc = cw.document;
  const categories = doc.getElementById("categories");
  const deck = doc.getElementById("paneDeck");
  if (!categories || !deck || typeof cw.register_module != "function") {
    return;
  }
  if (ownedElement(doc, "mcCat-" + HALO_PANE)) {
    return;
  }
  // Reste einer älteren Fassung (Update ohne Neustart) entfernen
  for (const old of doc.querySelectorAll(".mc-embed-cat, .mc-embed-pane, .mc-subcats")) {
    old.remove();
  }
  // Kontoeinstellungen und Add-ons laufen nicht innerhalb dieser Seite: Sie
  // greifen auf „top“ zu (top.frames.contentFrame …), das wäre hier die
  // Einstellungsseite. Ihr Browser liegt deshalb im Hauptfenster über der
  // Fläche rechts der Seitenleiste – wie in einem eigenen Tab
  const host = cw.browsingContext?.embedderElement?.parentNode;
  const overlays = new Map();
  const detach = [];
  const X = "http://www.w3.org/1999/xhtml";
  const added = [];
  for (const pane of PREF_PANES) {
    const link = pane.footer ? doc.getElementById(pane.footer) : null;
    const label = pane.label || link?.querySelector(".sidebar-footer-label")?.textContent.trim() ||
      link?.querySelector(".sidebar-footer-label")?.getAttribute("value");
    if (!label || (!pane.options && !host)) {
      continue; // Fußzeile noch nicht übersetzt – beim nächsten Aufruf
    }
    const item = doc.createXULElement("richlistitem");
    item.id = "mcCat-" + pane.value;
    item.__mcOwner = HOOK_OWNER;
    item.className = "category mc-embed-cat";
    item.setAttribute("value", pane.value);
    item.setAttribute("align", "center");
    item.setAttribute("tooltiptext", label);
    const img = doc.createElementNS(X, "img");
    img.className = "category-icon";
    img.setAttribute("alt", "");
    // about:preferences lässt Bilder nur aus chrome:, data: … zu (CSP) – eigenes Symbol als data:
    img.src = pane.icon ? dataURI(pane.icon, pane.crop) : link?.querySelector("img")?.src || "";
    const name = doc.createXULElement("label");
    name.className = "category-name";
    name.setAttribute("flex", "1");
    name.textContent = label;
    item.append(img, name);
    categories.append(item);
    // Unterpunkte der Seite direkt darunter (nur bei gewählter Kategorie sichtbar)
    let subs = null;
    if (pane.src) {
      subs = doc.createXULElement("vbox");
      subs.className = "mc-subcats";
      subs.id = "mcSub-" + pane.value;
      subs.hidden = true;
      categories.append(subs);
      added.push(subs);
    }
    // Inhalt: leere Fläche (Thunderbird zeigt beim Wechsel nur, was zur
    // Kategorie gehört), die Seite lädt erst beim ersten Öffnen
    const box = doc.createXULElement("vbox");
    box.className = "mc-embed-pane";
    box.id = "mcPane-" + pane.value;
    box.setAttribute("data-category", pane.value);
    // nicht in der Suche der Einstellungen (dort fände man ihren Inhalt nicht)
    box.setAttribute("data-hidden-from-search", "true");
    box.setAttribute("data-subpanel", "true");
    box.hidden = true;
    deck.append(box);
    const init = () => {
      if (pane.options) {
        loadOptionsPane(cw, box);
      } else if (!overlays.has(pane.value)) {
        const browserEl = embedPage(host, pane.src);
        overlays.set(pane.value, browserEl);
        detach.push(attachSubnav(subs, browserEl, pane.src));
        mark();
      }
    };
    try {
      cw.register_module(pane.value, { init });
    } catch (e) {
      log("pref pane register error", pane.value, e);
    }
    added.push(item, box);
  }
  if (!added.length) {
    return;
  }
  // Suche der Einstellungen: die halo.spaces-Seite liegt in einem eigenen
  // Browser, den Thunderbirds Suche nicht sieht – jede Option deshalb auch als
  // eigene, durchsuchbare Zeile (nur in den Suchergebnissen sichtbar, eigene
  // Kategorie ohne Eintrag in der Leiste); Klick zeigt die Option auf der Seite
  const haloBox = doc.getElementById("mcPane-" + HALO_PANE);
  if (haloBox) {
    const showOption = key => {
      haloBox.__mcFocus = key;
      try {
        const input = doc.getElementById("searchInput");
        if (input) {
          input.value = "";
        }
        if (cw.gSearchResultsPane) {
          cw.gSearchResultsPane.query = "";
          cw.gSearchResultsPane.getFindSelection(cw).removeAllRanges();
          cw.gSearchResultsPane.removeAllSearchTooltips();
        }
        doc.getElementById("header-searchResults")?.setAttribute("hidden", "true");
        doc.getElementById("no-results-message")?.setAttribute("hidden", "true");
      } catch {}
      cw.gotoPref(HALO_PANE);
      const frame = haloBox.querySelector("browser");
      if (frame?.currentURI?.spec.startsWith(extensionBaseURL)) {
        frame.fixupAndLoadURIString(`${extensionBaseURL}options/options.html?in=prefs#s-${key}`,
          { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
      }
    };
    for (const [section, rows] of haloSections()) {
      for (const row of rows) {
        if ((row.mac && Services.appinfo.OS != "Darwin") || (row.needs && !settingNeeds()[row.needs])) {
          continue;
        }
        const entry = doc.createXULElement("hbox");
        entry.className = "mc-halo-found";
        entry.setAttribute("data-category", "paneMcHaloSearch");
        entry.setAttribute("align", "center");
        entry.hidden = true;
        const text = doc.createXULElement("vbox");
        text.setAttribute("flex", "1");
        const where = doc.createElementNS(X, "div");
        where.className = "mc-halo-found-where";
        where.textContent = `halo.spaces › ${section}`;
        const name = doc.createElementNS(X, "div");
        name.className = "mc-halo-found-name";
        name.textContent = row.label;
        const hint = doc.createElementNS(X, "div");
        hint.className = "mc-halo-found-hint";
        hint.textContent = row.hint || "";
        text.append(where, name, hint);
        const button = doc.createElementNS(X, "button");
        button.className = "mc-halo-found-show";
        button.textContent = tr("Show");
        button.addEventListener("click", () => showOption(row.key));
        entry.append(text, button);
        deck.append(entry);
        added.push(entry);
      }
    }
  }
  const footer = doc.querySelector("#pref-category-box .sidebar-footer-list");
  if (footer) {
    footer.hidden = true;
  }
  // Fläche der eingebetteten Seiten: rechts neben der Seitenleiste (folgt
  // ihrem Ein-/Ausblenden und ihrer Breite)
  const sidebar = doc.getElementById("pref-category-box");
  // (Browser verhalten sich wie Bilder: Breite und Höhe ausdrücklich, Abstände allein dehnen sie nicht)
  const place = () => {
    const x = Math.max(0, Math.round(rectOf(sidebar)?.right || 0));
    for (const browserEl of overlays.values()) {
      browserEl.style.insetInlineStart = `${x}px`;
      browserEl.style.width = `${Math.max(0, host.clientWidth - x)}px`;
      browserEl.style.height = `${host.clientHeight}px`;
    }
  };
  const ro = new cw.ResizeObserver(place);
  if (sidebar) {
    ro.observe(sidebar);
  }
  ro.observe(doc.documentElement);
  // gewählte Kategorie: Inhalt ohne Thunderbirds 800-px-Spalte, passende Seite zeigen
  // (Unterpunkte nur bei gewählter Kategorie und nicht von Hand zugeklappt)
  let folded = false;
  function mark(event) {
    const value = categories.selectedItem?.value || "";
    if (event) {
      folded = false; // neue Kategorie: Unterpunkte wieder offen
    }
    doc.documentElement.toggleAttribute("mc-embed", PREF_PANES.some(p => p.value == value));
    for (const [key, browserEl] of overlays) {
      browserEl.hidden = key != value;
    }
    for (const subs of categories.querySelectorAll(".mc-subcats")) {
      subs.hidden = folded || subs.id != "mcSub-" + value;
    }
    categories.selectedItem?.toggleAttribute("mc-folded", folded);
    place();
  }
  // erneuter Klick auf die schon gewählte Kategorie klappt ihre Unterpunkte
  // auf bzw. zu (Kontoeinstellungen, Add-ons) – wie Ordner im Finder
  let wasSelected = null;
  const onDown = e => {
    wasSelected = e.button == 0 ? categories.selectedItem : null;
  };
  const onClick = e => {
    const item = e.target.closest?.("richlistitem.mc-embed-cat");
    if (e.button != 0 || !item || item != wasSelected || item != categories.selectedItem ||
      !doc.getElementById("mcSub-" + item.value)) {
      return;
    }
    folded = !folded;
    mark();
  };
  categories.addEventListener("mousedown", onDown, true);
  categories.addEventListener("click", onClick);
  doc.addEventListener("paneSelected", mark);
  mark();
  // Thunderbird wählt beim Öffnen die zuletzt gezeigte Kategorie – war das eine
  // von uns (oder verlangt der Aufruf sie, #mcHalo), gab es sie da noch nicht
  const wanted = (cw.location.hash || "").slice(1);
  const last = Services.xulStore.getValue("about:preferences", "paneDeck", "lastSelected");
  const target = PREF_PANES.find(p => p.value == "pane" + wanted.charAt(0).toUpperCase() + wanted.slice(1)) ||
    (!wanted || wanted == "general" ? PREF_PANES.find(p => p.value == last) : null);
  if (target && doc.getElementById("mcCat-" + target.value)) {
    cw.gotoPref?.(target.value);
  }
  restorers?.push(() => {
    doc.removeEventListener("paneSelected", mark);
    categories.removeEventListener("mousedown", onDown, true);
    categories.removeEventListener("click", onClick);
    ro.disconnect();
    detach.forEach(f => f());
    const was = categories.selectedItem?.classList.contains("mc-embed-cat");
    added.forEach(el => el.remove());
    overlays.forEach(browserEl => browserEl.remove());
    if (footer) {
      footer.hidden = false;
    }
    doc.documentElement.removeAttribute("mc-embed");
    if (was) {
      cw.gotoPref?.("paneGeneral");
    }
  });
}

// Ansicht der Mailliste: nur zwei gültige Kombinationen aus Ansicht
// (mail.threadpane.listview: 0 Karten, 1 Tabelle) und Layout
// (mail.pane_config.dynamic: 0 klassisch, 1 breit, 2 vertikal). Karten gehen
// nur vertikal, Tabelle nur klassisch; „breit“ passt nicht zum Design und
// wird nicht angeboten
const LISTVIEW_PREF = "mail.threadpane.listview";
const PANE_PREF = "mail.pane_config.dynamic";
const VIEW_CHOICES = [["cards", "Card View", 0, 2], ["classic", "Table View: Classic", 1, 0]];
function viewChoice() {
  return Services.prefs.getIntPref(LISTVIEW_PREF, 0) == 0 ? "cards" : "classic";
}
function setViewChoice(key) {
  const [, , list, pane] = VIEW_CHOICES.find(c => c[0] == key) || VIEW_CHOICES[0];
  Services.prefs.setIntPref(PANE_PREF, pane);
  Services.prefs.setIntPref(LISTVIEW_PREF, list);
}
// passend halten: wer (Menü, Tastenkürzel, Thunderbird) das Layout wählt,
// bekommt die Ansicht dazu – und umgekehrt
function syncViewChoice(changed) {
  const list = Services.prefs.getIntPref(LISTVIEW_PREF, 0);
  const pane = Services.prefs.getIntPref(PANE_PREF, 0);
  // „breit“ (alte Einstellung oder Thunderbirds Befehl): Tabelle wird
  // klassisch, Karten bleiben vertikal
  if (pane == 1) {
    Services.prefs.setIntPref(PANE_PREF, list == 0 ? 2 : 0);
    return;
  }
  if (changed == PANE_PREF) {
    const want = pane == 2 ? 0 : 1;
    if (list != want) {
      Services.prefs.setIntPref(LISTVIEW_PREF, want);
    }
  } else if (list == 0 && pane != 2) {
    Services.prefs.setIntPref(PANE_PREF, 2);
  } else if (list == 1 && pane == 2) {
    Services.prefs.setIntPref(PANE_PREF, 0);
  }
}

// Leseansicht wie Apple Mail: die ganze Konversation – empfangene und eigene
// Mails aus allen Ordnern (globaler Suchindex), neueste oben – als Karten
// untereinander, jede mit Thunderbirds vollständiger Mailansicht (about:message).
// Thunderbird zeigt sonst nur die gewählte Mail bzw. bei einem zugeklappten
// Faden eine Textzusammenfassung. Ohne Suchindex: die Mails des Fadens im
// Ordner mit Hinweis. Einstellung „Show whole conversation“ (Standard an)
const CONVERSATION_PREF = "extensions.mailcards.fullConversation";
const CONVERSATION_MAX = 30;
class ConversationCards {
  constructor(win, pane) {
    this.win = win;
    this.pane = pane;
    this.seq = 0;
    this.box = null;
  }

  enabled() {
    return Services.prefs.getBoolPref(CONVERSATION_PREF, true);
  }

  hdrFromURI(uri) {
    try {
      return MailServices.messageServiceFromURI(uri).messageURIToMsgHdr(uri);
    } catch {
      return null;
    }
  }

  // eigene Adressen (alle Identitäten) – eigene Mails werden abgesetzt
  ownAddresses() {
    const set = new Set();
    for (const id of MailServices.accounts.allIdentities) {
      if (id.email) {
        set.add(id.email.toLowerCase());
      }
    }
    return set;
  }

  // alle Mails der Konversation: Suchindex (alle Ordner), sonst Faden im Ordner
  async collect(hdr) {
    let list = [];
    let indexed = false;
    if (Services.prefs.getBoolPref("mailnews.database.global.indexer.enabled", false)) {
      try {
        list = await this.fromGloda(hdr);
        indexed = list.length > 0;
      } catch (e) {
        log("conversation gloda error", e);
      }
    }
    if (!indexed) {
      list = this.fromThread(hdr);
    }
    // gleiche Mail in mehreren Ordnern (Gmail „Alle Nachrichten“, Gesendet) nur
    // einmal – lieber nicht aus Papierkorb/Spam, die gewählte Mail behält ihren Ordner
    const F = Ci.nsMsgFolderFlags;
    const rank = m => (m == hdr ? -1 : m.folder?.getFlag(F.Trash) || m.folder?.getFlag(F.Junk) ? 2 :
      m.folder?.getFlag(F.Archive) || /all mail|alle nachrichten/i.test(m.folder?.name || "") ? 1 : 0);
    const byId = new Map();
    for (const m of list) {
      if (!m) {
        continue;
      }
      const key = m.messageId || m.folder?.getUriForMsg(m);
      const prev = byId.get(key);
      if (!prev || rank(m) < rank(prev)) {
        byId.set(key, m);
      }
    }
    const out = [...byId.values()].filter(m => m == hdr || !(m.folder?.getFlag(F.Trash) || m.folder?.getFlag(F.Junk)));
    out.sort((a, b) => b.date - a.date);
    return { messages: out.slice(0, CONVERSATION_MAX), indexed };
  }

  fromGloda(hdr) {
    const { Gloda } = ChromeUtils.importESModule("resource:///modules/gloda/GlodaPublic.sys.mjs");
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve([]), 3000);
      const done = items => {
        clearTimeout(timer);
        resolve(items);
      };
      const noop = { onItemsAdded() {}, onItemsModified() {}, onItemsRemoved() {} };
      Gloda.getMessageCollectionForHeader(hdr, {
        ...noop,
        onQueryCompleted: collection => {
          const conversation = collection.items[0]?.conversation;
          if (!conversation) {
            done([]);
            return;
          }
          conversation.getMessagesCollection({
            ...noop,
            onQueryCompleted: msgs => done(msgs.items.map(m => m.folderMessage).filter(Boolean)),
          });
        },
      });
    });
  }

  fromThread(hdr) {
    try {
      const thread = this.win.gDBView?.getThreadContainingMsgHdr(hdr) || hdr.folder?.msgDatabase?.getThreadContainingMsgHdr(hdr);
      if (!thread) {
        return [hdr];
      }
      const list = [];
      for (let i = 0; i < thread.numChildren; i++) {
        list.push(thread.getChildHdrAt(i));
      }
      return list;
    } catch {
      return [hdr];
    }
  }

  hide() {
    this.seq++;
    this.reveal();
    if (this.box) {
      this.observer?.disconnect();
      this.box.remove();
      this.box = null;
    }
  }

  // nach Thunderbirds Anzeige: Konversation zeigen, wenn sie mehr als eine Mail hat.
  // Bis die Antwort da ist, bleibt Thunderbirds Ansicht verdeckt (mc-conv-pending) –
  // sonst blitzte kurz die Einzelmail bzw. die Zusammenfassung auf
  async show(hdr, { thread = false } = {}) {
    const token = ++this.seq;
    if (!hdr || !this.enabled()) {
      this.reveal();
      return;
    }
    this.pane.classList.add("mc-conv-pending");
    clearTimeout(this.pendingTimer);
    // Sicherheitsnetz: nie länger als 400 ms leer
    this.pendingTimer = setTimeout(() => this.reveal(), 400);
    try {
      const { messages, indexed } = await this.collect(hdr);
      if (token != this.seq) {
        return;
      }
      if (messages.length >= 2) {
        this.render(messages, hdr, { indexed, thread });
      }
    } finally {
      if (token == this.seq) {
        this.reveal();
      }
    }
  }

  reveal() {
    clearTimeout(this.pendingTimer);
    this.pane.classList.remove("mc-conv-pending");
  }

  render(messages, selected, { indexed }) {
    const win = this.win, doc = win.document;
    const X = "http://www.w3.org/1999/xhtml";
    this.observer?.disconnect();
    this.box?.remove();
    const box = doc.createElementNS(X, "div");
    box.id = "mcConversation";
    box.__mcOwner = HOOK_OWNER;
    const head = doc.createElementNS(X, "div");
    head.className = "mc-conv-head";
    const title = doc.createElementNS(X, "div");
    title.className = "mc-conv-title";
    title.textContent = selected.mime2DecodedSubject || messages[0].mime2DecodedSubject || "";
    const count = doc.createElementNS(X, "div");
    count.className = "mc-conv-count";
    count.textContent = tr("{n} messages", { n: messages.length });
    head.append(title, count);
    box.append(head);
    if (!indexed) {
      const note = doc.createElementNS(X, "div");
      note.className = "mc-conv-note";
      note.textContent = tr("Only messages from this folder. Turn on Global Search to include your replies from Sent.");
      box.append(note);
    }
    const own = this.ownAddresses();
    // eigene Mail: in einem Gesendet-Ordner oder von einer eigenen Adresse
    const ownMail = m => {
      try {
        if (m.folder?.getFlag(Ci.nsMsgFolderFlags.SentMail)) {
          return true;
        }
        return own.has((MailServices.headerParser.parseDecodedHeader(m.mime2DecodedAuthor || m.author)[0]?.email || "").toLowerCase());
      } catch {
        return false;
      }
    };
    const cards = messages.map(m => {
      const card = doc.createElementNS(X, "div");
      card.className = "mc-conv-card";
      card.classList.toggle("mc-own", ownMail(m));
      card.classList.toggle("mc-selected", m == selected || m.messageId == selected.messageId);
      card.dataset.messageId = m.messageId;
      card.__mcHdr = m;
      box.append(card);
      return card;
    });
    this.pane.append(box);
    this.box = box;
    // Karten erst laden, wenn sie in die Nähe kommen (lange Konversationen)
    this.observer = new win.IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          this.observer.unobserve(entry.target);
          this.loadCard(entry.target);
        }
      }
    }, { root: box, rootMargin: "800px 0px" });
    cards.forEach(card => this.observer.observe(card));
    const sel = cards.find(c => c.classList.contains("mc-selected"));
    if (sel && sel != cards[0]) {
      win.requestAnimationFrame(() => sel.scrollIntoView({ block: "start" }));
    }
  }

  loadCard(card) {
    const doc = this.win.document;
    const hdr = card.__mcHdr;
    const browserEl = doc.createXULElement("browser");
    browserEl.setAttribute("src", "about:message");
    browserEl.className = "mc-conv-browser";
    card.append(browserEl);
    const fit = () => {
      try {
        const cdoc = browserEl.contentDocument;
        const mp = cdoc?.getElementById("messagepane");
        const inner = mp?.contentDocument?.documentElement;
        if (!inner) {
          return;
        }
        // Kopf, Anhänge … (alles außer dem Mailtext) plus die volle Höhe des Mailtexts
        const rest = cdoc.documentElement.scrollHeight - mp.getBoundingClientRect().height;
        const height = Math.ceil(rest + Math.max(inner.scrollHeight, inner.offsetHeight)) + 2;
        if (Math.abs(parseFloat(browserEl.style.height || 0) - height) > 1) {
          browserEl.style.height = `${height}px`;
        }
      } catch {}
    };
    browserEl.addEventListener("load", () => {
      const cw = browserEl.contentWindow;
      if (!cw?.displayMessage || card.__mcLoaded) {
        return;
      }
      card.__mcLoaded = true;
      try {
        cw.displayMessage(hdr.folder.getUriForMsg(hdr), this.win.gViewWrapper);
      } catch (e) {
        log("conversation display error", e);
      }
    }, true);
    browserEl.addEventListener("MsgLoaded", () => {
      fit();
      const mp = browserEl.contentDocument?.getElementById("messagepane");
      const iw = mp?.contentWindow;
      if (iw && !mp.__mcFit) {
        mp.__mcFit = true;
        // Bilder laden nach, Zitate klappen auf: Höhe mitführen
        new iw.ResizeObserver(fit).observe(iw.document.documentElement);
        mp.addEventListener("load", () => this.win.setTimeout(fit, 50), true);
      }
      this.win.setTimeout(fit, 300);
    }, true);
  }
}

// „Bewegung reduzieren“ (macOS: Bedienungshilfen → Anzeige; Windows:
// Animationseffekte aus): eigene Animationen springen dann sofort ans Ende
// (1 ms statt 0 – die Schrittfunktionen teilen durch die Dauer)
function motionMs(ms) {
  try {
    const win = Services.wm.getMostRecentWindow("mail:3pane");
    if (win?.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return 1;
    }
  } catch {}
  return ms;
}

// ---------- Senden rückgängig (wie Apple Mail) ----------
// Beim Senden verschwindet das Verfassen-Fenster sofort, unten im Hauptfenster
// steht „Senden rückgängig“. Erst nach der Wartezeit (Einstellung, Standard
// 10 s, 0 = aus) geht die Mail wirklich hinaus; „rückgängig“ zeigt das Fenster
// wieder. Eingehängt wird am cancelable Ereignis „compose-send-message“ –
// Thunderbird hat dann alle Rückfragen (Betreff, Anhang …) schon hinter sich;
// gesendet wird danach mit CompleteGenericSendMessage ohne neue Rückfragen.
// Beendet man Thunderbird währenddessen, gehen wartende Mails vorher hinaus.
const UNDO_SEND_PREF = "extensions.mailcards.undoSend";
const UNDO_SEND_CHOICES = [0, 10, 20, 30];
const UndoSend = {
  pending: new Map(), // Verfassen-Fenster → { msgType, timer, until }
  delay() {
    return Math.max(0, Services.prefs.getIntPref(UNDO_SEND_PREF, 10));
  },
  // im Verfassen-Fenster
  hook(win, cleanups) {
    if (win.__mcUndoSend) {
      return;
    }
    win.__mcUndoSend = true;
    const onSend = event => {
      const msgType = event.detail?.msgType;
      const sending = msgType == Ci.nsIMsgCompDeliverMode.Now || msgType == Ci.nsIMsgCompDeliverMode.Background;
      if (!sending || win.__mcSendNow || !this.delay() || Services.io.offline || typeof win.CompleteGenericSendMessage != "function") {
        return;
      }
      event.preventDefault(); // Thunderbird bricht ab wie bei „Abbrechen“, das Fenster bleibt
      this.hold(win, msgType);
    };
    win.addEventListener("compose-send-message", onSend, true);
    cleanups?.add(() => win.removeEventListener("compose-send-message", onSend, true));
  },
  setVisible(win, visible) {
    try {
      win.docShell.treeOwner.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIAppWindow)
        .QueryInterface(Ci.nsIBaseWindow).visibility = visible;
    } catch (e) {
      log("undo send visibility error", e);
    }
  },
  hold(win, msgType) {
    const ms = this.delay() * 1000;
    this.setVisible(win, false);
    const entry = { msgType, until: Date.now() + ms };
    entry.timer = win.setTimeout(() => this.send(win), ms);
    this.pending.set(win, entry);
    this.observeQuit();
    this.render();
  },
  async send(win) {
    const entry = this.pending.get(win);
    if (!entry) {
      return;
    }
    win.clearTimeout(entry.timer);
    this.pending.delete(win);
    this.render();
    if (win.closed) {
      return;
    }
    win.__mcSendNow = true;
    try {
      await win.CompleteGenericSendMessage(entry.msgType);
    } catch (e) {
      log("undo send error", e);
      this.setVisible(win, true);
    } finally {
      win.__mcSendNow = false;
    }
  },
  undo(win) {
    const entry = this.pending.get(win);
    if (!entry) {
      return;
    }
    win.clearTimeout(entry.timer);
    this.pending.delete(win);
    this.render();
    if (!win.closed) {
      this.setVisible(win, true);
      win.focus();
    }
  },
  // Thunderbird wird beendet: wartende Mails jetzt senden, danach beenden
  observeQuit() {
    if (this.quitObserver) {
      return;
    }
    this.quitObserver = {
      observe: async subject => {
        if (!this.pending.size) {
          return;
        }
        subject.QueryInterface(Ci.nsISupportsPRBool).data = true;
        await Promise.all([...this.pending.keys()].map(w => this.send(w)));
        Services.tm.dispatchToMainThread(() => Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit));
      },
    };
    Services.obs.addObserver(this.quitObserver, "quit-application-requested");
    enhancer?.restorers.push(() => {
      Services.obs.removeObserver(this.quitObserver, "quit-application-requested");
      this.quitObserver = null;
      for (const w of [...this.pending.keys()]) {
        this.send(w);
      }
    });
  },
  // Hinweis unten im Hauptfenster: „Wird gesendet … Senden rückgängig“
  render() {
    for (const main of Services.wm.getEnumerator("mail:3pane")) {
      const d = main.document;
      let bar = d.getElementById("mcUndoSend");
      const last = [...this.pending.entries()].pop();
      if (!last) {
        bar?.remove();
        continue;
      }
      const [cw] = last;
      if (!bar) {
        bar = d.createElementNS("http://www.w3.org/1999/xhtml", "div");
        bar.id = "mcUndoSend";
        bar.setAttribute("role", "status");
        const text = d.createElementNS("http://www.w3.org/1999/xhtml", "span");
        text.className = "mc-us-text";
        const btn = d.createElementNS("http://www.w3.org/1999/xhtml", "button");
        btn.className = "mc-us-undo";
        btn.textContent = tr("Undo Send");
        bar.append(text, btn);
        d.documentElement.append(bar);
      }
      const subject = cw.document?.getElementById("msgSubject")?.value?.trim();
      bar.querySelector(".mc-us-text").textContent = this.pending.size > 1
        ? tr("Sending {n} messages …", { n: this.pending.size })
        : subject ? tr("Sending “{s}” …", { s: subject }) : tr("Sending …");
      bar.querySelector(".mc-us-undo").onclick = () => this.undo(cw);
    }
  },
};

// ---------- Später senden (wie Apple Mail) ----------
// Pfeil neben „Senden“ im Verfassen-Fenster: „Heute 21:00“, „Morgen 8:00“
// oder eine eigene Zeit. Die Mail wird als Entwurf mit der Kopfzeile
// X-Halo-Send-At gespeichert (in der Datenbank über mailnews.customDBHeaders
// lesbar); halo.spaces sieht jede halbe Minute in den Entwürfen nach und
// schiebt fällige Mails in den Postausgang, Thunderbird sendet sie dann.
// Läuft Thunderbird zur Zeit nicht, geht die Mail beim nächsten Start hinaus.
const SEND_AT = "x-halo-send-at";
const SendLater = {
  timer: null,
  ensureHeaderIndexed() {
    const have = Services.prefs.getCharPref("mailnews.customDBHeaders", "").toLowerCase().split(/\s+/).filter(Boolean);
    if (!have.includes(SEND_AT)) {
      Services.prefs.setCharPref("mailnews.customDBHeaders", [...have, SEND_AT].join(" "));
    }
  },
  // im Verfassen-Fenster: Pfeil mit Menü neben „Senden“
  hook(win, cleanups) {
    const doc = win.document;
    const send = doc.getElementById("button-send");
    if (!send || doc.getElementById("mcSendLater")) {
      return;
    }
    const btn = doc.createXULElement("toolbarbutton");
    btn.id = "mcSendLater";
    btn.className = "toolbarbutton-1";
    btn.setAttribute("type", "menu");
    btn.setAttribute("tooltiptext", tr("Send Later"));
    const popup = doc.createXULElement("menupopup");
    popup.id = "mcSendLaterPopup";
    btn.append(popup);
    send.after(btn);
    const item = (label, fn) => {
      const it = doc.createXULElement("menuitem");
      it.setAttribute("label", label);
      it.addEventListener("command", fn);
      return it;
    };
    const fmt = new Intl.DateTimeFormat(Services.locale.appLocaleAsBCP47, { hour: "2-digit", minute: "2-digit" });
    popup.addEventListener("popupshowing", event => {
      if (event.target != popup) {
        return;
      }
      const now = new Date();
      const tonight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21, 0);
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 8, 0);
      const items = [item(tr("Send Now"), () => win.goDoCommand("cmd_sendButton"))];
      if (now < tonight - 5 * 60 * 1000) {
        items.push(item(tr("Send {time} Tonight", { time: fmt.format(tonight) }), () => this.schedule(win, tonight)));
      }
      items.push(item(tr("Send {time} Tomorrow", { time: fmt.format(tomorrow) }), () => this.schedule(win, tomorrow)));
      items.push(doc.createXULElement("menuseparator"));
      items.push(item(tr("Send Later …"), () => this.askTime(win, btn)));
      popup.replaceChildren(...items);
    });
    cleanups?.add(() => btn.remove());
  },
  // eigene Zeit: kleines Popover mit Datum und Uhrzeit
  askTime(win, anchor) {
    const doc = win.document;
    const X = "http://www.w3.org/1999/xhtml";
    let panel = doc.getElementById("mcSendLaterPanel");
    if (!panel) {
      panel = doc.createXULElement("panel");
      panel.id = "mcSendLaterPanel";
      panel.setAttribute("type", "arrow");
      const box = doc.createElementNS(X, "div");
      box.className = "mc-sl-box";
      const title = doc.createElementNS(X, "div");
      title.className = "mc-sl-title";
      title.textContent = tr("Send Later");
      const input = doc.createElementNS(X, "input");
      input.type = "datetime-local";
      input.className = "mc-sl-when";
      const ok = doc.createElementNS(X, "button");
      ok.className = "mc-sl-ok";
      ok.textContent = tr("Schedule");
      box.append(title, input, ok);
      panel.append(box);
      doc.documentElement.append(panel);
      ok.addEventListener("click", () => {
        const when = input.value ? new Date(input.value) : null;
        if (when && when > new Date()) {
          panel.hidePopup();
          this.schedule(win, when);
        }
      });
    }
    const input = panel.querySelector(".mc-sl-when");
    const pad = n => String(n).padStart(2, "0");
    const t = new Date(Date.now() + 60 * 60 * 1000);
    input.value = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:00`;
    panel.openPopup(anchor, "after_end", 0, 4);
  },
  async schedule(win, when) {
    try {
      win.gMsgCompose.compFields.setHeader("X-Halo-Send-At", String(when.getTime()));
      await win.GenericSendMessage(Ci.nsIMsgCompDeliverMode.SaveAsDraft);
      for (let i = 0; i < 100 && win.gSaveOperationInProgress; i++) {
        await new Promise(r => win.setTimeout(r, 100));
      }
      win.close();
      this.check(true);
    } catch (e) {
      log("send later error", e);
    }
  },
  start() {
    this.ensureHeaderIndexed();
    const win = Services.wm.getMostRecentWindow("mail:3pane");
    if (this.timer) {
      return;
    }
    if (!win) {
      setTimeout(() => this.start(), 3000); // Hauptfenster noch nicht offen
      return;
    }
    this.timer = win.setInterval(() => this.check(), 30 * 1000);
    win.setTimeout(() => this.check(true), 5000);
    enhancer?.restorers.push(() => {
      win.clearInterval(this.timer);
      this.timer = null;
    });
  },
  async draftFolders() {
    const out = new Set();
    for (const id of MailServices.accounts.allIdentities) {
      try {
        // ab Thunderbird 14x: getOrCreateDraftsFolderAsync (draftFolder gibt es nicht mehr)
        const f = typeof id.getOrCreateDraftsFolderAsync == "function" ? await id.getOrCreateDraftsFolderAsync()
          : id.draftFolder && MailServices.folderLookup.getFolderForURL(id.draftFolder);
        if (f) {
          out.add(f);
        }
      } catch {}
    }
    try {
      const local = MailServices.accounts.localFoldersServer.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Drafts);
      if (local) {
        out.add(local);
      }
    } catch {}
    return [...out];
  },
  // fällige Entwürfe in den Postausgang, dann senden; update: Ordner vom Server auffrischen
  async check(update = false) {
    if (this.busy || Services.io.offline) {
      return;
    }
    this.busy = true;
    try {
      const now = Date.now();
      let moved = 0;
      for (const folder of await this.draftFolders()) {
        if (update && folder.server?.type == "imap") {
          try {
            folder.updateFolder(null);
            await new Promise(r => setTimeout(r, 1500));
          } catch {}
        }
        let db;
        try {
          db = folder.msgDatabase;
        } catch {
          continue;
        }
        const due = [];
        for (const hdr of db.enumerateMessages()) {
          const at = Number(hdr.getStringProperty(SEND_AT));
          if (at && at <= now && !(hdr.flags & Ci.nsMsgMessageFlags.Expunged)) {
            due.push(hdr);
          }
        }
        if (!due.length) {
          continue;
        }
        const outbox = this.outbox();
        if (!outbox) {
          break;
        }
        await new Promise(resolve => {
          MailServices.copy.copyMessages(folder, due, outbox, true, {
            QueryInterface: ChromeUtils.generateQI(["nsIMsgCopyServiceListener"]),
            onStartCopy() {},
            onProgress() {},
            setMessageKey() {},
            getMessageId() {
              return null;
            },
            onStopCopy: () => resolve(),
          }, null, false);
        });
        moved += due.length;
      }
      if (moved) {
        Services.wm.getMostRecentWindow("mail:3pane")?.SendUnsentMessages?.();
      }
    } catch (e) {
      log("send later check error", e);
    } finally {
      this.busy = false;
    }
  },
  outbox() {
    const root = MailServices.accounts.localFoldersServer?.rootFolder;
    let box = root?.getFolderWithFlags(Ci.nsMsgFolderFlags.Queue);
    if (!box && root) {
      try {
        box = root.createLocalSubfolder("Unsent Messages");
        box.setFlag(Ci.nsMsgFolderFlags.Queue);
      } catch {}
    }
    return box;
  },
};

// ---------- Erinnern (wie „Remind Me“ in Apple Mail) ----------
// Kontextmenü der Mailliste → Erinnern: in 1 Stunde, heute Abend, morgen,
// nächste Woche. Die Mail wandert in den Ordner „Erinnern“ ihres Kontos (auf
// dem Server – so gilt es auch für andere Geräte) und kommt zur Zeit
// ungelesen in ihren Ordner zurück, mit einer Mitteilung. Gemerkt wird je
// Message-ID (überlebt das Verschieben): Zeit, Herkunfts- und Zielordner.
const REMIND_PREF = "extensions.mailcards.reminders";
const Remind = {
  timer: null,
  list() {
    try {
      const v = JSON.parse(Services.prefs.getStringPref(REMIND_PREF, "[]"));
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  },
  save(list) {
    Services.prefs.setStringPref(REMIND_PREF, JSON.stringify(list.slice(-500)));
  },
  choices() {
    const now = new Date();
    const at = (d, h) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, h, 0);
    const out = [["Remind Me in 1 Hour", new Date(now.getTime() + 60 * 60 * 1000)]];
    if (now.getHours() < 20) {
      out.push(["Remind Me Tonight", at(0, 21)]);
    }
    out.push(["Remind Me Tomorrow", at(1, 8)]);
    const toMonday = ((8 - now.getDay()) % 7) || 7;
    out.push(["Remind Me Next Week", at(toMonday, 8)]);
    return out;
  },
  // Ordner „Erinnern“ des Kontos, bei Bedarf angelegt (IMAP legt ihn
  // asynchron auf dem Server an – kurz darauf warten)
  async folderFor(hdr) {
    const root = hdr.folder.server.rootFolder;
    const name = tr("Remind Me");
    const get = () => (root.containsChildNamed(name) ? root.getChildNamed(name) : null);
    if (!get()) {
      root.createSubfolder(name, null);
      for (let i = 0; i < 50 && !get(); i++) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
    return get();
  },
  move(src, hdrs, dest) {
    return new Promise(resolve => {
      MailServices.copy.copyMessages(src, hdrs, dest, true, {
        QueryInterface: ChromeUtils.generateQI(["nsIMsgCopyServiceListener"]),
        onStartCopy() {},
        onProgress() {},
        setMessageKey() {},
        getMessageId() {
          return null;
        },
        onStopCopy: () => resolve(),
      }, null, false);
    });
  },
  async remind(hdrs, when) {
    const list = this.list().filter(e => !hdrs.some(h => h.messageId == e.id));
    const bySrc = new Map();
    for (const hdr of hdrs) {
      const dest = await this.folderFor(hdr);
      if (!dest || dest == hdr.folder) {
        continue;
      }
      list.push({ id: hdr.messageId, at: when.getTime(), back: hdr.folder.URI, folder: dest.URI, subject: hdr.mime2DecodedSubject || "" });
      const key = hdr.folder.URI + " " + dest.URI;
      if (!bySrc.has(key)) {
        bySrc.set(key, { src: hdr.folder, dest, hdrs: [] });
      }
      bySrc.get(key).hdrs.push(hdr);
    }
    this.save(list);
    for (const { src, dest, hdrs: group } of bySrc.values()) {
      await this.move(src, group, dest);
    }
  },
  start() {
    const win = Services.wm.getMostRecentWindow("mail:3pane");
    if (this.timer) {
      return;
    }
    if (!win) {
      setTimeout(() => this.start(), 3000);
      return;
    }
    this.timer = win.setInterval(() => this.check(), 30 * 1000);
    win.setTimeout(() => this.check(), 6000);
    enhancer?.restorers.push(() => {
      win.clearInterval(this.timer);
      this.timer = null;
    });
  },
  async check() {
    if (this.busy) {
      return;
    }
    this.busy = true;
    try {
      const now = Date.now();
      const list = this.list();
      const due = list.filter(e => e.at <= now);
      if (!due.length) {
        return;
      }
      const rest = list.filter(e => e.at > now);
      for (const e of due) {
        let folder, back;
        try {
          folder = MailServices.folderLookup.getFolderForURL(e.folder);
          back = MailServices.folderLookup.getFolderForURL(e.back);
        } catch {}
        const hdr = folder?.msgDatabase?.getMsgHdrForMessageID(e.id);
        if (!hdr || !back) {
          // noch nicht da (Server) – höchstens einen Tag lang weiter versuchen
          if (now - e.at < 24 * 60 * 60 * 1000) {
            rest.push(e);
          }
          continue;
        }
        // zurück: ungelesen wie eine neue Mail (vorher markieren – der Server
        // übernimmt die Markierung beim Kopieren)
        folder.markMessagesRead([hdr], false);
        await new Promise(r => setTimeout(r, 500));
        await this.move(folder, [hdr], back);
        this.notify(e);
      }
      this.save(rest);
    } catch (err) {
      log("remind check error", err);
    } finally {
      this.busy = false;
    }
  },
  notify(entry) {
    try {
      const alerts = Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService);
      const alert = Cc["@mozilla.org/alert-notification;1"].createInstance(Ci.nsIAlertNotification);
      alert.init("halo-remind-" + entry.id, "", tr("Reminder"), entry.subject || tr("(no subject)"), false, "", null, null, null, null, false, false);
      alerts.showAlert(alert, null);
    } catch (e) {
      debugLog("remind alert", String(e).slice(0, 120));
    }
  },
  // Kontextmenü der Mailliste: Untermenü „Erinnern“ nach „Markieren“
  hookMenu(doc) {
    const popup = doc.getElementById("mailContext");
    const mark = doc.getElementById("mailContext-mark");
    if (!popup || !mark || doc.getElementById("mcRemindMenu")) {
      return;
    }
    const win = doc.defaultView;
    const menu = doc.createXULElement("menu");
    menu.id = "mcRemindMenu";
    menu.setAttribute("label", tr("Remind Me"));
    const inner = doc.createXULElement("menupopup");
    menu.append(inner);
    mark.after(menu);
    const fmt = new Intl.DateTimeFormat(Services.locale.appLocaleAsBCP47, { weekday: "short", hour: "2-digit", minute: "2-digit" });
    inner.addEventListener("popupshowing", event => {
      if (event.target != inner) {
        return;
      }
      inner.replaceChildren(...this.choices().map(([label, when]) => {
        const it = doc.createXULElement("menuitem");
        it.setAttribute("label", `${tr(label)} (${fmt.format(when)})`);
        it.addEventListener("command", () => {
          const hdrs = win.gDBView?.getSelectedMsgHdrs?.() || [];
          this.remind([...hdrs], when).catch(e => log("remind error", e));
        });
        return it;
      }));
    });
    // nur bei Mails, die man verschieben kann (nicht in Entwürfen/Postausgang)
    const onShow = event => {
      if (event.target != popup) {
        return;
      }
      const hdrs = win.gDBView?.getSelectedMsgHdrs?.() || [];
      const F = Ci.nsMsgFolderFlags;
      menu.hidden = !hdrs.length || [...hdrs].some(h => !h.folder || h.folder.isSpecialFolder(F.Drafts | F.Queue | F.Templates, true) || h.folder.server?.type == "nntp");
    };
    popup.addEventListener("popupshowing", onShow);
    this.start();
    enhancer?.addWinRestorer(win, () => {
      popup.removeEventListener("popupshowing", onShow);
      menu.remove();
    });
  },
};

// ---------- Nachfassen (wie „Follow Up“ in Apple Mail) ----------
// Eigene Mails, auf die nach 3 Tagen (bis 14) noch keine Antwort kam, zeigt
// halo.spaces als Hinweis über dem Posteingang: „Keine Antwort: „Betreff“ an
// Anna“ – „Nachfassen“ öffnet die Antwort an dieselben Empfänger, ✕ blendet
// ihn für diese Mail aus. Geantwortet = irgendeine Mail in einem Posteingang
// der letzten 30 Tage verweist auf sie (References/In-Reply-To).
const FOLLOWUP_DISMISSED_PREF = "extensions.mailcards.followUpDismissed";
const FollowUp = {
  cache: null,
  dismissed() {
    try {
      return new Set(JSON.parse(Services.prefs.getStringPref(FOLLOWUP_DISMISSED_PREF, "[]")));
    } catch {
      return new Set();
    }
  },
  dismiss(id) {
    const set = [...this.dismissed(), id].slice(-300);
    Services.prefs.setStringPref(FOLLOWUP_DISMISSED_PREF, JSON.stringify(set));
    this.cache = null;
  },
  // die neueste unbeantwortete eigene Mail (oder null); höchstens alle 10 Minuten neu
  candidate() {
    if (this.cache && Date.now() - this.cache.time < 10 * 60 * 1000) {
      return this.cache.hdr;
    }
    const F = Ci.nsMsgFolderFlags;
    const now = Date.now() * 1000; // PRTime
    const DAY = 24 * 60 * 60 * 1000 * 1000;
    const answered = new Set();
    const mine = new Set([...MailServices.accounts.allIdentities].map(i => (i.email || "").toLowerCase()).filter(Boolean));
    const sent = [];
    for (const server of MailServices.accounts.allServers) {
      let root;
      try {
        root = server.rootFolder;
      } catch {
        continue;
      }
      for (const folder of root.descendants) {
        const inbox = folder.getFlag(F.Inbox), isSent = folder.getFlag(F.SentMail);
        if (!inbox && !isSent) {
          continue;
        }
        let db;
        try {
          db = folder.msgDatabase;
        } catch {
          continue;
        }
        for (const hdr of db.enumerateMessages()) {
          if (inbox && now - hdr.date < 30 * DAY) {
            for (let i = 0; i < hdr.numReferences; i++) {
              answered.add(hdr.getStringReference(i));
            }
          } else if (isSent && now - hdr.date >= 3 * DAY && now - hdr.date <= 14 * DAY) {
            sent.push(hdr);
          }
        }
      }
    }
    const dismissed = this.dismissed();
    const others = h => (h.recipients + "," + h.ccList).toLowerCase().split(",").some(a => {
      const m = a.match(/[^<\s"]+@[^>\s"]+/);
      return m && !mine.has(m[0]);
    });
    const open = sent.filter(h => !answered.has(h.messageId) && !dismissed.has(h.messageId) &&
      !(h.flags & Ci.nsMsgMessageFlags.Replied) && others(h)).sort((a, b) => b.date - a.date);
    this.cache = { time: Date.now(), hdr: open[0] || null };
    return this.cache.hdr;
  },
  // Hinweis über der Mailliste, nur im Posteingang bzw. allen Posteingängen
  render(a3) {
    const doc = a3?.document;
    const pane = doc?.getElementById("threadPane");
    const tree = doc?.getElementById("threadTree");
    if (!pane || !tree) {
      return;
    }
    let bar = doc.getElementById("mcFollowUp");
    const folder = a3.gFolder;
    const inbox = !!folder && (folder.getFlag(Ci.nsMsgFolderFlags.Inbox) ||
      (folder.getFlag(Ci.nsMsgFolderFlags.Virtual) && /inbox/i.test(folder.URI)));
    let hdr = null;
    try {
      hdr = inbox && Services.prefs.getBoolPref("extensions.mailcards.followUp", true) ? this.candidate() : null;
    } catch (e) {
      log("follow up error", e);
    }
    if (!hdr) {
      bar?.remove();
      return;
    }
    const X = "http://www.w3.org/1999/xhtml";
    if (!bar) {
      bar = doc.createElementNS(X, "div");
      bar.id = "mcFollowUp";
      const text = doc.createElementNS(X, "span");
      text.className = "mc-fu-text";
      const go = doc.createElementNS(X, "button");
      go.className = "mc-fu-go";
      go.textContent = tr("Follow Up");
      const close = doc.createElementNS(X, "button");
      close.className = "mc-fu-close";
      close.title = tr("Dismiss");
      close.setAttribute("aria-label", tr("Dismiss"));
      bar.append(text, go, close);
      tree.before(bar);
    }
    let to = "";
    try {
      const p = MailServices.headerParser.parseDecodedHeader(hdr.mime2DecodedRecipients || hdr.recipients)[0];
      to = p?.name || p?.email || "";
    } catch {}
    const days = Math.floor((Date.now() * 1000 - hdr.date) / (24 * 60 * 60 * 1e6));
    bar.querySelector(".mc-fu-text").textContent = tr("No reply for {d} days: “{s}” to {to}", { d: days, s: hdr.mime2DecodedSubject || "", to });
    bar.querySelector(".mc-fu-go").onclick = () => {
      const uri = hdr.folder.getUriForMsg(hdr);
      MailServices.compose.OpenComposeWindow(null, hdr, uri, Ci.nsIMsgCompType.ReplyAll, Ci.nsIMsgCompFormat.Default, null, null, a3.msgWindow);
      this.dismiss(hdr.messageId);
      this.render(a3);
    };
    bar.querySelector(".mc-fu-close").onclick = () => {
      this.dismiss(hdr.messageId);
      this.render(a3);
    };
  },
  hook(a3) {
    if (a3.__mcFollowUp) {
      return;
    }
    a3.__mcFollowUp = true;
    const update = () => a3.setTimeout(() => this.render(a3), 0);
    a3.addEventListener("folderURIChanged", update);
    update();
    enhancer?.addWinRestorer(a3, () => {
      a3.removeEventListener("folderURIChanged", update);
      a3.document.getElementById("mcFollowUp")?.remove();
      delete a3.__mcFollowUp;
    });
  },
};

// ---------- Wetter in der Today-Pane (Option, Standard aus) ----------
// Das Symbol neben dem Titel zeigt das aktuelle Wetter statt der festen Sonne.
// Quelle: Open-Meteo (ohne Schlüssel, CC BY 4.0), höchstens alle 30 Minuten,
// der letzte Wert bleibt gespeichert; ohne Netz bleibt die Sonne. Ort: eine
// Stadt (einmal über die Geocoding-API von Open-Meteo in Koordinaten
// übersetzt) oder – ohne Stadt – der aktuelle Standort des Systems (macOS
// fragt einmal nach den Ortungsdiensten). Koordinaten auf 2 Nachkommastellen
// (etwa 1 km) gerundet, bevor sie das Gerät verlassen.
const WEATHER_PREF = "extensions.mailcards.weather";
const WEATHER_PLACE_PREF = "extensions.mailcards.weatherPlace";
const WEATHER_STATE_PREF = "extensions.mailcards.weatherState"; // JSON: Ort, Koordinaten, letzter Wert, Status
const WEATHER_EVERY = 30 * 60 * 1000;
const Weather = {
  titles: new Set(),
  timer: null,
  observer: null,
  state() {
    try {
      return JSON.parse(Services.prefs.getStringPref(WEATHER_STATE_PREF, "{}")) || {};
    } catch {
      return {};
    }
  },
  save(state) {
    Services.prefs.setStringPref(WEATHER_STATE_PREF, JSON.stringify(state));
  },
  enabled() {
    return Services.prefs.getBoolPref(WEATHER_PREF, false);
  },
  // WMO-Wettercode → Symbol
  kind(code, isDay) {
    if (code <= 1) return isDay ? "clear-day" : "clear-night";
    if (code == 2) return isDay ? "partly-day" : "partly-night";
    if (code == 3) return "cloudy";
    if (code == 45 || code == 48) return "fog";
    if ((code >= 71 && code <= 77) || code == 85 || code == 86) return "snow";
    if (code >= 95) return "thunder";
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
    return isDay ? "clear-day" : "clear-night";
  },
  attach(win, title) {
    this.titles.add(title);
    win.addEventListener("unload", () => this.titles.delete(title), { once: true });
    if (!this.observer) {
      this.observer = { observe: () => this.refresh(true) };
      Services.prefs.addObserver(WEATHER_PREF, this.observer);
      Services.prefs.addObserver(WEATHER_PLACE_PREF, this.observer);
      this.timer = Services.wm.getMostRecentWindow("mail:3pane")?.setInterval(() => this.refresh(), 5 * 60 * 1000);
      enhancer?.restorers.push(() => this.stop());
    }
    this.show();
    this.refresh();
  },
  stop() {
    if (this.observer) {
      Services.prefs.removeObserver(WEATHER_PREF, this.observer);
      Services.prefs.removeObserver(WEATHER_PLACE_PREF, this.observer);
      this.observer = null;
    }
    for (const w of Services.wm.getEnumerator("mail:3pane")) {
      w.clearInterval(this.timer);
    }
    for (const t of this.titles) {
      t.removeAttribute("data-weather");
      t.removeAttribute("title");
    }
    this.titles.clear();
  },
  // gespeicherten Wert an alle Titel
  show() {
    const st = this.state();
    const on = this.enabled() && st.kind;
    for (const t of this.titles) {
      if (on) {
        t.dataset.weather = st.kind;
        t.title = st.temp != null ? `${st.place ? st.place + ": " : ""}${Math.round(st.temp)} °C` : st.place || "";
      } else {
        t.removeAttribute("data-weather");
        t.removeAttribute("title");
      }
    }
  },
  // Standort des Systems (CoreLocation, Windows-Standort, GeoClue)
  locate(win) {
    return new Promise(resolve => {
      const geo = win?.navigator?.geolocation;
      if (!geo) {
        resolve({ error: "unavailable" });
        return;
      }
      geo.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        err => resolve({ error: err?.code == 1 ? "denied" : "unavailable" }),
        { timeout: 15000, maximumAge: 60 * 60 * 1000 });
    });
  },
  // Vorschläge beim Tippen: bis zu fünf Orte („Wien, Österreich“; bei gleichen
  // Namen mit Bundesland), nur der eingetippte Text geht an Open-Meteo
  async search(win, text) {
    const name = String(text || "").trim().slice(0, 80);
    if (name.length < 2 || !win) {
      return [];
    }
    const lang = Services.locale.appLocaleAsBCP47.split("-")[0];
    const url = `https://geocoding-api.open-meteo.com/v1/search?count=5&format=json&language=${encodeURIComponent(lang)}&name=${encodeURIComponent(name)}`;
    try {
      const res = await fetchWithTimeout(win, url, { max: 64 * 1024 });
      const hits = JSON.parse(await res.text())?.results || [];
      const seen = new Set();
      return hits.map(h => {
        let label = [h.name, h.country].filter(Boolean).join(", ");
        if (seen.has(label) && h.admin1) {
          label = [h.name, h.admin1, h.country].filter(Boolean).join(", ");
        }
        seen.add(label);
        return { label, lat: h.latitude, lon: h.longitude };
      }).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    } catch {
      return [];
    }
  },
  // gewählter Vorschlag: Koordinaten gleich merken (keine zweite Suche nach dem Namen)
  async choose(place) {
    const label = String(place?.label || "").slice(0, 120);
    const lat = Math.round(Number(place?.lat) * 100) / 100, lon = Math.round(Number(place?.lon) * 100) / 100;
    if (!label || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error("not a place");
    }
    this.save({ ...this.state(), for: label, lat, lon, place: label, time: 0 });
    Services.prefs.setStringPref(WEATHER_PLACE_PREF, label);
    await this.refresh(true);
  },
  async geocode(win, name) {
    const lang = Services.locale.appLocaleAsBCP47.split("-")[0];
    const url = `https://geocoding-api.open-meteo.com/v1/search?count=1&format=json&language=${encodeURIComponent(lang)}&name=${encodeURIComponent(name)}`;
    const res = await fetchWithTimeout(win, url, { max: 64 * 1024 });
    const hit = JSON.parse(await res.text())?.results?.[0];
    return hit ? { lat: hit.latitude, lon: hit.longitude, place: [hit.name, hit.country].filter(Boolean).join(", ") } : null;
  },
  // jede Abfrage läuft für sich; gespeichert wird nur das Ergebnis der neuesten
  // (eine langsame Standortabfrage überschreibt keinen inzwischen gewählten Ort)
  gen: 0,
  async refresh(force = false) {
    const win = Services.wm.getMostRecentWindow("mail:3pane");
    if (!this.enabled() || !win) {
      this.show();
      return;
    }
    const st = this.state();
    const wanted = Services.prefs.getStringPref(WEATHER_PLACE_PREF, "").trim();
    if (!force && st.time && Date.now() - st.time < WEATHER_EVERY && st.for == wanted) {
      this.show();
      return;
    }
    const gen = ++this.gen;
    const latest = () => gen == this.gen;
    try {
      let where = null;
      if (wanted) {
        where = st.for == wanted && st.lat != null ? { lat: st.lat, lon: st.lon, place: st.place } : await this.geocode(win, wanted);
        if (!where) {
          if (latest()) this.save({ ...st, for: wanted, status: "notfound", time: Date.now(), kind: null });
          this.show();
          return;
        }
      } else {
        where = await this.locate(win);
        if (where.error) {
          if (latest()) this.save({ ...st, for: wanted, status: where.error, time: Date.now(), kind: null, place: null });
          this.show();
          return;
        }
        where.place = null;
      }
      const lat = Math.round(where.lat * 100) / 100, lon = Math.round(where.lon * 100) / 100;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weather_code,is_day,temperature_2m&timezone=auto`;
      const res = await fetchWithTimeout(win, url, { max: 64 * 1024 });
      const cur = JSON.parse(await res.text())?.current;
      if (!res.ok || !cur) {
        throw new Error(`weather ${res.status}`);
      }
      if (!latest()) {
        return;
      }
      this.save({ for: wanted, lat, lon, place: where.place, status: "ok", time: Date.now(),
                  kind: this.kind(cur.weather_code, cur.is_day), temp: cur.temperature_2m, code: cur.weather_code });
    } catch (e) {
      log("weather error", String(e).slice(0, 120));
    }
    this.show();
  },
};

// Fünfter Bereich (Platz des Chats in der Bereichsleiste): Chat wie bisher,
// der Bereich einer anderen Erweiterung, eine feste Webseite oder keiner.
// Höchstens fünf Bereiche – Chat und Ersatz nie gleichzeitig (sonst würden
// die Knöpfe kleiner). Der Ersatz läuft 1:1 in seinem eigenen Tab (ohne
// Today-Pane); halo.spaces leiht ihm nur Platz, Farbe und Knopf des Chats.
const FIFTH_PREF = "extensions.mailcards.fifthSpace"; // chat | addon | web | none
const FIFTH_ADDON_PREF = "extensions.mailcards.fifthSpaceAddon"; // Name des Bereichs (Knopf-ID)
const FIFTH_URL_PREF = "extensions.mailcards.fifthSpaceUrl";
const FIFTH_ICON_PREF = "extensions.mailcards.fifthSpaceIcon"; // mask | original
const FIFTH_CHOICES = ["chat", "addon", "web", "none"];
const FIFTH_ICONS = ["mask", "original"];

const FifthSpace = {
  mode() {
    const m = Services.prefs.getStringPref(FIFTH_PREF, "chat");
    return FIFTH_CHOICES.includes(m) ? m : "chat";
  },
  icon() {
    const m = Services.prefs.getStringPref(FIFTH_ICON_PREF, "mask");
    return FIFTH_ICONS.includes(m) ? m : "mask";
  },
  // nur http(s); ohne Schema wird https:// vorangestellt
  normalizeURL(text) {
    let t = String(text || "").trim();
    if (!t) {
      return "";
    }
    if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) {
      t = "https://" + t;
    }
    try {
      // (im Experiment gibt es kein URL – Thunderbirds eigene Adressprüfung)
      const u = Services.io.newURI(t);
      return /^https?$/.test(u.scheme) && u.host.includes(".") ? u.spec : null;
    } catch {
      return null;
    }
  },
  url() {
    return this.normalizeURL(Services.prefs.getStringPref(FIFTH_URL_PREF, "")) || "";
  },
  // erlaubt sind nur Bereiche fremder Erweiterungen (Thunderbirds spaces-API)
  addonSpaces(w) {
    return (w?.gSpacesToolbar?.spaces || []).filter(s => s.isExtensionSpace && s.button)
      .map(s => ({ name: s.name, title: s.button.title || s.name, space: s }));
  },
  // wirksamer Zustand: Erweiterung fehlt oder Adresse ungültig → wie „keiner“
  target(w) {
    const mode = this.mode();
    if (mode == "addon") {
      const want = Services.prefs.getStringPref(FIFTH_ADDON_PREF, "");
      const hit = this.addonSpaces(w).find(s => s.name == want);
      return hit ? { mode, space: hit.space, title: hit.title } : { mode: "none" };
    }
    if (mode == "web") {
      const url = this.url();
      return url ? { mode, url, title: Services.io.newURI(url).host.replace(/^www\./, "") } : { mode: "none" };
    }
    return { mode };
  },
  isTarget(w, target, tab) {
    if (!tab) {
      return false;
    }
    if (target.mode == "addon") {
      return !!target.space.tabInSpace(tab);
    }
    if (target.mode == "web") {
      if (tab.mode?.name != "contentTab") {
        return false;
      }
      if (tab.__mcFifth) {
        return true;
      }
      try {
        return tab.browser?.currentURI?.host == Services.io.newURI(target.url).host;
      } catch {
        return false;
      }
    }
    return false;
  },
  open(w, target) {
    const tm = w.document.getElementById("tabmail");
    if (target.mode == "addon") {
      w.gSpacesToolbar.openSpace(tm, target.space);
      return;
    }
    const existing = tm.tabInfo.find(t => this.isTarget(w, target, t));
    if (existing) {
      tm.switchToTab(existing);
      return;
    }
    // wie eine App: keine Adressleiste; Links auf andere Seiten öffnen im Standardbrowser
    const tab = tm.openTab("contentTab", { url: target.url, linkHandler: "single-site", background: false });
    if (tab) {
      tab.__mcFifth = true;
    }
  },
  attach(w, restorers) {
    const d = w.document;
    const chat = d.getElementById("chatButton");
    const tm = d.getElementById("tabmail");
    if (!chat || !tm || !w.gSpacesToolbar || w.__mcFifth) {
      return;
    }
    w.__mcFifth = true;
    const root = d.documentElement;
    const item = () => d.getElementById("spacesPopupButtonChat");
    let target = { mode: "chat" };
    const sync = () => {
      const on = (target.mode == "addon" || target.mode == "web") && this.isTarget(w, target, tm.currentTabInfo);
      chat.classList.toggle("current", on || (target.mode == "chat" && w.gSpacesToolbar.currentSpace?.button == chat));
      root.toggleAttribute("mc-fifth-current", on);
    };
    const reset = () => {
      for (const e of d.querySelectorAll("[mc-fifth-hidden]")) {
        e.removeAttribute("mc-fifth-hidden");
      }
      for (const e of [chat, item()].filter(Boolean)) {
        e.style.removeProperty("--mc-fifth-img");
        e.style.removeProperty("--mc-fifth-img-dark");
        e.removeAttribute("mc-fifth-icon");
      }
    };
    const apply = () => {
      target = this.target(w);
      reset();
      root.setAttribute("mc-fifth", target.mode);
      const mi = item();
      if (mi) {
        mi.hidden = target.mode == "none";
      }
      // höchstens fünf Bereiche: Knöpfe fremder Bereiche nie zusätzlich in der
      // Leiste (sie sind über „Fünfter Bereich: Erweiterung“ und das Bereiche-Menü da)
      for (const a of this.addonSpaces(w)) {
        a.space.button.setAttribute("mc-fifth-hidden", "");
      }
      d.getElementById("spacesToolbarAddonsOverflowButton")?.setAttribute("mc-fifth-hidden", "");
      if (target.mode == "addon" || target.mode == "web") {
        let img = "", dark = "";
        if (target.mode == "addon") {
          target.space.menuitem?.setAttribute("mc-fifth-hidden", "");
          const s = target.space.button.querySelector("img")?.style;
          img = s?.getPropertyValue("--webextension-toolbar-image") || "";
          dark = s?.getPropertyValue("--webextension-toolbar-image-dark") || "";
        } else if (this.icon() == "original") {
          img = `url("${Services.io.newURI(target.url).resolve("/favicon.ico")}")`;
        }
        for (const e of [chat, mi].filter(Boolean)) {
          e.setAttribute("mc-fifth-icon", this.icon());
          if (img) {
            e.style.setProperty("--mc-fifth-img", img);
          }
          if (dark) {
            e.style.setProperty("--mc-fifth-img-dark", dark);
          }
        }
        chat.title = target.title;
        if (mi) {
          mi.label = target.title;
        }
      } else {
        // Thunderbirds eigene Beschriftung zurück
        d.l10n?.translateElements([chat, mi].filter(Boolean));
      }
      sync();
    };
    const onClick = event => {
      if (target.mode == "addon" || target.mode == "web") {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.open(w, target);
      }
    };
    // auf der Leiste abfangen: Thunderbirds eigener Klick am Knopf käme sonst zuerst
    const bar = d.getElementById("spacesToolbar");
    const onBarClick = event => {
      if (event.target?.closest?.("#chatButton")) {
        onClick(event);
      }
    };
    bar.addEventListener("click", onBarClick, true);
    const onCommand = event => {
      if (event.target?.id == "spacesPopupButtonChat") {
        onClick(event);
      }
    };
    d.addEventListener("command", onCommand, true);
    const monitor = {
      monitorName: "mcFifthSpace",
      onTabTitleChanged() {},
      onTabOpened() {},
      onTabPersist() {},
      onTabRestored() {},
      onTabClosing() {},
      onTabSwitched: () => w.setTimeout(sync, 0),
    };
    tm.registerTabMonitor(monitor);
    // Bereiche anderer Erweiterungen entstehen erst nach dem Start
    const addons = d.getElementById("spacesToolbarAddonsContainer");
    let pending = false;
    const later = () => {
      if (!pending) {
        pending = true;
        w.setTimeout(() => {
          pending = false;
          apply();
        }, 0);
      }
    };
    const mo = addons ? new w.MutationObserver(later) : null;
    mo?.observe(addons, { childList: true });
    const prefs = [FIFTH_PREF, FIFTH_ADDON_PREF, FIFTH_URL_PREF, FIFTH_ICON_PREF];
    const obs = { observe: later };
    prefs.forEach(p => Services.prefs.addObserver(p, obs));
    apply();
    restorers?.push(() => {
      bar.removeEventListener("click", onBarClick, true);
      d.removeEventListener("command", onCommand, true);
      tm.unregisterTabMonitor(monitor);
      mo?.disconnect();
      prefs.forEach(p => Services.prefs.removeObserver(p, obs));
      reset();
      if (item()) {
        item().hidden = false;
      }
      root.removeAttribute("mc-fifth");
      root.removeAttribute("mc-fifth-current");
      d.l10n?.translateElements([chat, item()].filter(Boolean));
      delete w.__mcFifth;
    });
  },
};

// Breite Newsletter (feste 600–700 px) wie Apple Mail auf die Lesebreite
// verkleinern statt sie rechts abzuschneiden: der Mailtext bekommt einen Zoom,
// sobald er breiter ist als die Leseansicht. Nur HTML-Mails (Textmails brechen
// selbst um), neu gerechnet bei Größenänderung und nachgeladenen Bildern
function fitWideMessage(target) {
  try {
    const doc = target?.document || target?.ownerDocument || target;
    const mp = doc?.getElementById?.("messagepane");
    const win = mp?.contentWindow;
    const mdoc = mp?.contentDocument;
    if (!win || !mdoc?.body || !/^(imap|mailbox|news|nntp|ews|owl|file):/.test(mdoc.documentURI)) {
      return;
    }
    const body = mdoc.body;
    if (body.querySelector(":scope > :is(.moz-text-plain, .moz-text-flowed)")) {
      return;
    }
    let busy = false;
    const apply = () => {
      if (busy || !body.isConnected) {
        return;
      }
      busy = true;
      try {
        const root = mdoc.documentElement;
        body.style.removeProperty("zoom");
        const avail = root.clientWidth;
        const need = Math.max(body.scrollWidth, root.scrollWidth);
        if (avail > 0 && need > avail + 2) {
          // nicht kleiner als die Hälfte – sonst wird die Schrift unlesbar
          body.style.setProperty("zoom", String(Math.max(0.5, Math.floor((avail / need) * 1000) / 1000)));
          body.dataset.mcFit = "1";
        } else {
          delete body.dataset.mcFit;
        }
      } finally {
        busy = false;
      }
    };
    apply();
    if (!mdoc.__mcFitHooked) {
      mdoc.__mcFitHooked = true;
      // (Fensterbreite, Today-Pane, Seitenleiste – und nachgeladene Bilder)
      new win.ResizeObserver(() => win.requestAnimationFrame(apply)).observe(mdoc.documentElement);
      mdoc.addEventListener("load", () => win.requestAnimationFrame(apply), true);
    }
  } catch (e) {
    log("fit message error", String(e).slice(0, 120));
  }
}

// Verteiler, bei denen die Ein-Klick-Abmeldung geklappt hat (List-ID, sonst
// Absenderadresse), als Liste in einer Einstellung – höchstens die letzten 500
const UNSUBSCRIBED_PREF = "extensions.mailcards.unsubscribedLists";
function unsubscribedLists() {
  try {
    const list = JSON.parse(Services.prefs.getStringPref(UNSUBSCRIBED_PREF, "[]"));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function rememberUnsubscribed(key) {
  if (!key) {
    return;
  }
  const list = unsubscribedLists().filter(k => k != key);
  list.push(key);
  Services.prefs.setStringPref(UNSUBSCRIBED_PREF, JSON.stringify(list.slice(-500)));
}
function unsubscribeKey(data, hdr) {
  const id = (data?.["list-id"]?.headerValue || "").match(/<([^>]+)>/)?.[1] || data?.["list-id"]?.headerValue || "";
  if (id.trim()) {
    return "list:" + id.trim().toLowerCase();
  }
  try {
    const email = MailServices.headerParser.parseDecodedHeader(hdr.mime2DecodedAuthor || hdr.author)[0]?.email;
    return email ? "from:" + email.toLowerCase() : "";
  } catch {
    return "";
  }
}

// Termin/Aufgabe: Datum und Uhrzeit wie in Apple Kalender – Klick aufs Datum
// öffnet nur die Datumsauswahl (Thunderbirds Minimonat), Klick auf die Uhrzeit
// nur ein kleines Popover mit dem Uhrzeitfeld (Stunden/Minuten, Pfeiltasten,
// Mausrad) statt Thunderbirds Stundenraster. Werte gehen in die vorhandenen
// Felder zurück – Dauer, Zeitzone und „Ganztägig“ regelt weiter Thunderbird
// Verfassen wie Apple Mail: Formatleiste nur bei Bedarf über „Aa“ (gemerkt),
// Weiterleitungskopf wie bei Apple – „Begin forwarded message:“, Absender
// zuerst, Datum in Ortszeit statt „+0000“ (Rahmen und Balken: compose-body.css)
const COMPOSE_FORMAT_PREF = "extensions.mailcards.composeFormatBar";

function hookComposeApple(win, cleanups) {
  const doc = win.document;
  const bar = doc.getElementById("composeToolbar2");
  if (!bar || bar.__mcApple) {
    return;
  }
  bar.__mcApple = true;
  const root = doc.documentElement;
  // „Aa“: Formatleiste ein/aus
  const toggle = doc.createXULElement("toolbarbutton");
  toggle.id = "mcFormatToggle";
  toggle.className = "toolbarbutton-1";
  toggle.setAttribute("label", "Aa");
  toggle.setAttribute("tooltiptext", tr("Show Format Bar"));
  const apply = () => {
    const shown = Services.prefs.getBoolPref(COMPOSE_FORMAT_PREF, false);
    root.toggleAttribute("mc-format-hidden", !shown);
    toggle.toggleAttribute("checked", shown);
    toggle.setAttribute("tooltiptext", tr(shown ? "Hide Format Bar" : "Show Format Bar"));
  };
  toggle.addEventListener("command", () => {
    Services.prefs.setBoolPref(COMPOSE_FORMAT_PREF, !Services.prefs.getBoolPref(COMPOSE_FORMAT_PREF, false));
  });
  const send = doc.getElementById("button-send");
  (send?.nextElementSibling ? bar.insertBefore(toggle, send.nextElementSibling) : bar.append(toggle));
  const prefObs = () => apply();
  Services.prefs.addObserver(COMPOSE_FORMAT_PREF, prefObs);
  apply();
  // Anhänge als Kacheln: Dateisymbol in 32 px statt 16 (scharf statt vergrößert)
  const bucket = doc.getElementById("attachmentBucket");
  const bigIcons = () => {
    for (const img of bucket?.querySelectorAll(".attachmentItem > img.attachmentcell-icon[srcset*='size=16']") || []) {
      img.setAttribute("srcset", img.getAttribute("srcset").replace(/size=16/g, "size=32"));
    }
  };
  const iconObserver = bucket ? new win.MutationObserver(bigIcons) : null;
  iconObserver?.observe(bucket, { childList: true, subtree: true, attributes: true, attributeFilter: ["srcset"] });
  bigIcons();
  // Mailtext fertig (Antworten/Weiterleiten): Weiterleitungskopf umbauen
  let listener = null;
  const register = () => {
    if (listener || !win.gMsgCompose) {
      return;
    }
    listener = {
      NotifyComposeFieldsReady() {},
      ComposeProcessDone() {},
      SaveInFolderDone() {},
      NotifyComposeBodyReady() {
        win.setTimeout(() => appleForwardHeader(win), 0);
      },
      QueryInterface: ChromeUtils.generateQI(["nsIMsgComposeStateListener"]),
    };
    win.gMsgCompose.RegisterStateListener(listener);
  };
  // der Mailtext kommt oft schon, bevor das Fenster hier eingerichtet ist –
  // darum zusätzlich einige Sekunden lang nachsehen
  let tries = 0;
  const poll = win.setInterval(() => {
    if (win.closed || ++tries > 40 || appleForwardHeader(win) !== false) {
      win.clearInterval(poll);
    }
  }, 250);
  win.addEventListener("compose-window-init", register, { once: true });
  register();
  cleanups?.add(() => {
    iconObserver?.disconnect();
    Services.prefs.removeObserver(COMPOSE_FORMAT_PREF, prefObs);
    toggle.remove();
    root.removeAttribute("mc-format-hidden");
    try {
      if (listener) {
        win.gMsgCompose?.UnregisterStateListener(listener);
      }
    } catch {}
    delete bar.__mcApple;
  });
}

// false: noch kein Weiterleitungstext da (später erneut versuchen)
const appleForwardDone = new WeakSet();

function appleForwardHeader(win) {
  try {
    const body = win.GetCurrentEditorElement?.()?.contentDocument?.body;
    const box = body?.querySelector(".moz-forward-container");
    if (!box) {
      return false;
    }
    if (appleForwardDone.has(box)) {
      return true;
    }
    appleForwardDone.add(box);
    const compose = win.gMsgCompose;
    const wasModified = compose?.bodyModified;
    // Zeile „-------- Forwarded Message --------“
    for (const node of box.childNodes) {
      if (node.nodeType == 3 && /^\s*-{3,}.*-{3,}\s*$/.test(node.data)) {
        node.data = tr("Begin forwarded message:");
        break;
      }
    }
    const table = box.querySelector(":scope > table.moz-email-headers-table");
    if (table) {
      const rows = [...table.querySelectorAll("tr")];
      const label = row => row.querySelector("th")?.textContent.replace(/[:\s]+$/, "").trim();
      // Datum in Ortszeit, lang wie Apple („23. October 2026 at 13:21:33 CEST“);
      // die Zeile erkennt man am Inhalt (RFC-Datum), die Beschriftung ist übersetzt
      for (const row of rows) {
        const td = row.querySelector("td");
        if (td && /\b\d{1,2} \w{3} \d{4} \d{1,2}:\d{2}(:\d{2})? [+-]\d{4}\b/.test(td.textContent)) {
          const date = new Date(td.textContent.trim());
          if (!isNaN(date)) {
            td.textContent = new Intl.DateTimeFormat(Services.locale.appLocaleAsBCP47, { dateStyle: "long", timeStyle: "long" }).format(date);
          }
        }
      }
      // Absender zuerst wie bei Apple (From, Subject, Date, To)
      const FROM_LABELS = ["From", "Von", "De", "Da"];
      const from = rows.find(r => FROM_LABELS.includes(label(r)));
      if (from && from != rows[0]) {
        rows[0].before(from);
      }
    }
    if (compose && !wasModified) {
      compose.bodyModified = false;
    }
    win.GetCurrentEditor?.()?.resetModificationCount?.();
    return true;
  } catch (e) {
    log("forward header error", String(e).slice(0, 120));
    return true;
  }
}

// Dialogfenster wie Karten: ohne sichtbare Titelleiste (Inhalt reicht bis
// oben, macOS zeichnet nur die Fensterknöpfe), der freie Streifen oben bleibt
// zum Verschieben. Nur macOS – unter Windows/Linux zeichnet das System die
// Fensterknöpfe nicht in den Inhalt.
const CARD_WINDOWS = [
  "chrome://calendar/content/calendar-event-dialog.xhtml",
  "chrome://calendar/content/calendar-summary-dialog.xhtml",
  "chrome://messenger/content/folderProps.xhtml",
  "chrome://messenger/content/FilterListDialog.xhtml",
  "chrome://messenger/content/FilterEditor.xhtml",
];

function cardWindow(win) {
  if (Services.appinfo.OS != "Darwin" || !Services.prefs.getBoolPref(INLINE_PROMPTS_PREF, true)) {
    return;
  }
  const root = win.document.documentElement;
  if (!root || root.hasAttribute("mc-card-window")) {
    return;
  }
  root.setAttribute("customtitlebar", "true");
  root.setAttribute("chromemargin", "0,-1,-1,-1");
  root.setAttribute("mc-card-window", "");
  // der Streifen oben braucht Platz: Fenster, die sich nach ihrem Inhalt
  // richten, um das Fehlende verlängern statt unten abzuschneiden
  let grown = 0;
  const grow = () => {
    if (win.closed) {
      return;
    }
    const need = Math.ceil(root.scrollHeight - win.innerHeight);
    // höchstens um den Streifen (Schutz gegen Inhalte, die mitwachsen)
    if (need > 0 && grown + need <= 40) {
      grown += need;
      win.resizeBy(0, need);
    }
  };
  // (Thunderbirds Dialoge passen ihre Größe nach dem Laden teils selbst an)
  win.addEventListener("load", () => {
    for (const ms of [50, 400, 1200]) {
      win.setTimeout(grow, ms);
    }
  }, { once: true });
}

// Nachfragen im Fenster statt als eigenes Fenster (wie in Firefox): Thunderbirds
// Prompter zeigt Nachfragen eines Fensters als Kachel darin, sobald das Fenster
// ein gDialogBox anbietet (Prompter.sys.mjs: MODAL_TYPE_INTERNAL_WINDOW). Wir
// bieten es im Haupt- und im Verfassen-Fenster an – mit Thunderbirds eigenem
// SubDialog (wie die Unterdialoge der Einstellungen). Ausschaltbar über
// extensions.mailcards.inlinePrompts.
const INLINE_PROMPTS_PREF = "extensions.mailcards.inlinePrompts";

function installDialogBox(win, restorers) {
  if (!Services.prefs.getBoolPref(INLINE_PROMPTS_PREF, true) || win.gDialogBox || !win.document?.documentElement) {
    return;
  }
  const doc = win.document;
  const { SubDialogManager } = ChromeUtils.importESModule("resource://gre/modules/SubDialog.sys.mjs");
  const X = "http://www.w3.org/1999/xhtml";
  // Behälter: ein modales <dialog> (oberste Ebene, sperrt das Fenster dahinter)
  const host = doc.createElementNS(X, "dialog");
  host.id = "mcDialogBox";
  host.__mcOwner = HOOK_OWNER;
  (doc.body || doc.documentElement).append(host);
  // Vorlage wie in den Einstellungen (preferences.xhtml #dialogTemplate)
  const template = doc.createXULElement("vbox");
  // ohne align/pack: die Lage bestimmt userChrome.css (oben mittig wie ein Sheet)
  template.className = "dialogOverlay";
  template.setAttribute("topmost", "true");
  template.hidden = true;
  const box = doc.createXULElement("vbox");
  box.className = "dialogBox";
  box.setAttribute("role", "dialog");
  const bar = doc.createXULElement("hbox");
  bar.className = "dialogTitleBar";
  bar.setAttribute("align", "center");
  const title = doc.createXULElement("label");
  title.className = "dialogTitle";
  title.setAttribute("flex", "1");
  const close = doc.createXULElement("button");
  close.className = "dialogClose close-icon";
  bar.append(title, close);
  const frame = doc.createXULElement("browser");
  frame.className = "dialogFrame";
  frame.setAttribute("autoscroll", "false");
  frame.setAttribute("disablehistory", "true");
  box.append(bar, frame);
  template.append(box);
  const waiting = [];
  let busy = false;
  const dialogBox = {
    get isOpen() {
      return busy;
    },
    async open(uri, args) {
      while (busy) {
        await new Promise(resolve => waiting.push(resolve));
      }
      busy = true;
      try {
        host.textContent = "";
        host.showModal();
        const manager = new SubDialogManager({
          dialogStack: host,
          dialogTemplate: template,
          orderType: SubDialogManager.ORDER_QUEUE,
          allowDuplicateDialogs: true,
          dialogOptions: {
            consumeOutsideClicks: false,
            styleSheets: [`resource://mailcards/dialog-box.css?v=${extensionVersion}`],
          },
        });
        await new Promise(resolve => {
          const opened = manager.open(uri, { features: "resizable=no", closedCallback: resolve }, args);
          if (!opened) {
            resolve();
          }
        });
      } finally {
        if (host.open) {
          host.close();
        }
        host.textContent = "";
        busy = false;
        waiting.shift()?.();
      }
    },
  };
  win.gDialogBox = dialogBox;
  restorers?.push(() => {
    if (win.gDialogBox === dialogBox) {
      delete win.gDialogBox;
    }
    host.remove();
  });
}

// Seiten im Fenster (Mailansicht about:3pane/about:message) fragen über ihr
// eigenes Fenster nach – dort auf die Kachel des äußeren Fensters verweisen
function shareDialogBox(win, restorers) {
  if (!Services.prefs.getBoolPref(INLINE_PROMPTS_PREF, true) || Object.getOwnPropertyDescriptor(win, "gDialogBox")) {
    return;
  }
  Object.defineProperty(win, "gDialogBox", {
    configurable: true,
    get: () => {
      const top = win.browsingContext?.topChromeWindow;
      return top && top !== win ? top.gDialogBox : undefined;
    },
  });
  restorers?.push(() => {
    try {
      delete win.gDialogBox;
    } catch {}
  });
}

// Aufgaben-Ansicht wie die Mailliste wählbar: „Liste“ (Standard) mit den
// Details rechts neben der Liste und nur Erledigt/Titel/Fälligkeit, „Tabelle“
// wie bisher mit allen Spalten und den Details darunter. In schmalen Fenstern
// rutschen die Details auch in der Liste wieder unter die Liste.
const TASK_VIEW_PREF = "extensions.mailcards.taskView";
const TASK_COLUMNS_PREF = "extensions.mailcards.taskTableColumns";
const TASK_DETAILS_WIDTH_PREF = "extensions.mailcards.taskDetailsWidth";
const TASK_LIST_COLUMNS = ["completed", "title", "dueDate"];
const TASK_SIDE_MIN = 760; // Liste 360 + Details 360 + Teiler/Luft

function taskView() {
  return Services.prefs.getCharPref(TASK_VIEW_PREF, "list") == "table" ? "table" : "list";
}

function applyTaskView(win, mode = taskView()) {
  const doc = win.document;
  const tree = doc.getElementById("calendar-task-tree");
  const splitter = doc.getElementById("calendar-task-view-splitter");
  const details = doc.getElementById("calendar-task-details-container");
  const box = tree?.parentElement;
  if (!tree || !splitter || !details || !box) {
    return;
  }
  const root = doc.documentElement;
  const list = mode == "list";
  // Spalten: in der Liste nur Erledigt, Titel, Fälligkeit; die Auswahl der
  // Tabelle wird gemerkt und beim Zurückschalten wiederhergestellt
  const cols = [...tree.querySelectorAll("treecol[itemproperty]")];
  const key = c => c.getAttribute("itemproperty");
  if (cols.length) {
    const state = tree.dataset.mcCols || "table";
    if (list && state != "list") {
      const shown = cols.filter(c => !c.hidden).map(key);
      // nach einem Neustart zeigt die Liste schon die Listenspalten (Thunderbird
      // merkt sich die sichtbaren Spalten) – dann die gemerkte Tabelle behalten
      if (!shown.every(k => TASK_LIST_COLUMNS.includes(k)) || !Services.prefs.prefHasUserValue(TASK_COLUMNS_PREF)) {
        Services.prefs.setCharPref(TASK_COLUMNS_PREF, JSON.stringify(shown));
      }
      for (const c of cols) {
        c.hidden = !TASK_LIST_COLUMNS.includes(key(c));
      }
    } else if (!list && state == "list") {
      let shown = null;
      try {
        shown = JSON.parse(Services.prefs.getCharPref(TASK_COLUMNS_PREF, "null"));
      } catch {}
      if (Array.isArray(shown) && shown.length) {
        for (const c of cols) {
          c.hidden = !shown.includes(key(c));
        }
      }
    }
    tree.dataset.mcCols = list ? "list" : "table";
  }
  root.toggleAttribute("mc-task-list", list);
  const side = list && box.getBoundingClientRect().width >= TASK_SIDE_MIN;
  if (side == root.hasAttribute("mc-task-side")) {
    return;
  }
  root.toggleAttribute("mc-task-side", side);
  if (side) {
    details.dataset.mcHeight = details.style.height || "";
    details.style.removeProperty("height");
    details.style.width = Services.prefs.getIntPref(TASK_DETAILS_WIDTH_PREF, 380) + "px";
    splitter.setAttribute("orient", "horizontal");
  } else {
    details.style.removeProperty("width");
    if (details.dataset.mcHeight != null) {
      details.style.height = details.dataset.mcHeight || "50%";
      delete details.dataset.mcHeight;
    }
    splitter.setAttribute("orient", "vertical");
  }
}

function setTaskView(win, key) {
  Services.prefs.setCharPref(TASK_VIEW_PREF, key);
  applyTaskView(win);
}

function hookTaskView(win, restorers) {
  const doc = win.document;
  const details = doc.getElementById("calendar-task-details-container");
  const splitter = doc.getElementById("calendar-task-view-splitter");
  if (!details || !splitter || splitter.__mcTaskView) {
    return;
  }
  splitter.__mcTaskView = true;
  const apply = () => {
    try {
      applyTaskView(win);
    } catch (e) {
      log("task view error", e);
    }
  };
  // Breite der Details merken, wenn der Teiler in der Kartenansicht gezogen
  // wurde; die neue Listenbreite gilt dann wie im Adressbuch auch für die Mail
  // (__mcDragged liest die Ausrichtung der Toolbar)
  const onDown = () => (details.__mcDragging = true);
  const onUp = () => win.setTimeout(() => {
    if (!details.__mcDragging) {
      return;
    }
    delete details.__mcDragging;
    if (doc.documentElement.hasAttribute("mc-task-side")) {
      const wd = Math.round(details.getBoundingClientRect().width);
      if (wd >= 300) {
        Services.prefs.setIntPref(TASK_DETAILS_WIDTH_PREF, wd);
        details.__mcDragged = true;
      }
    }
  }, 0);
  splitter.addEventListener("mousedown", onDown);
  splitter.addEventListener("mouseup", onUp);
  win.addEventListener("mouseup", onUp, true);
  const ro = new win.ResizeObserver(() => apply());
  ro.observe(details.parentElement);
  const prefObs = () => apply();
  Services.prefs.addObserver(TASK_VIEW_PREF, prefObs);
  apply();
  restorers?.push(() => {
    ro.disconnect();
    splitter.removeEventListener("mousedown", onDown);
    splitter.removeEventListener("mouseup", onUp);
    win.removeEventListener("mouseup", onUp, true);
    Services.prefs.removeObserver(TASK_VIEW_PREF, prefObs);
    delete splitter.__mcTaskView;
    // Tabelle wiederherstellen (Spalten, Details unten), die Wahl bleibt gemerkt
    applyTaskView(win, "table");
  });
}

// Kartenansicht der Aufgaben wie die Mail-Karten: Thunderbirds Liste (XUL-Baum)
// kann keine zweizeiligen, runden Zeilen – darüber liegt deshalb eine eigene
// Liste aus Karten (Kreis + Titel, darunter Fälligkeit, Kalender, Kategorien).
// Auswahl, Tastatur, Kontextmenü und Befehle bleiben bei Thunderbirds Liste
// (sie behält den Fokus und liegt unsichtbar darunter); die Karten zeigen nur
// deren Inhalt und Auswahl und geben Klicks an sie weiter.
function hookTaskCards(win, restorers) {
  const doc = win.document;
  const tree = doc.getElementById("calendar-task-tree");
  const box = tree?.parentElement;
  if (!tree || !box || doc.getElementById("mcTaskCards")) {
    return;
  }
  const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
  const X = "http://www.w3.org/1999/xhtml";
  const el = (tag, cls, text) => {
    const e = doc.createElementNS(X, tag);
    if (cls) {
      e.className = cls;
    }
    if (text != null) {
      e.textContent = text;
    }
    return e;
  };
  const list = el("div");
  list.id = "mcTaskCards";
  list.setAttribute("role", "presentation");
  tree.before(list);
  const locale = Services.locale.appLocaleAsBCP47;
  const fmtDay = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
  const fmtDayYear = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });
  const fmtTime = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
  const rel = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // Fälligkeit wie in Apple Erinnerungen: „Heute, 14:00“, „Morgen“, „3. Nov.“
  const dueText = task => {
    const due = task.dueDate;
    if (!due?.isValid) {
      return null;
    }
    const js = cal.dtz.dateTimeToJsDate(due.isDate ? due : due.getInTimezone(cal.dtz.defaultTimezone));
    const now = new Date();
    const days = Math.round((dayStart(js) - dayStart(now)) / 86400000);
    let text = Math.abs(days) <= 1 ? rel.format(days, "day") : (js.getFullYear() == now.getFullYear() ? fmtDay : fmtDayYear).format(js);
    text = text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);
    if (!due.isDate) {
      text += ", " + fmtTime.format(js);
    }
    return { text, overdue: !task.isCompleted && (due.isDate ? days < 0 : js < now) };
  };
  const color = calendar => {
    try {
      return calendar.getProperty("color") || "#007AFF";
    } catch {
      return "#007AFF";
    }
  };
  let pending = false;
  const render = () => {
    pending = false;
    if (!list.isConnected || !doc.documentElement.hasAttribute("mc-task-list")) {
      return;
    }
    const tasks = tree.mTaskArray || [];
    const sel = tree.view?.selection;
    const cards = tasks.map((task, i) => {
      const card = el("div", "mc-tc");
      card.dataset.index = i;
      card.toggleAttribute("data-completed", !!task.isCompleted);
      if (sel?.isSelected(i)) {
        card.setAttribute("aria-selected", "true");
      }
      const check = el("span", "mc-tc-check");
      check.style.setProperty("--mc-tc-color", color(task.calendar));
      const body = el("div", "mc-tc-body");
      const line1 = el("div", "mc-tc-title");
      // Priorität wie Apple: „!!!“ hoch, „!!“ mittel, „!“ niedrig vor dem Titel
      const prio = task.priority;
      if (prio >= 1 && prio <= 9) {
        line1.append(el("span", "mc-tc-prio", prio <= 4 ? "!!!" : prio == 5 ? "!!" : "!"));
      }
      line1.append(task.title || "");
      const line2 = el("div", "mc-tc-meta");
      const due = dueText(task);
      if (due) {
        const d = el("span", "mc-tc-due", due.text);
        d.toggleAttribute("data-overdue", due.overdue);
        line2.append(d);
      }
      const calName = el("span", "mc-tc-cal", task.calendar?.name || "");
      calName.style.setProperty("--mc-tc-color", color(task.calendar));
      line2.append(calName);
      const cats = task.getCategories?.() || [];
      if (cats.length) {
        line2.append(el("span", "mc-tc-cats", cats.join(", ")));
      }
      body.append(line1, line2);
      card.append(check, body);
      return card;
    });
    list.replaceChildren(...cards);
    list.toggleAttribute("data-focused", doc.activeElement == tree);
    enhancer?.updateListHeader?.(win); // Anzahl im Listenkopf
  };
  const schedule = () => {
    if (!pending) {
      pending = true;
      win.requestAnimationFrame(render);
    }
  };
  // Thunderbird meldet Änderungen der Liste über diese Methoden des Baums
  const wrapped = [];
  for (const name of ["invalidate", "invalidateRow", "invalidateRange", "rowCountChanged"]) {
    const orig = tree[name];
    if (typeof orig != "function") {
      continue;
    }
    tree[name] = function (...args) {
      schedule();
      return orig.apply(this, args);
    };
    wrapped.push([name, orig]);
  }
  const onSelect = () => {
    const sel = tree.view?.selection;
    for (const card of list.children) {
      card.toggleAttribute("aria-selected", !!sel?.isSelected(+card.dataset.index));
    }
    list.querySelector(`.mc-tc[data-index="${tree.currentIndex}"]`)?.scrollIntoView({ block: "nearest" });
  };
  const onFocus = () => list.toggleAttribute("data-focused", doc.activeElement == tree);
  tree.addEventListener("select", onSelect);
  tree.addEventListener("focus", onFocus);
  tree.addEventListener("blur", onFocus);
  const indexOf = event => {
    const card = event.target.closest?.(".mc-tc");
    return card ? +card.dataset.index : -1;
  };
  list.addEventListener("mousedown", event => {
    const i = indexOf(event);
    const sel = tree.view?.selection;
    if (!sel) {
      return;
    }
    event.preventDefault();
    tree.focus();
    if (i < 0) {
      sel.clearSelection();
      return;
    }
    // Kreis: erledigt / offen (wie Thunderbirds Spalte „Erledigt“)
    if (event.button == 0 && event.target.closest(".mc-tc-check")) {
      tree.mTreeView?.cycleCell(i, { element: tree.querySelector("[itemproperty='completed']") });
      return;
    }
    if (event.button == 2 && sel.isSelected(i)) {
      return;
    }
    if (event.shiftKey) {
      sel.rangedSelect(tree.currentIndex >= 0 ? tree.currentIndex : i, i, event.metaKey || event.ctrlKey);
    } else if (event.metaKey || event.ctrlKey) {
      sel.toggleSelect(i);
    } else {
      sel.select(i);
    }
    tree.currentIndex = i;
  });
  list.addEventListener("dblclick", event => {
    const i = indexOf(event);
    if (event.button != 0 || event.target.closest(".mc-tc-check")) {
      return;
    }
    const initialDate = cal.dtz.getDefaultStartDate(tree.getInitialDate?.());
    if (i >= 0) {
      win.modifyEventWithDialog?.(tree.mTaskArray[i], true, initialDate);
    } else {
      win.createTodoWithDialog?.(null, null, null, null, initialDate);
    }
  });
  list.addEventListener("contextmenu", event => {
    event.preventDefault();
    const menu = doc.getElementById(tree.getAttribute("context") || "taskitem-context-menu");
    menu?.openPopupAtScreen(event.screenX, event.screenY, true, event);
  });
  const prefObs = () => schedule();
  Services.prefs.addObserver(TASK_VIEW_PREF, prefObs);
  // Hinweis „schreibgeschützt“ wechselt mit dem Standardkalender → Listenkopf neu
  const field = doc.getElementById("view-task-edit-field");
  const fieldMo = field ? new win.MutationObserver(() => enhancer?.updateListHeader?.(win)) : null;
  fieldMo?.observe(field, { attributes: true, attributeFilter: ["readonly", "aria-disabled", "value", "placeholder"] });
  // (Mitternacht: „Heute“/„Morgen“ und überfällig neu)
  const timer = win.setInterval(schedule, 10 * 60 * 1000);
  schedule();
  restorers?.push(() => {
    for (const [name, orig] of wrapped) {
      tree[name] = orig;
    }
    tree.removeEventListener("select", onSelect);
    tree.removeEventListener("focus", onFocus);
    tree.removeEventListener("blur", onFocus);
    Services.prefs.removeObserver(TASK_VIEW_PREF, prefObs);
    fieldMo?.disconnect();
    win.clearInterval(timer);
    list.remove();
  });
}

// Aufgabenliste: Thunderbird löst die Liste von den Kalendern, sobald sie kurz
// nicht angezeigt wird (z. B. beim Ein-/Ausblenden der Today-Pane), verbindet
// sie beim erneuten Anzeigen aber nur beim allerersten Mal wieder – danach
// erschienen neue Aufgaben erst nach einem Bereichswechsel. Beim Wiederanzeigen
// daher neu verbinden (refresh() fügt den Beobachter hinzu und lädt die Liste).
function relinkTaskTree(win, restorers) {
  const tree = win.document.getElementById("calendar-task-tree");
  const proto = tree?.mTreeView && Object.getPrototypeOf(tree.mTreeView);
  if (!proto?.setTree || proto.__mcRelink) {
    return;
  }
  const orig = proto.setTree;
  proto.__mcRelink = true;
  proto.setTree = function (newTree) {
    const relink = !this.tree && newTree?.isInitialized;
    const result = orig.call(this, newTree);
    if (relink) {
      win.setTimeout(() => {
        try {
          if (this.tree == newTree) {
            newTree.refresh();
          }
        } catch (e) {
          log("task tree relink error", e);
        }
      }, 0);
    }
    return result;
  };
  restorers?.push(() => {
    proto.setTree = orig;
    delete proto.__mcRelink;
  });
}

// Adressbuch: Thunderbirds „Personal Address Book“ heißt wie in Apple Kontakte
// „Contacts“ („Kontakte“) – einmalig und nur, solange der Name noch
// Thunderbirds Vorgabe ist (ein selbst gewählter Name bleibt)
const PAB_URI = "jsaddrbook://abook.sqlite";
const PAB_NAME_PREF = "ldap_2.servers.pab.description";
const PAB_RENAMED_PREF = "extensions.mailcards.pabRenamed";
// gesetzter Name, damit Deaktivieren/Deinstallieren ihn wieder zurücknehmen kann
const PAB_RENAMED_TO_PREF = "extensions.mailcards.pabRenamedTo";

function renamePersonalBookOnce() {
  if (Services.prefs.getBoolPref(PAB_RENAMED_PREF, false)) {
    return;
  }
  try {
    const book = MailServices.ab.getDirectory(PAB_URI);
    if (!book) {
      return;
    }
    let tbDefault = "";
    try {
      tbDefault = Services.strings
        .createBundle("chrome://messenger/locale/addressbook/addressBook.properties")
        .GetStringFromName(PAB_NAME_PREF);
    } catch {}
    if (!Services.prefs.prefHasUserValue(PAB_NAME_PREF) || (tbDefault && book.dirName == tbDefault)) {
      book.dirName = tr("Contacts");
      Services.prefs.setStringPref(PAB_RENAMED_TO_PREF, book.dirName);
      log("adressbuch: persönliches Adressbuch umbenannt", book.dirName);
    }
    Services.prefs.setBoolPref(PAB_RENAMED_PREF, true);
  } catch (e) {
    log("pab rename error", e);
  }
}

// Deaktivieren/Deinstallieren: trägt das Buch noch den von halo.spaces
// gesetzten Namen, wieder Thunderbirds (lokalisierten) Standardnamen nehmen –
// Thunderbird sperrt den Namen dieses Buchs im Dialog „Eigenschaften“
function restorePersonalBookName() {
  try {
    const ours = Services.prefs.getStringPref(PAB_RENAMED_TO_PREF, "");
    if (ours && Services.prefs.getStringPref(PAB_NAME_PREF, "") == ours) {
      Services.prefs.clearUserPref(PAB_NAME_PREF);
      log("adressbuch: Name des persönlichen Adressbuchs zurückgesetzt");
    }
    Services.prefs.clearUserPref(PAB_RENAMED_TO_PREF);
    Services.prefs.clearUserPref(PAB_RENAMED_PREF);
  } catch (e) {
    log("pab rename restore error", e);
  }
}

// Adressbuch: „Collected Addresses“ (automatisch gesammelte Empfänger) nicht
// in der Seitenleiste – Apple Kontakte kennt so etwas nicht (Apple Mail führt
// sie getrennt als „Frühere Empfänger“). Das Adressbuch selbst bleibt, die
// Ergänzung beim Schreiben funktioniert weiter. Einstellung, Standard: aus.
const HIDE_COLLECTED_PREF = "extensions.mailcards.hideCollectedAddresses";

function hookCollectedAddresses(cw, restorers) {
  const doc = cw.document;
  const books = cw.booksList;
  if (!books || books.__mcCollected) {
    return;
  }
  books.__mcCollected = true;
  const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
  const mark = () => {
    const hide = Services.prefs.getBoolPref(HIDE_COLLECTED_PREF, true);
    doc.documentElement.toggleAttribute("mc-hide-collected", hide);
    let uid = null;
    try {
      uid = MailServices.ab.directories.find(d => d.dirPrefId == "ldap_2.servers.history")?.UID;
    } catch {}
    for (const row of books.querySelectorAll(":scope > li")) {
      row.toggleAttribute("data-mc-collected", !!uid && row.dataset.uid == uid);
    }
    // war das gesammelte Buch gewählt: auf „Alle Adressbücher“ wechseln
    if (hide && books.selectedRow?.hasAttribute("data-mc-collected")) {
      books.selectedIndex = 0;
    }
  };
  const mo = new cw.MutationObserver(mark);
  mo.observe(books, { childList: true });
  const prefObs = () => mark();
  Services.prefs.addObserver(HIDE_COLLECTED_PREF, prefObs);
  mark();
  // Tab geschlossen: Beobachter sofort abmelden (Fenster-Restorer werden
  // dann nur verworfen, nicht ausgeführt)
  const detach = () => {
    mo.disconnect();
    Services.prefs.removeObserver(HIDE_COLLECTED_PREF, prefObs);
  };
  cw.addEventListener("unload", detach, { once: true });
  restorers?.push(() => {
    detach();
    cw.removeEventListener("unload", detach);
    doc.documentElement.removeAttribute("mc-hide-collected");
    delete books.__mcCollected;
  });
}

// Adressbuch: das persönliche Adressbuch (ldap_2.servers.pab, lässt sich in
// Thunderbird nicht löschen) in der Seitenleiste ausblenden, solange es leer
// ist – wer Konten (CardDAV) nutzt, braucht es nicht. Ein- und Ausblenden über
// das „…“-Menü der Kontaktliste (Pref, ohne eigene Wahl gilt „leer = aus“).
// Nie ausgeblendet, wenn es das einzige sichtbare Adressbuch ist. Kommt ein
// Kontakt hinein (z. B. über den Stern im Mailkopf), wird es eingeblendet –
// sonst entstünden Kontakte in einem unsichtbaren Buch.
const SHOW_PAB_PREF = "extensions.mailcards.showPersonalAddressBook";

function personalBookState() {
  let pab = null;
  let others = [];
  try {
    const hideCollected = Services.prefs.getBoolPref(HIDE_COLLECTED_PREF, true);
    const dirs = MailServices.ab.directories;
    pab = dirs.find(d => d.URI == PAB_URI) || null;
    others = dirs.filter(d => d.URI != PAB_URI && !(hideCollected && d.dirPrefId == "ldap_2.servers.history"));
  } catch {}
  if (!pab) {
    return { pab: null, uid: null, canHide: false, hidden: false };
  }
  const canHide = others.length > 0;
  let shown;
  if (Services.prefs.prefHasUserValue(SHOW_PAB_PREF)) {
    shown = Services.prefs.getBoolPref(SHOW_PAB_PREF, false);
  } else {
    try {
      shown = pab.childCardCount > 0 || pab.childNodes.length > 0;
    } catch {
      shown = true;
    }
  }
  return { pab, uid: pab.UID, canHide, hidden: canHide && !shown };
}

// global: neuer Kontakt oder neue Liste im persönlichen Adressbuch → einblenden
// (als eigene Wahl gemerkt, damit es nicht wieder verschwindet, wenn es leer wird)
function watchPersonalBook(restorers) {
  const obs = {
    observe(_subject, _topic, dirUID) {
      try {
        if (dirUID && dirUID == MailServices.ab.getDirectory(PAB_URI)?.UID && !Services.prefs.getBoolPref(SHOW_PAB_PREF, false)) {
          Services.prefs.setBoolPref(SHOW_PAB_PREF, true);
        }
      } catch (e) {
        log("pab watch error", e);
      }
    },
  };
  const TOPICS = ["addrbook-contact-created", "addrbook-list-created"];
  for (const t of TOPICS) {
    Services.obs.addObserver(obs, t);
  }
  restorers.push(() => {
    for (const t of TOPICS) {
      Services.obs.removeObserver(obs, t);
    }
  });
}

function hookPersonalBook(cw, restorers) {
  const doc = cw.document;
  const books = cw.booksList;
  if (!books || books.__mcPersonal) {
    return;
  }
  books.__mcPersonal = true;
  const mark = () => {
    const { uid, hidden } = personalBookState();
    for (const row of books.querySelectorAll(":scope > li")) {
      row.toggleAttribute("data-mc-pab-hidden", hidden && !!uid && row.dataset.uid == uid);
    }
    // war es (oder eine seiner Listen) gewählt: auf „Alle Adressbücher“ wechseln
    if (hidden && books.selectedRow?.closest("li[data-mc-pab-hidden]")) {
      books.selectedIndex = 0;
    }
    if (item) {
      updateItem();
    }
  };
  // abhakbarer Eintrag im „…“-Menü, Abschnitt „View“
  const menu = doc.getElementById("sortContext");
  let item = null;
  const updateItem = () => {
    const { pab, canHide, hidden } = personalBookState();
    item.hidden = !pab;
    item.setAttribute("label", tr("Show Address Book “{name}”", { name: pab?.dirName || "" }));
    item.toggleAttribute("checked", !hidden);
    item.toggleAttribute("disabled", !canHide);
  };
  if (menu && !doc.getElementById("mcShowPersonalBook")) {
    item = doc.createXULElement("menuitem");
    item.id = "mcShowPersonalBook";
    item.setAttribute("type", "checkbox");
    item.addEventListener("command", () => {
      Services.prefs.setBoolPref(SHOW_PAB_PREF, item.hasAttribute("checked"));
    });
    const after = doc.getElementById("mcHideDuplicates");
    if (after) {
      after.after(item);
    } else {
      menu.append(item);
    }
    menu.addEventListener("popupshowing", updateItem);
    updateItem();
  }
  const mo = new cw.MutationObserver(mark);
  mo.observe(books, { childList: true });
  const prefObs = () => mark();
  Services.prefs.addObserver(SHOW_PAB_PREF, prefObs);
  Services.prefs.addObserver(HIDE_COLLECTED_PREF, prefObs);
  mark();
  // Tab geschlossen: Beobachter sofort abmelden (siehe hookCollectedAddresses)
  const detach = () => {
    mo.disconnect();
    Services.prefs.removeObserver(SHOW_PAB_PREF, prefObs);
    Services.prefs.removeObserver(HIDE_COLLECTED_PREF, prefObs);
  };
  cw.addEventListener("unload", detach, { once: true });
  restorers?.push(() => {
    detach();
    cw.removeEventListener("unload", detach);
    menu?.removeEventListener("popupshowing", updateItem);
    item?.remove();
    for (const row of books.querySelectorAll("li[data-mc-pab-hidden]")) {
      row.removeAttribute("data-mc-pab-hidden");
    }
    delete books.__mcPersonal;
  });
}

// Adressbuch wie Apple Kontakte: nie eine Kontaktliste ohne gewählten Kontakt.
// Beim Öffnen und nach jedem Neuaufbau der Liste (Buchwechsel, Suche, Löschen)
// den zuletzt gewählten Kontakt wieder wählen, sonst den ersten Kontakt aus
// einem sichtbaren Adressbuch. Gemerkt wird nur, was der Nutzer selbst wählt.
const LAST_CONTACT_PREF = "extensions.mailcards.lastContact";

function hookLastContact(cw, restorers) {
  const pane = cw.detailsPane;
  const books = cw.booksList;
  const list = cw.cardsPane?.cardsList;
  if (!pane || !books || !list || typeof pane.displayCards != "function" || pane.__mcLastContact) {
    return;
  }
  pane.__mcLastContact = true;
  let own = false;
  let initial = true;
  let timer = null;
  const bookVisible = uid => {
    const row = uid && books.querySelector(`:scope > li[data-uid="${uid}"]`);
    return !row || cw.getComputedStyle(row).display != "none";
  };
  const remember = () => {
    if (own) {
      return;
    }
    try {
      const idx = list.selectedIndices;
      const card = idx.length == 1 ? list.view?.getCardFromRow(idx[0]) : null;
      if (card?.UID) {
        Services.prefs.setStringPref(LAST_CONTACT_PREF, `${card.directoryUID || ""} ${card.UID}`);
      }
    } catch (e) {
      log("last contact save error", e);
    }
  };
  const ensure = () => {
    timer = null;
    try {
      const view = list.view;
      if (pane.isEditing || !view || list.selectedIndices.length) {
        initial = false;
        return;
      }
      const n = view.rowCount || 0;
      const [dirUID, cardUID] = Services.prefs.getStringPref(LAST_CONTACT_PREF, "").split(" ");
      let index = -1;
      for (let i = 0; cardUID && i < n; i++) {
        if (view.getCardFromRow(i)?.UID == cardUID) {
          index = i;
          break;
        }
      }
      // beim Öffnen: steht der Kontakt nicht im gewählten Buch, in sein Buch wechseln
      if (index < 0 && initial && dirUID && books.selectedIndex != 0) {
        initial = false;
        const bi = books.getIndexForUID?.(dirUID) ?? -1;
        if (bi > 0 && bi != books.selectedIndex && bookVisible(dirUID)) {
          books.selectedIndex = bi;
          return;
        }
      }
      initial = false;
      if (index < 0) {
        // Rückfall: erster Kontakt aus einem sichtbaren Adressbuch
        for (let i = 0; i < n; i++) {
          if (bookVisible(view.getCardFromRow(i)?.directoryUID)) {
            index = i;
            break;
          }
        }
      }
      if (index < 0 && n) {
        index = 0;
      }
      if (index >= 0) {
        own = true;
        try {
          list.selectedIndex = index;
        } finally {
          own = false;
        }
      }
    } catch (e) {
      log("last contact error", e);
    }
  };
  const schedule = () => {
    if (!timer) {
      timer = cw.setTimeout(ensure, 0);
    }
  };
  const origDisplay = pane.displayCards;
  pane.displayCards = function (cards = [], ...rest) {
    const result = origDisplay.call(this, cards, ...rest);
    if (!cards?.length) {
      schedule();
    }
    return result;
  };
  list.addEventListener("select", remember);
  schedule();
  restorers?.push(() => {
    pane.displayCards = origDisplay;
    list.removeEventListener("select", remember);
    if (timer) {
      cw.clearTimeout(timer);
    }
    delete pane.__mcLastContact;
  });
}

// Kontaktfoto wie Apple Kontakte: im Fotodialog jederzeit ein anderes Bild wählen
// („Choose…“, öffnet Thunderbirds Dateifeld), Ausschnitt rund mit Zoom-Regler
// darunter (vergrößert/verkleinert um die Mitte; verschieben per Ziehen wie bisher)
function hookPhotoDialog(cw, restorers = null) {
  const pd = cw.photoDialog;
  const doc = cw.document;
  const dialog = doc.getElementById("photoDialog");
  if (!pd || !dialog || ownedElement(doc, "mcPhotoChoose")) {
    return;
  }
  pd.init?.();
  const X = "http://www.w3.org/1999/xhtml";
  const choose = doc.createElementNS(X, "button");
  choose.id = "mcPhotoChoose";
  choose.__mcOwner = HOOK_OWNER;
  choose.className = "button";
  choose.type = "button";
  choose.textContent = tr("Choose…");
  choose.addEventListener("click", () => pd._inputTarget?.click());
  const menu = dialog.querySelector(".dialog-menu-container");
  menu?.prepend(choose);
  const zoom = doc.createElementNS(X, "input");
  zoom.id = "mcPhotoZoom";
  zoom.type = "range";
  zoom.min = "0";
  zoom.max = "100";
  zoom.value = "0";
  zoom.setAttribute("aria-label", tr("Zoom"));
  const svg = dialog.querySelector("svg");
  svg?.after(zoom);
  const smallSide = () => Math.min(pd._previewRect?.width || 0, pd._previewRect?.height || 0);
  // Regler 0 = größter Ausschnitt (ganzes Bild), 100 = 4-fach vergrößert
  const sizeFor = v => smallSide() / (1 + 3 * (v / 100));
  const valueFor = size => Math.round(Math.max(0, Math.min(100, ((smallSide() / size) - 1) / 3 * 100)));
  zoom.addEventListener("input", () => {
    const r = pd._cropRect;
    if (!r || !pd._previewRect) {
      return;
    }
    const size = sizeFor(Number(zoom.value));
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    r.width = r.height = size;
    r.x = Math.max(0, Math.min(pd._previewRect.width - size, cx - size / 2));
    r.y = Math.max(0, Math.min(pd._previewRect.height - size, cy - size / 2));
    pd._redrawCropRect();
  });
  // runder Ausschnitt statt Quadrat, Regler folgt der Größe
  const origRedraw = pd._redrawCropRect;
  pd._redrawCropRect = function (...args) {
    const result = origRedraw.apply(this, args);
    try {
      const { x, y, width } = this._cropRect;
      const rad = width / 2, cx = x + rad, cy = y + rad;
      this._cropMask.setAttribute("fill-rule", "evenodd");
      this._cropMask.setAttribute("d",
        `M0 0H${this._previewRect.width}V${this._previewRect.height}H0Z M${cx - rad} ${cy}a${rad} ${rad} 0 1 0 ${2 * rad} 0a${rad} ${rad} 0 1 0 ${-2 * rad} 0Z`);
      this._dragRect.setAttribute("rx", rad);
      this._dragRect.setAttribute("ry", rad);
      if (doc.activeElement != zoom) {
        zoom.value = String(valueFor(width));
      }
    } catch {}
    return result;
  };
  // Regler nur, wenn ein Bild zum Zuschneiden da ist
  const sync = () => (zoom.hidden = !!svg?.hasAttribute("hidden"));
  const mo = new cw.MutationObserver(sync);
  if (svg) {
    mo.observe(svg, { attributes: true, attributeFilter: ["hidden"] });
  }
  sync();
  restorers?.push(() => {
    mo.disconnect();
    choose.remove();
    zoom.remove();
    pd._redrawCropRect = origRedraw;
  });
}

// Kontextmenüs ohne „In neuem Tab/Fenster öffnen“ (alle Bereiche; Punkte per CSS
// ausgeblendet). Danach stünden Trennlinien doppelt oder am Rand – beim Öffnen
// aufräumen; ein Menü ohne sichtbare Einträge öffnet sich gar nicht erst
const NEW_TAB_POPUPS = ["folderPaneContext", "mailContext", "otherActionsPopup", "spacesContextMenu", "tabContextMenu"];
function tidyMenuSeparators(popup) {
  const shown = el => !el.hidden && el.getAttribute("collapsed") != "true" && el.ownerDocument.defaultView.getComputedStyle(el).display != "none";
  let last = null, any = false;
  for (const el of popup.children) {
    if (el.localName == "menuseparator") {
      el.toggleAttribute("mc-tidy-hidden", !last || last.localName == "menuseparator");
      if (!el.hasAttribute("mc-tidy-hidden")) {
        last = el;
      }
    } else if (shown(el)) {
      last = el;
      any = true;
    }
  }
  // Trennlinie am Ende
  if (last?.localName == "menuseparator") {
    last.setAttribute("mc-tidy-hidden", "");
  }
  return any;
}
function hookNewTabMenus(doc, restorers = null) {
  for (const id of NEW_TAB_POPUPS) {
    const popup = doc.getElementById(id);
    if (!popup || popup.__mcTidy === HOOK_OWNER) {
      continue;
    }
    popup.__mcTidy = HOOK_OWNER;
    const onShowing = event => {
      if (event.target != popup) {
        return;
      }
      // nach Thunderbirds eigenem onpopupshowing (Attribut, läuft zuerst)
      if (!tidyMenuSeparators(popup)) {
        event.preventDefault();
      }
    };
    // Thunderbird blendet manche Einträge erst danach aus (Ordnermenü) – nochmals aufräumen
    const onShown = event => {
      if (event.target == popup) {
        tidyMenuSeparators(popup);
      }
    };
    popup.addEventListener("popupshowing", onShowing);
    popup.addEventListener("popupshown", onShown);
    restorers?.push(() => {
      popup.removeEventListener("popupshowing", onShowing);
      popup.removeEventListener("popupshown", onShown);
      delete popup.__mcTidy;
      popup.querySelectorAll("[mc-tidy-hidden]").forEach(el => el.removeAttribute("mc-tidy-hidden"));
    });
  }
}

// Termin-Fenster wie Apple Kalender: Karten untereinander – Titel; Ganztägig,
// Beginn, Ende, Wiederholung, Erinnerung (mit Beschriftung rechtsbündig); Ort;
// Teilnehmer; Kalender; Kategorie; ganz unten die Notiz („Add Notes or URL“).
// Links ein Streifen in der Farbe des gewählten Kalenders. Thunderbirds Zeilen
// werden nur umgestellt – Felder, IDs und Logik bleiben (nur für Termine, nicht Aufgaben)
function appleEventLayout(win) {
  const doc = win.document;
  const grid = doc.getElementById("event-grid");
  if (!grid || grid.__mcApple || !win.calendarItem?.isEvent?.()) {
    return;
  }
  grid.__mcApple = true;
  const X = "http://www.w3.org/1999/xhtml";
  const body = grid.tBodies?.[0] || grid;
  const row = id => doc.getElementById(id);
  const calendarRow = doc.getElementById("item-calendar")?.closest("tr");
  // Teilnehmer: eigene Karte „Add Invitees“ (öffnet „Teilnehmer einladen“)
  const invRow = doc.createElementNS(X, "tr");
  invRow.id = "mc-invitees-row";
  const invTh = doc.createElementNS(X, "th");
  const invTd = doc.createElementNS(X, "td");
  const invBtn = doc.createElementNS(X, "button");
  invBtn.type = "button";
  invBtn.className = "mc-invitees";
  invBtn.addEventListener("click", () => win.editAttendees?.());
  invTd.append(invBtn);
  invRow.append(invTh, invTd);
  const cards = [
    ["title", ["event-grid-title-row"]],
    ["time", ["event-grid-allday-row", "event-grid-startdate-row", "event-grid-enddate-row", "event-grid-recurrence-row", "event-grid-alarm-row"]],
    ["location", ["event-grid-location-row"]],
    ["invitees", [invRow]],
    ["calendar", [calendarRow]],
    ["category", ["event-grid-category-row"]],
    ["link", ["event-grid-link-row"]],
  ];
  // Reihenfolge nur per CSS (order in einer Flex-Spalte): beim Umhängen im Dokument
  // bauten sich Thunderbirds Datum/Uhrzeit-Felder ein zweites Mal auf
  body.append(invRow);
  let order = 0;
  for (const [name, rows] of cards) {
    const els = rows.map(r => (typeof r == "string" ? row(r) : r)).filter(Boolean);
    els.forEach((el, i) => {
      el.dataset.mcCard = name;
      el.toggleAttribute("data-mc-first", i == 0);
      el.toggleAttribute("data-mc-last", i == els.length - 1);
      el.style.order = String(++order);
    });
  }
  // Platzhalter wie Apple Kalender (Felder ohne Beschriftung)
  row("item-title")?.setAttribute("placeholder", tr("Title"));
  row("item-location")?.setAttribute("placeholder", tr("Add Location or Video Call"));
  // Teilnehmer-Karte: „Add Invitees“ bzw. die Namen der Eingeladenen
  const syncInvitees = () => {
    const list = (win.window.attendees || []).filter(a => !a.isOrganizer);
    invBtn.textContent = list.length ? list.map(a => a.commonName || a.toString().replace(/^mailto:/i, "")).join(", ") : tr("Add Invitees");
    invBtn.classList.toggle("mc-has", !!list.length);
    // Reiter unten nur, wenn es Anhänge oder Teilnehmer gibt (sonst wie Apple nur die Notiz)
    const attachments = doc.getElementById("attachment-link")?.itemCount || 0;
    doc.documentElement.toggleAttribute("mc-event-tabs", !!(attachments || list.length));
  };
  syncInvitees();
  const mo = new win.MutationObserver(syncInvitees);
  for (const el of [doc.getElementById("attachment-link"), doc.querySelector(".item-attendees-list-container"), doc.getElementById("event-grid-tab-attendees")]) {
    if (el) {
      mo.observe(el, { childList: true, subtree: true, attributes: true });
    }
  }
  // Streifen in der Kalenderfarbe links neben Titel und Zeitkarte
  const stripe = doc.createElementNS(X, "div");
  stripe.id = "mc-calendar-stripe";
  grid.append(stripe);
  const place = () => {
    const first = row("event-grid-title-row"), last = row("event-grid-alarm-row");
    const g = grid.getBoundingClientRect();
    if (!first || !last) {
      return;
    }
    stripe.style.top = `${first.getBoundingClientRect().top - g.top + 6}px`;
    stripe.style.height = `${Math.max(0, last.getBoundingClientRect().bottom - first.getBoundingClientRect().top - 12)}px`;
    let color = "";
    try {
      color = win.getCurrentCalendar?.()?.getProperty("color") || "";
    } catch {}
    stripe.style.backgroundColor = color || "var(--mt-accent)";
  };
  new win.ResizeObserver(place).observe(grid);
  row("item-calendar")?.addEventListener("command", () => win.setTimeout(place, 0));
  place();
  // Notiz: Platzhalter im leeren Beschreibungsfeld
  const desc = doc.getElementById("item-description");
  const setNotesPlaceholder = () => {
    const b = desc?.contentDocument?.body;
    if (!b) {
      return;
    }
    b.setAttribute("data-mc-placeholder", tr("Add Notes or URL"));
    const update = () => b.classList.toggle("mc-empty", !b.textContent.trim() && !b.querySelector("img"));
    update();
    if (!b.__mcPlaceholder) {
      b.__mcPlaceholder = true;
      b.addEventListener("input", update);
      new desc.contentWindow.MutationObserver(update).observe(b, { childList: true, subtree: true, characterData: true });
    }
  };
  setNotesPlaceholder();
  desc?.addEventListener("load", () => win.setTimeout(setNotesPlaceholder, 0), true);
  win.setTimeout(setNotesPlaceholder, 500);
  doc.documentElement.setAttribute("mc-apple-event", "");
}

// Termin/Aufgabe: Dauer beim Ändern immer beibehalten (wie Apple Kalender, wo
// das Ende mit dem Beginn wandert) – Thunderbirds Kopplungs-Knopf (Kettensymbol
// zwischen Beginn und Ende) dauerhaft an; ausgeblendet per CSS
function keepDurationAlways(win) {
  const doc = win.document;
  const kdb = doc.getElementById("keepduration-button");
  if (!kdb) {
    return;
  }
  if (kdb.getAttribute("keep") != "true") {
    kdb.setAttribute("keep", "true");
    kdb.setAttribute("aria-pressed", "true");
  }
  doc.getElementById("link-image-top")?.setAttribute("keep", "true");
  doc.documentElement.setAttribute("mc-keep-duration", "");
}

function hookDateTimePickers(win) {
  const doc = win.document;
  for (const dtp of doc.querySelectorAll("datetimepicker")) {
    const dp = dtp.querySelector("datepicker"), tp = dtp.querySelector("timepicker");
    const popup = dp?._popup, timePopup = tp?._popup;
    if (!popup || !timePopup || dtp.__mcCombined) {
      continue;
    }
    dtp.__mcCombined = true;
    const X = "http://www.w3.org/1999/xhtml";
    // eigenes Popover nur für die Uhrzeit
    const panel = doc.createXULElement("panel");
    panel.className = "mc-time-panel";
    panel.setAttribute("type", "arrow");
    panel.setAttribute("noautofocus", "true");
    const row = doc.createElementNS(X, "div");
    row.className = "mc-dtp-time";
    const label = doc.createElementNS(X, "label");
    label.textContent = tr("Time");
    const input = doc.createElementNS(X, "input");
    input.type = "time";
    input.step = "60";
    // Kapsel um das Feld: schneidet Thunderbirds Uhr-Knopf rechts ab (Apple zeigt keinen)
    const pill = doc.createElementNS(X, "span");
    pill.className = "mc-time-pill";
    pill.append(input);
    label.append(pill);
    row.append(label);
    panel.append(row);
    (doc.querySelector("popupset") || doc.documentElement).append(panel);
    const pad = n => String(n).padStart(2, "0");
    const timeOff = () => tp.hasAttribute("disabled") || tp._menulist?.hasAttribute("disabled") || tp.hidden ||
      win.getComputedStyle(tp).visibility == "hidden" || win.getComputedStyle(tp).display == "none";
    const apply = () => {
      const [h, m] = (input.value || "").split(":").map(Number);
      if (Number.isInteger(h) && Number.isInteger(m)) {
        tp.value = [h, m]; // meldet „change“ nur bei einer Änderung
      }
    };
    input.addEventListener("input", apply);
    input.addEventListener("keydown", event => {
      if (event.key == "Enter" || event.key == "Escape") {
        apply();
        panel.hidePopup();
      }
    });
    // Uhrzeit: nur das Uhrzeit-Popover statt Thunderbirds Stundenraster
    timePopup.addEventListener("popupshowing", event => {
      if (event.target != timePopup) {
        return;
      }
      event.preventDefault();
      if (timeOff()) {
        return;
      }
      const [h, m] = tp.value || [];
      input.value = Number.isInteger(h) ? `${pad(h)}:${pad(m)}` : "";
      win.setTimeout(() => {
        panel.openPopup(tp._menulist || tp, "after_start");
        panel.addEventListener("popupshown", () => input.focus(), { once: true });
      }, 0);
    });
    // Mausrad über Stunden bzw. Minuten (linke/rechte Hälfte des Felds): je
    // Rastung eine Einheit; Trackpad-Schritte werden aufsummiert (~40 px je Einheit)
    const wheelOn = (target, write) => {
      let sum = 0;
      target.addEventListener("wheel", event => {
        if (timeOff() || !event.deltaY) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        sum += event.deltaMode == 0 ? event.deltaY / 40 : Math.sign(event.deltaY);
        const units = Math.trunc(sum);
        if (!units) {
          return;
        }
        sum -= units;
        const rect = target.getBoundingClientRect();
        const onHour = event.clientX < rect.left + rect.width / 2;
        const [h, m] = tp.value || [0, 0];
        // Rad nach oben (deltaY < 0) zählt hoch, wie bei macOS-Uhrzeitfeldern
        const step = -units;
        const total = ((onHour ? h * 60 + m + step * 60 : h * 60 + m + step) % 1440 + 1440) % 1440;
        tp.value = [Math.floor(total / 60), total % 60];
        write?.();
      }, { passive: false });
    };
    wheelOn(input, () => {
      const [h, m] = tp.value;
      input.value = `${pad(h)}:${pad(m)}`;
    });
    // Pfeiltasten im Uhrzeitfeld: Stunde bzw. Minute (je nach Schreibmarke) weiter
    const field = tp._inputField;
    if (field) {
      wheelOn(field);
    }
    field?.addEventListener("keydown", event => {
      if ((event.key != "ArrowUp" && event.key != "ArrowDown") || event.altKey || event.metaKey) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const [h, m] = tp.value || [0, 0];
      const step = event.key == "ArrowUp" ? 1 : -1;
      const colon = field.value.search(/[^0-9]/);
      const onHour = colon < 0 || field.selectionStart <= colon;
      const total = ((onHour ? h * 60 + m + step * 60 : h * 60 + Math.round(m / 5) * 5 + step * 5) + 1440) % 1440;
      const caret = field.selectionStart;
      tp.value = [Math.floor(total / 60), total % 60];
      field.setSelectionRange(caret, caret);
    }, true);
    // Breite wie der Inhalt (Apple Kalender: „24.10.2026  09:00“ als schmaler
    // Text): breitester Wert im Format des Systems, Ziffern als „0“ und
    // zweistellig – so springt das Feld beim Ändern nicht
    for (const picker of [dp, tp]) {
      fitPickerWidth(win, picker);
    }
  }
}

function fitPickerWidth(win, picker) {
  const menulist = picker?._menulist || picker?.querySelector("menulist");
  const input = picker?._inputField || menulist?.shadowRoot?.querySelector("input");
  if (!menulist || !input) {
    return;
  }
  const fit = () => {
    const sample = (input.value || "").replace(/\d+/g, d => "0".repeat(Math.max(2, d.length)));
    if (!sample) {
      return;
    }
    const cs = win.getComputedStyle(input);
    const ctx = (fitPickerWidth.canvas ||= win.document.createElementNS("http://www.w3.org/1999/xhtml", "canvas")).getContext("2d");
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const width = Math.ceil(ctx.measureText(sample).width) + 2;
    if (width > 8) {
      menulist.style.setProperty("--mc-fit", `${width}px`);
    }
  };
  fit();
  win.setTimeout(fit, 300); // Wert steht beim Öffnen des Fensters evtl. erst danach
  input.addEventListener("change", fit);
}

// Einstellungen → halo.spaces öffnen (Info-Fenster, Begrüßung): Thunderbird
// springt beim Öffnen sofort zur Kategorie, die gibt es erst kurz danach
async function openHaloSettings(w) {
  // (das Versprechen von openPreferencesTab erfüllt sich nur bei einem neuen
  // Tab – ist schon einer offen, wechselt Thunderbird nur dorthin)
  w.openPreferencesTab?.("paneGeneral");
  const prefsWindow = () => {
    const tab = w.document.getElementById("tabmail")?.currentTabInfo;
    return tab?.mode?.name == "preferencesTab" ? tab.browser?.contentWindow : null;
  };
  let pw = null;
  for (let i = 0; i < 80 && !(pw = prefsWindow())?.document?.getElementById("mcCat-" + HALO_PANE); i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  pw?.gotoPref?.(HALO_PANE);
}

// Thunderbird-Seite (Kontoeinstellungen, Add-ons) über der Inhaltsfläche des
// Einstellungs-Tabs: eigener Browser wie in ihrem eigenen Tab
function embedPage(host, src) {
  const cdoc = host.ownerDocument;
  host.classList.add("mc-embed-host");
  const browserEl = cdoc.createXULElement("browser");
  browserEl.className = "mc-embed-page";
  browserEl.setAttribute("type", "content");
  browserEl.setAttribute("disableglobalhistory", "true");
  browserEl.setAttribute("src", src);
  browserEl.hidden = true;
  if (src == "about:addons") {
    // ohne frühere Wahl die Liste der Erweiterungen statt der Empfehlungen (lädt aus dem Netz)
    const onLoad = () => {
      const aw = browserEl.contentWindow;
      if (!aw?.promiseInitialized) {
        return; // erst das leere Startdokument
      }
      browserEl.removeEventListener("load", onLoad, true);
      aw.promiseInitialized.then(() => {
        // (Thunderbird merkt sich die Empfehlungen selbst als zuletzt gewählt)
        if (aw.gViewController?.currentViewId?.startsWith("addons://discover")) {
          aw.gViewController.loadView("addons://list/extension");
        }
      });
    };
    browserEl.addEventListener("load", onLoad, true);
  }
  // Merkmal fürs CSS: eingebettet (Links zurück zu den Einstellungen ausblenden)
  browserEl.addEventListener("DOMContentLoaded", () => {
    browserEl.contentDocument?.documentElement?.setAttribute("mc-embedded", "");
  }, true);
  host.append(browserEl);
  return browserEl;
}

// Unterpunkte der eingebetteten Seite (Konten mit ihren Seiten bzw.
// Extensions, Themes …) eingerückt unter ihrer Kategorie in der Seitenleiste
// der Einstellungen – wie die übrigen Kategorien ohne zweite Leiste dazwischen.
// Die Leiste der Seite selbst bleibt im Dokument (blendet nur das CSS aus),
// gewählt wird weiter über sie.
const ADDON_VIEWS = { discover: "addons://discover/", "available-updates": "addons://updates/available", "recent-updates": "addons://updates/recent" };
const SUBNAV = {
  "about:addons": d => {
    const box = d.querySelector("categories-box");
    if (!box) {
      return null;
    }
    const aw = d.defaultView;
    // Thunderbird 140+: moz-page-nav-button[view], 128: button.category[viewid]
    const entries = [...box.querySelectorAll("moz-page-nav-button[view], .category[viewid]")].filter(b => !b.hidden).map(b => {
      const view = b.getAttribute("viewid") || ADDON_VIEWS[b.getAttribute("view")] || `addons://list/${b.getAttribute("view")}`;
      return {
        label: (b.querySelector(".category-name, span[data-l10n-id]") || b).textContent.trim(),
        current: !!(b.selected || b.hasAttribute("selected")),
        level: 1,
        go: () => aw.gViewController?.loadView(view),
      };
    });
    return { watch: box, entries };
  },
  "about:accountsettings": d => {
    const tree = d.getElementById("accounttree");
    if (!tree?.children.length) {
      return null;
    }
    const sel = tree.selectedRow || tree.querySelector("li.selected");
    const pick = li => {
      const top = li.parentNode.closest("li");
      if (top?.classList.contains("collapsed")) {
        tree.expandRow(top);
      }
      const i = tree.rows.indexOf(li);
      if (i >= 0) {
        tree.selectedIndex = i;
      }
    };
    const name = li => li.querySelector(":scope > .container .name")?.textContent.trim() || li.title || "";
    const entries = [];
    for (const li of tree.querySelectorAll(":scope > li")) {
      entries.push({ label: name(li), current: li == sel, level: 1, go: () => pick(li) });
      // Seiten eines Kontos nur beim gewählten Konto (wie aufgeklappt)
      if (sel && li.contains(sel)) {
        for (const kid of li.querySelectorAll(":scope > ul > li")) {
          entries.push({ label: name(kid), current: kid == sel, level: 2, go: () => pick(kid) });
        }
      }
    }
    // „Konto hinzufügen“ (128: „Kontenaktionen“) öffnet Thunderbirds Menü an diesem Eintrag
    const btn = d.getElementById("accountTreeCreateAccount") || d.getElementById("accountActionsButton");
    const popup = d.getElementById("accountAddPopup") || d.getElementById("accountActionsDropdown");
    const label = (btn?.textContent || btn?.getAttribute("label") || "").trim();
    if (popup && label) {
      entries.push({ label: label + "…", level: 1, action: true, go: el => {
        const cw = el.ownerDocument.defaultView, r = el.getBoundingClientRect();
        // Menüs gehen in Inhalts-Browsern nur mit Fokus auf
        d.defaultView.browsingContext.embedderElement?.focus();
        popup.openPopupAtScreen(Math.round(cw.mozInnerScreenX + r.left), Math.round(cw.mozInnerScreenY + r.bottom), false);
      } });
    }
    return { watch: tree, entries };
  },
};
function attachSubnav(list, browserEl, src) {
  const read = SUBNAV[src];
  const cdoc = list.ownerDocument;
  let observed = null, timer = 0;
  const mo = new cdoc.defaultView.MutationObserver(() => schedule());
  const render = () => {
    timer = 0;
    const d = browserEl.contentDocument;
    const nav = d && read(d);
    if (nav && nav.watch != observed) {
      mo.disconnect();
      // Inhalt, Übersetzung, Auswahl (Klasse/hidden) und neu aufgebaute Konten
      mo.observe(nav.watch, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class", "hidden", "selected"] });
      observed = nav.watch;
    }
    const rows = (nav?.entries || []).filter(e => e.label).map(e => {
      const row = cdoc.createElementNS("http://www.w3.org/1999/xhtml", "div");
      row.className = "mc-subcat" + (e.action ? " mc-subcat-action" : "");
      row.setAttribute("level", e.level);
      row.setAttribute("role", "button");
      row.tabIndex = 0;
      row.toggleAttribute("current", !!e.current);
      row.title = e.label;
      row.textContent = e.label;
      row.addEventListener("click", () => e.go(row));
      row.addEventListener("keydown", ev => {
        if (ev.key == "Enter" || ev.key == " ") {
          ev.preventDefault();
          e.go(row);
        }
      });
      return row;
    });
    list.replaceChildren(...rows);
    list.previousElementSibling?.classList.toggle("mc-has-current", rows.some(r => r.hasAttribute("current")));
  };
  const schedule = () => {
    timer ||= cdoc.defaultView.setTimeout(render, 30);
  };
  // Thunderbird 140+ setzt die Auswahl der Add-ons nur als Eigenschaft
  const onView = () => schedule();
  browserEl.addEventListener("load", schedule, true);
  browserEl.addEventListener("view-selected", onView, true);
  browserEl.addEventListener("select", onView, true);
  schedule();
  return () => {
    mo.disconnect();
    browserEl.removeEventListener("load", schedule, true);
    browserEl.removeEventListener("view-selected", onView, true);
    browserEl.removeEventListener("select", onView, true);
  };
}

// halo.spaces-Einstellungen (options_ui): Erweiterungsseiten laufen in einem
// eigenen Prozess – eingebettet wie in Thunderbirds Add-ons-Verwaltung
// (toolkit inline-options-browser.mjs)
// Einstellungen → Allgemein: Link zu den offiziellen Tastaturkürzeln von
// Thunderbird (Mozilla-Hilfe in der Sprache von Thunderbird), eigene Karte
// unter „Scrolling“; öffnet im Standardbrowser
function shortcutsURL() {
  const loc = Services.locale.appLocaleAsBCP47;
  const lang = loc == "en" || loc.startsWith("en-") ? "en-US" : loc;
  return `https://support.mozilla.org/${lang}/kb/keyboard-shortcuts-thunderbird`;
}
function hookShortcutsLink(cw, restorers = null) {
  const doc = cw.document;
  if (doc.getElementById("mcShortcuts")) {
    return;
  }
  const next = doc.getElementById("languageAndFontsCategory");
  if (!next || next.parentNode?.id != "paneDeck") {
    return;
  }
  const X = "http://www.w3.org/1999/xhtml";
  const card = doc.createElementNS(X, "div");
  card.id = "mcShortcuts";
  card.setAttribute("data-category", "paneGeneral");
  // wie Thunderbirds Karten: nur sichtbar, wenn „Allgemein“ gewählt ist
  card.hidden = next.hidden;
  const set = doc.createElementNS(X, "fieldset");
  const legend = doc.createElementNS(X, "legend");
  legend.textContent = tr("Keyboard Shortcuts");
  const line = doc.createElementNS(X, "div");
  line.className = "mc-shortcuts-line";
  const link = doc.createElementNS(X, "a");
  link.className = "text-link";
  link.href = shortcutsURL();
  link.textContent = tr("Show all keyboard shortcuts of Thunderbird");
  link.addEventListener("click", event => {
    event.preventDefault();
    Cc["@mozilla.org/uriloader/external-protocol-service;1"].getService(Ci.nsIExternalProtocolService)
      .loadURI(Services.io.newURI(link.href));
  });
  line.append(link);
  set.append(legend, line);
  card.append(set);
  next.before(card);
  restorers?.push(() => card.remove());
}

// Optionen der halo.spaces-Seite (dieselbe Liste wie options.js), übersetzt
function haloSections() {
  try {
    const scope = {};
    Services.scriptloader.loadSubScript("resource://mailcards/options/sections.js", scope);
    return scope.SECTIONS(english => tr(english));
  } catch (e) {
    log("halo sections error", String(e).slice(0, 120));
    return [];
  }
}

function loadOptionsPane(cw, box) {
  const doc = cw.document;
  if (box.firstChild) {
    return;
  }
  const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
  const { E10SUtils } = ChromeUtils.importESModule("resource://gre/modules/E10SUtils.sys.mjs");
  // ?in=prefs: Seite gestaltet sich wie die übrigen Kategorien der Einstellungen;
  // #s-<key>: aus der Suche gewählte Option zeigen
  const url = extensionBaseURL + "options/options.html?in=prefs" + (box.__mcFocus ? `#s-${box.__mcFocus}` : "");
  const browserEl = doc.createXULElement("browser");
  browserEl.className = "mc-embed-frame";
  for (const [k, v] of [["type", "content"], ["disableglobalhistory", "true"], ["messagemanagergroup", "webext-browsers"],
    ["transparent", "true"], ["forcemessagemanager", "true"]]) {
    browserEl.setAttribute(k, v);
  }
  const policy = ExtensionParent.WebExtensionPolicy.getByID("mail-cards@sebastian.local");
  if (policy) {
    browserEl.setAttribute("initialBrowsingContextGroupId", policy.browsingContextGroupId);
  }
  const remoteType = ChromeUtils.predictRemoteTypeForURI(url, { window: cw, preferredRemoteType: E10SUtils.EXTENSION_REMOTE_TYPE });
  const remote = remoteType !== E10SUtils.NOT_REMOTE;
  if (remote) {
    browserEl.setAttribute("remote", "true");
    browserEl.setAttribute("remoteType", remoteType);
  }
  const ready = new Promise(resolve => browserEl.addEventListener(remote ? "XULFrameLoaderCreated" : "load", resolve, { once: true, capture: !remote }));
  box.append(browserEl);
  browserEl.clientTop; // Bindungen sofort anwenden
  ready.then(() => {
    const mm = browserEl.messageManager;
    if (!mm) {
      return; // inzwischen entfernt
    }
    ExtensionParent.apiManager.emit("extension-browser-inserted", browserEl);
    mm.loadFrameScript("chrome://extensions/content/ext-browser-content.js", false, true);
    mm.sendAsyncMessage("Extension:InitBrowser", { fixedWidth: false, isInline: true });
    browserEl.fixupAndLoadURIString(url, { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });
  }).catch(e => log("halo pane error", e));
}

// Schrift auf der Kontofarbe: weiß auf dunklen, dunkel auf hellen Farben
function textOnColor(color) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(color).trim());
  if (!m) {
    return "#fff";
  }
  const lin = c => (c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const n = parseInt(m[1], 16);
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return L > 0.45 ? "rgba(0, 0, 0, 0.85)" : "#fff";
}

// Absender dieser Domains bekommen Initialen statt eines Firmenlogos.
const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "icloud.com", "me.com", "mac.com",
  "outlook.com", "outlook.de", "outlook.at", "hotmail.com", "hotmail.de",
  "live.com", "live.at", "msn.com", "yahoo.com", "yahoo.de", "ymail.com",
  "gmx.at", "gmx.de", "gmx.net", "gmx.ch", "web.de", "aon.at", "chello.at",
  "a1.net", "kabsi.at", "t-online.de", "freenet.de", "mail.com",
  "proton.me", "protonmail.com", "pm.me", "posteo.de", "mailbox.org",
  "aol.com", "zoho.com", "fastmail.com", "hey.com",
]);

// Zweistufige Endungen, bei denen die „Firmendomain“ drei Teile hat.
const SECOND_LEVEL = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "co.at", "or.at", "ac.at", "gv.at",
  "com.au", "net.au", "org.au", "co.nz", "co.jp", "ne.jp", "com.br",
  "com.tr", "co.za", "com.mx", "com.cn", "com.hk", "co.in", "co.il",
]);

const CSS = `
/* weitere Kopie derselben Mail (isDuplicateRow) */
#threadTree tr[is="thread-card"][data-mc-dup] {
  display: none !important;
}
#threadTree tr[is="thread-card"] .card-container {
  grid-template-columns: 16px 46px minmax(0, 1fr) !important;
  /* Inhalt senkrecht mittig: Thunderbird stapelt ihn sonst oben, und der
     Rest der festen Zeilenhöhe landet unten (bei kompakter Dichte deutlich) */
  align-content: center !important;
}
/* Gruppenköpfe („Heute“, „Gestern“ … bei „Gruppiert nach Sortierung“): nur
   eine Spalte wie bei Thunderbird – sonst landet der Text in der 46-px-Spalte
   des Absenderbilds und wird abgeschnitten („Yesterd“). Unten an der Zeile,
   direkt über der ersten Mail der Gruppe, wie ein Abschnittstitel. */
#threadTree tr[is="thread-card"]:is(.dummy, [data-properties~="dummy"]) .card-container {
  grid-template-columns: minmax(0, 1fr) !important;
  align-content: end !important;
}
/* ohne Thunderbirds Innenabstand (nur bei normaler Dichte): das Mitteln
   übernimmt align-content, und das Bild sitzt bei jeder Dichte gleich zum Absender */
#threadTree tr[is="thread-card"] .card-container > .thread-card-column:not(.read-status-column) {
  align-self: start !important;
  padding-block: 0 !important;
}
/* optisch gleiche Abstände oben/unten wie bei Apple: oben zählt das Auge ab
   der Oberkante der Großbuchstaben, unten bis zur Grundlinie der Vorschau –
   der Inhalt sitzt daher 1 px höher als rechnerisch mittig */
#threadTree tr[is="thread-card"] .card-container > :is(.thread-card-column, .mc-avatar) {
  position: relative;
  top: -1px;
}
#threadTree tr[is="thread-card"] .mc-avatar {
  width: 36px;
  height: 36px;
  margin-top: 3px;
  align-self: start;
  border-radius: 50%;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  /* wie Apple Mail: Verlauf Blaugrau → Lavendel, Initialen ~54 % des Kreises */
  background: linear-gradient(180deg, #B4CAE4, #8A97C5);
  color: #fff;
  font: 600 19px -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  letter-spacing: 0;
  user-select: none;
  pointer-events: none;
}
#threadTree tr[is="thread-card"] .mc-avatar.mc-has-img {
  background: #fff;
  box-shadow: inset 0 0 0 0.5px rgba(0, 0, 0, 0.12);
}
#threadTree tr[is="thread-card"] .mc-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
#threadTree tr[is="thread-card"] .mc-avatar.mc-small img {
  width: 62%;
  height: 62%;
  object-fit: contain;
}
/* Suchtreffer gelb hinterlegt wie in Apple Mail (markHits) */
#threadTree tr[is="thread-card"] mark.mc-hit {
  background: rgba(255, 214, 10, 0.45);
  color: inherit;
  border-radius: 3px;
  padding: 0 1px;
  margin: 0 -1px;
}
@media (prefers-color-scheme: dark) {
  #threadTree tr[is="thread-card"] mark.mc-hit {
    background: rgba(255, 214, 10, 0.35);
  }
}
#threadTree tr[is="thread-card"].selected mark.mc-hit {
  background: rgba(255, 255, 255, 0.3);
}
#threadTree tr[is="thread-card"] .mc-preview {
  font-size: 12px;
  font-weight: 400 !important;
  line-height: 16px;
  margin-top: 1px;
  /* 3 px wie der Innenabstand des Absenders: bündig mit Absender und Betreff */
  padding-inline-start: 3px;
  color: color-mix(in srgb, currentColor 58%, transparent);
  white-space: normal;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  word-break: break-word;
}
/* Ordnerliste wie Apple Mail (Attribute setzt decorateFolders) */
#folderTree li[data-mc-hide] {
  display: none !important;
}
#folderTree li[data-mc-flatten],
#folderTree li[data-mc-flatten] > ul {
  display: contents !important;
}
#folderTree li[data-mc-flatten] > .container {
  display: none !important;
}
#folderTree li[data-mode="all"] li[data-server-type] > ul {
  display: flex !important;
  flex-direction: column !important;
}
#folderTree > li[data-mode="all"] > .mode-container {
  display: none !important;
}
/* „On My Mac“ (lokale Ordner) wie bei Apple vor den Konten */
#folderTree > li[data-mode="all"] > ul {
  display: flex !important;
  flex-direction: column !important;
}
#folderTree > li[data-mode="all"] > ul > li[data-server-type="none"] {
  order: -1 !important;
}
#folderTree > li[data-mode="all"] > ul > li[data-server-type="none"] > .container .twisty {
  visibility: hidden !important;
}
/* „On My Mac“ ist wie bei Apple nur eine Überschrift (nicht anklickbar) */
#folderTree > li[data-mode="all"] > ul > li[data-server-type="none"] > .container {
  pointer-events: none !important;
  background: transparent !important;
}
#folderTree > li[data-mode] {
  border: none !important;
}
/* Gruppenköpfe ohne Absenderbild und Vorschau (auch ohne deren Platz) */
#threadTree tr[is="thread-card"]:is(.dummy, [data-properties~="dummy"]) :is(.mc-avatar, .mc-preview) {
  display: none !important;
}
`;

// ---------------------------------------------------------------------------
// Protokoll (mail-cards-debug.log im Profilordner, max. ~200 KB)
// ---------------------------------------------------------------------------

const LOG_PATH = PathUtils.join(PathUtils.profileDir, "mail-cards-debug.log");
let logChain = Promise.resolve();
let logged = 0;
// Ausführliche Einträge (z. B. Absenderadressen beim Bild-Auflösen) nur mit
// extensions.mailcards.debug = true – Fehler werden immer protokolliert
function debugLog(...parts) {
  if (Services.prefs.getBoolPref("extensions.mailcards.debug", false)) {
    log(...parts);
  }
}

function log(...parts) {
  if (++logged > 2000) {
    return;
  }
  const line =
    new Date().toISOString() +
    " " +
    parts
      // Fehler aus anderen Bereichen sind kein „instanceof Error“ – an message erkennen
      .map(p => (p && typeof p == "object" && typeof p.message == "string"
        ? `${p.name || "Error"}: ${p.message}${p.stack ? ` @ ${String(p.stack).split("\n")[0]}` : ""}`
        : typeof p == "string" ? p : JSON.stringify(p)))
      .join(" ") +
    "\n";
  logChain = logChain
    .then(async () => {
      try {
        const info = await IOUtils.stat(LOG_PATH);
        if (info.size > 200 * 1024) {
          await IOUtils.remove(LOG_PATH);
        }
      } catch {}
      await IOUtils.writeUTF8(LOG_PATH, line, { mode: "appendOrCreate" });
    })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function orgDomain(domain) {
  // Thunderbirds Liste der Domain-Endungen (co.uk, com.pl, co.kr …)
  try {
    return Services.eTLD.getBaseDomainFromHost(domain.toLowerCase().replace(/\.$/, ""));
  } catch {}
  const parts = domain.toLowerCase().replace(/\.$/, "").split(".");
  if (parts.length <= 2) {
    return parts.join(".");
  }
  const lastTwo = parts.slice(-2).join(".");
  return SECOND_LEVEL.has(lastTwo)
    ? parts.slice(-3).join(".")
    : lastTwo;
}

// Datum in der Mailliste immer mit Uhrzeit: „Heute, 14:32“, „Gestern, 14:32“,
// davor das ganze Datum (17.10.2026, 14:32) – kein Wochentag.
// Formatiert wie der Mailkopf: Thunderbirds eigener Formatierer ohne Sprache
// nimmt die Regionaleinstellungen des Systems (auch 12/24 Stunden) – sonst
// stand in der Liste „12:49 AM“ neben „00:49“ im Kopf
function appleListDate(ms, now = new Date()) {
  const fmt = opts => new Services.intl.DateTimeFormat(undefined, opts);
  const d = new Date(ms);
  const startOfDay = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  // immer mit Uhrzeit: „Heute, 14:32“, „Gestern, 14:32“, sonst „17.10.2026,
  // 14:32“ – Datum in der Zukunft (falsche Uhr beim Absender, Spam „oben
  // halten“) zeigt das ganze Datum
  const time = fmt({ timeStyle: "short" }).format(d);
  if (days == 0) {
    return tr("Today, {time}", { time });
  }
  if (days == 1) {
    return tr("Yesterday, {time}", { time });
  }
  // „mittel“ ist das ganze Datum im Muster des Systems (17.10.2026)
  return fmt({ dateStyle: "medium", timeStyle: "short" }).format(d);
}

// Absender ohne eigenen Namen (nur die Adresse, oft auch als Name
// wiederholt): wie Apple Mail der Firmenname aus der Domain
// („rueckgabe@amazon.de“ → „Amazon“). Bei Freemail-Adressen bleibt die Adresse.
function senderLabel(name, email) {
  name = (name || "").trim();
  if (name && !/^[^\s@]+@[^\s@]+$/.test(name)) {
    return name;
  }
  email ||= name.toLowerCase();
  const domain = email.split("@")[1] || "";
  const org = domain ? orgDomain(domain) : "";
  if (!org || FREEMAIL.has(org)) {
    return email;
  }
  const label = org.split(".")[0];
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Wer in der Karte steht: der Absender – in Gesendet, Entwürfen, Vorlagen und
// Postausgang wie bei Thunderbird die Empfänger (ohne Empfänger der Absender)
function personsFor(hdr, outgoing = false) {
  const parse = header => {
    try {
      return MailServices.headerParser.parseDecodedHeader(header || "")
        .filter(p => p?.email || p?.name)
        .map(p => ({ name: p.name || "", email: (p.email || "").toLowerCase() }));
    } catch {
      return [];
    }
  };
  const list = outgoing ? parse(hdr.mime2DecodedRecipients || hdr.recipients) : [];
  return list.length ? list : parse(hdr.mime2DecodedAuthor || hdr.author);
}

function initialsFor(name, email) {
  let source = (name || "").replace(/["'<>()[\]]/g, "").trim();
  if (!source || source.includes("@")) {
    source = (email || "").split("@")[0].replace(/[._\-+0-9]+/g, " ").trim();
  }
  const words = source.split(/\s+/).filter(w => /\p{L}/u.test(w));
  if (!words.length) {
    return "?";
  }
  const first = [...words[0]][0] || "";
  const second = words.length > 1 ? [...words[words.length - 1]][0] : "";
  return (first + second).toUpperCase();
}

// Vorschautext wie in Apple Mail: Fließtext ohne Zitate, Links und
// unsichtbare Füllzeichen (Newsletter verstecken damit ihren „Preheader“).
// Manche Absender (z. B. Amazon) schicken im Text-Teil in Wahrheit HTML –
// dann stünde Code in der Vorschau. Tags, Stile und Skripte entfernen.
// Benannte Zeichen (&zwnj;, &hellip; …) stehen oft auch in reinen Text-Teilen.
const ENTITIES = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", shy: "",
  zwnj: "", zwj: "", lrm: "", rlm: "", ensp: " ", emsp: " ", thinsp: " ",
  hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", sbquo: "‚",
  ldquo: "“", rdquo: "”", bdquo: "„", laquo: "«", raquo: "»", bull: "•",
  middot: "·", copy: "©", reg: "®", trade: "™", euro: "€", deg: "°",
  auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß",
};

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] == "#") {
      const n = e[1].toLowerCase() == "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n <= 0x10ffff ? String.fromCodePoint(n) : " ";
    }
    return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? all;
  });
}

function stripHtml(text) {
  if (!/<(?:!doctype|html|head|body|div|table|p|span|br|style|meta|td)\b/i.test(text)) {
    return decodeEntities(text);
  }
  return decodeEntities(text
    .replace(/<(style|script|head|title)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(style|script|head)\b[\s\S]*$/i, " ") // angeschnitten (Vorschau gekürzt)
    .replace(/<!--[\s\S]*?(-->|$)/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/<[^>]*$/, " ")); // angeschnittenes Tag am Ende
}

function cleanPreview(text) {
  return stripHtml(text || "")
    .replace(/[\u034f\u00ad\u200b-\u200f\u2060\ufeff]/g, "")
    .split(/\r?\n/)
    .filter(line => !/^\s*>/.test(line))
    .join(" ")
    .replace(/<https?:[^>]*>/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\[(?:image|cid):[^\]]*\]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

// ---------------------------------------------------------------------------
// Suche wie Apple Mail: das Suchfeld oben durchsucht in der Mail alle
// Postfächer (außer Papierkorb und Spam) über einen versteckten Suchordner;
// Treffer stehen in der Kartenliste, gelb markiert, oben mit Anzahl.
// ---------------------------------------------------------------------------
const SEARCH_FOLDER_NAME = "halo.spaces search";
// Thunderbirds Index (Gloda): so lange wird vor der Suche auf seine Treffer
// gewartet (sonst ohne ihn), höchstens so viele Treffer (neueste zuerst);
// kürzere Begriffe fragen ihn nicht (riesige Präfix-Abfragen, die sich beim
// Tippen im Gloda-Thread stauen und nicht abbrechen lassen)
const GLODA_WAIT_MS = 400;
const GLODA_LIMIT = 3000;
const GLODA_MIN_CHARS = 3;

// Datum im Suchbegriff („12.10“, „12.10.“, „12.10.26“, „12.10.2026“) – ohne
// Jahr das letzte vergangene Vorkommen
function searchDate(text) {
  const m = /^\s*(\d{1,2})\.(\d{1,2})\.?(\d{2}|\d{4})?\s*$/.exec(text || "");
  if (!m) {
    return null;
  }
  const day = Number(m[1]);
  const month = Number(m[2]);
  const now = new Date();
  if (m[3]) {
    const year = m[3].length == 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const date = new Date(year, month - 1, day);
    return date.getMonth() == month - 1 && date.getDate() == day ? date : null;
  }
  // ohne Jahr: letztes vergangenes Vorkommen, auch für den 29.2. (8 Jahre
  // reichen auch über Jahrhundertjahre ohne Schalttag; „31.4“ gibt es nie)
  for (let year = now.getFullYear(), i = 0; i < 8; i++, year--) {
    const date = new Date(year, month - 1, day);
    if (date.getMonth() == month - 1 && date.getDate() == day && date <= now) {
      return date;
    }
  }
  return null;
}

// Suchbegriff in einem Element gelb hinterlegen (nur Text, per DOM)
function markHits(el, term) {
  if (!el) {
    return;
  }
  for (const old of el.querySelectorAll("mark.mc-hit")) {
    old.replaceWith(old.textContent);
  }
  el.normalize();
  const needle = (term || "").trim().toLowerCase();
  if (needle.length < 2) {
    return;
  }
  const doc = el.ownerDocument;
  const walker = doc.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  const nodes = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }
  for (const node of nodes) {
    const text = node.nodeValue;
    const lower = text.toLowerCase();
    let at = lower.indexOf(needle);
    if (at < 0) {
      continue;
    }
    const frag = doc.createDocumentFragment();
    let from = 0;
    while (at >= 0) {
      frag.append(text.slice(from, at));
      const mark = doc.createElementNS("http://www.w3.org/1999/xhtml", "mark");
      mark.className = "mc-hit";
      mark.textContent = text.slice(at, at + needle.length);
      frag.append(mark);
      from = at + needle.length;
      at = lower.indexOf(needle, from);
    }
    frag.append(text.slice(from));
    node.replaceWith(frag);
  }
}

function bytesToBase64(win, bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return win.btoa(binary);
}

// Einen Kopfeintrag der Nachricht lesen, den Thunderbird nicht in der
// Datenbank hält (z. B. List-Unsubscribe-Post); "" wenn nicht vorhanden
function readHeader(hdr, name) {
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(""), 5000);
    try {
      MsgHdrToMimeMessage(hdr, null, (msgHdr, mime) => {
        clearTimeout(timer);
        resolve(String(mime?.headers?.[name.toLowerCase()]?.[0] || ""));
      }, true, { partsOnDemand: true, examineEncryptedParts: false });
    } catch {
      clearTimeout(timer);
      resolve("");
    }
  });
}

// Nur öffentliche https-Adressen – Absender bestimmen die Adresse (BIMI,
// Kontaktfotos), damit darf kein Zugriff auf lokale Geräte oder Firmennetze
// ausgelöst werden
function isPublicHttps(url) {
  try {
    // nsIURI statt URL: URL gibt es im Experiment-Kontext nicht (new URL
    // warf, damit galt jede Adresse als gesperrt und es kamen keine Logos)
    const u = Services.io.newURI(url);
    if (u.scheme != "https") {
      return false;
    }
    const host = u.host.toLowerCase();
    return !(host == "localhost" || host.endsWith(".local") || host.endsWith(".localhost") ||
      /\.(invalid|example|test|onion)$/.test(host) || host.endsWith(".example.com") ||
      host.endsWith(".internal") || host.endsWith(".lan") || host.endsWith(".home") ||
      /^[\d.]+$/.test(host) || host.includes(":") || !host.includes("."));
  } catch {
    return false;
  }
}

// Zeitüberschreitungen zählen: dann kein „kein Logo“ merken (nur langsames Netz)
let fetchTimeouts = 0;

// Abruf über einen eigenen Kanal statt fetch: fetch folgt Umleitungen, bevor
// sich ihr Ziel prüfen lässt – der Absender könnte so auf Geräte im lokalen
// Netz umleiten. Hier wird jedes Umleitungsziel vor dem Verbinden geprüft.
// Zeitlimit und Größengrenze (max Bytes) gelten für die ganze Antwort, danach
// wird abgebrochen; mit truncate liefert eine längere Antwort nur ihren Anfang.
// Ergebnis wie bei fetch: ok, status, url, headers.get(), text(), arrayBuffer()
function fetchWithTimeout(win, url, { method = "GET", headers = {}, body = null, max = 2 * 1024 * 1024, truncate = false, followRedirects = true } = {}) {
  return new Promise((resolve, reject) => {
    if (!isPublicHttps(url)) {
      reject(new Error("blocked url"));
      return;
    }
    const channel = NetUtil.newChannel({ uri: url, loadUsingSystemPrincipal: true })
      .QueryInterface(Ci.nsIHttpChannel);
    // ohne Cookies und Anmeldedaten (wie credentials: "omit")
    channel.loadFlags |= Ci.nsIRequest.LOAD_ANONYMOUS;
    if (body != null) {
      const stream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(Ci.nsIStringInputStream);
      // setUTF8Data statt setByteStringData: das gibt es in Thunderbird 128 ESR
      // noch nicht, dort scheiterte sonst jeder POST (Ein-Klick-Abmeldung); der
      // Body ist reines ASCII („List-Unsubscribe=One-Click“)
      stream.setUTF8Data(body);
      channel.QueryInterface(Ci.nsIUploadChannel2).explicitSetUploadStream(stream, null, -1, method, false);
    } else {
      channel.requestMethod = method;
    }
    for (const [name, value] of Object.entries(headers)) {
      channel.setRequestHeader(name, value, false);
    }
    let current = channel;
    let settled = false;
    const parts = [];
    let size = 0;
    // redirected: Antwort 3xx, der nicht gefolgt wurde – gilt als Erfolg
    const finish = (request, redirected = false) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const bytes = new Uint8Array(size);
      let at = 0;
      for (const part of parts) {
        bytes.set(part, at);
        at += part.length;
      }
      try {
        const http = request.QueryInterface(Ci.nsIHttpChannel);
        resolve({
          ok: http.requestSucceeded || (redirected && http.responseStatus >= 300 && http.responseStatus < 400),
          status: http.responseStatus,
          url: http.URI.spec,
          headers: {
            get(name) {
              try {
                return http.getResponseHeader(name);
              } catch {
                return null;
              }
            },
          },
          arrayBuffer: async () => bytes.buffer,
          text: async () => new win.TextDecoder().decode(bytes),
        });
      } catch (e) {
        reject(e);
      }
    };
    const fail = error => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
      try {
        current.cancel(Cr.NS_BINDING_ABORTED);
      } catch {}
    };
    const timer = setTimeout(() => {
      fetchTimeouts++;
      fail(new Error("timeout"));
    }, FETCH_TIMEOUT);
    channel.notificationCallbacks = {
      QueryInterface: ChromeUtils.generateQI(["nsIInterfaceRequestor", "nsIChannelEventSink"]),
      getInterface(iid) {
        return this.QueryInterface(iid);
      },
      asyncOnChannelRedirect(oldChannel, newChannel, flags, callback) {
        // ohne Weiterleiten (Ein-Klick-Abmeldung): der Server hat die Anfrage
        // schon erhalten – die 3xx-Antwort ist das Ergebnis, die Bestätigungsseite
        // (oft http oder intern) wird nicht mehr geladen
        if (!followRedirects) {
          callback.onRedirectVerifyCallback(Cr.NS_ERROR_ABORT);
          finish(oldChannel, true);
          fail(new Error("redirect not followed"));
          return;
        }
        // das Ziel muss ebenfalls öffentlich sein – sonst gar nicht erst verbinden
        if (!isPublicHttps(newChannel.URI.spec)) {
          callback.onRedirectVerifyCallback(Cr.NS_ERROR_ABORT);
          fail(new Error("blocked redirect"));
          return;
        }
        current = newChannel;
        callback.onRedirectVerifyCallback(Cr.NS_OK);
      },
    };
    try {
      channel.asyncOpen({
        QueryInterface: ChromeUtils.generateQI(["nsIStreamListener", "nsIRequestObserver"]),
        onStartRequest(request) {
          current = request;
        },
        onDataAvailable(request, stream, offset, count) {
          const input = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
          input.setInputStream(stream);
          const chunk = new Uint8Array(count);
          input.readArrayBuffer(count, chunk.buffer);
          if (size + count > max) {
            if (!truncate) {
              fail(new Error("too large"));
              return;
            }
            parts.push(chunk.subarray(0, max - size));
            size = max;
            finish(request);
            request.cancel(Cr.NS_BINDING_ABORTED);
            return;
          }
          parts.push(chunk);
          size += count;
        },
        onStopRequest(request, status) {
          if (request != current) {
            return; // alter Kanal nach einer Umleitung
          }
          if (Components.isSuccessCode(status)) {
            finish(request);
          } else {
            fail(new Error(`network error 0x${(status >>> 0).toString(16)}`));
          }
        },
      });
    } catch (e) {
      fail(e);
    }
  });
}

// Zeitkurve wie CSS cubic-bezier(x1, y1, x2, y2)
// Ordnernamen wie in Apple Mail (Ordnerliste und Titel über der Mailliste)
function appleLabels() {
  const lang = Services.locale.appLocaleAsBCP47;
  // andere Sprachen: Thunderbirds eigene, übersetzte Namen behalten
  if (!lang.startsWith("de") && !lang.startsWith("en")) {
    return { native: true };
  }
  return lang.startsWith("de")
    ? { favourites: "Favoriten", allInboxes: "Alle Eingänge", allSent: "Alle gesendeten", onMyMac: "Auf meinem Mac",
        Inbox: "Posteingang", Drafts: "Entwürfe", SentMail: "Gesendet", Junk: "Werbung", Trash: "Papierkorb", Archive: "Archiv", Templates: "Vorlagen" }
    : { favourites: "Favourites", allInboxes: "All Inboxes", allSent: "All Sent", onMyMac: "On My Mac",
        Inbox: "Inbox", Drafts: "Drafts", SentMail: "Sent", Junk: "Junk", Trash: "Bin", Archive: "Archive", Templates: "Templates" };
}
// Posteingang immer zuerst (order 0), Gmails „Wichtig“ direkt danach (1)
// Breite der Mailliste wie in Apple Mail fest; die Nachricht nimmt den Rest
// (Thunderbird hält sonst die Nachricht fest und lässt die Liste auf großen
// Bildschirmen auf über 2000 px wachsen)
const LIST_WIDTH_PREF = "extensions.mailcards.listWidth";
const LIST_WIDTH_DEFAULT = 460;
const FOLDER_ORDER = { Inbox: 0, Drafts: 2, SentMail: 3, Junk: 4, Trash: 5, Archive: 6, Templates: 7 };
function folderRole(folder) {
  return Object.keys(FOLDER_ORDER).find(k => folder?.getFlag(Ci.nsMsgFolderFlags[k]));
}

// Titel über der Mailliste wie Apple: „All Inboxes“ bzw. „Inbox – Google“
// Ordnername wie in der Ordnerliste (ohne Konto) – z. B. „Sent“ im Platzhalter der Suche
function appleFolderName(folder) {
  const L = appleLabels();
  const role = folderRole(folder);
  // frisch angelegte Ordner haben noch keinen prettyName (null) – dann name
  const plain = folder.prettyName || folder.localizedName || folder.name;
  if (/^mailbox:\/\/[^/]*smart%20mailboxes\//i.test(folder.URI)) {
    if (role == "Inbox" && !L.native) return L.allInboxes;
    if (role == "SentMail" && !L.native) return L.allSent;
    return plain;
  }
  return role && !L.native ? L[role] : plain;
}

function appleFolderTitle(folder) {
  const L = appleLabels();
  const name = appleFolderName(folder);
  if (/^mailbox:\/\/[^/]*smart%20mailboxes\//i.test(folder.URI)) {
    return name;
  }
  const account = folder.server?.type == "none" && !L.native ? L.onMyMac : folder.server?.prettyName;
  return account ? `${name} – ${account}` : name;
}

function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sampleX = t => ((ax * t + bx) * t + cx) * t;
  const sampleY = t => ((ay * t + by) * t + cy) * t;
  const slopeX = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    if (x <= 0 || x >= 1) {
      return Math.min(1, Math.max(0, x));
    }
    let t = x;
    for (let i = 0; i < 8; i++) {
      const dx = sampleX(t) - x;
      const d = slopeX(t);
      if (Math.abs(dx) < 1e-6 || Math.abs(d) < 1e-6) {
        break;
      }
      t -= dx / d;
    }
    return sampleY(Math.min(1, Math.max(0, t)));
  };
}

// Ziehen an der Trennlinie einer Seitenleiste (links) bzw. der Today-Pane
// (rechts, gespiegelt) – eine Logik für alle Bereiche, wie in Apple Mail:
// unter der Schwelle verschwindet die Leiste sofort, zurückgezogen kommt sie
// im selben Zug wieder (beliebig oft, bis zum Loslassen), alles ohne
// Animation. Aus der ausgeblendeten Lage heraus (Greifzone am Rand) ebenso.
// Die Breite folgt dem Zeiger, wenn pane.setWidth da ist (sonst feste Breite:
// nur ein-/ausblenden).
//   pane.side: "left" | "right"
//   pane.hidden(), pane.setHidden(bool), pane.width()
//   pane.threshold(startHidden, startWidth): Breite, unter der die Leiste aus ist
//   pane.setWidth(px) (optional), pane.done(hidden) (optional, beim Loslassen)
function dragPane(event, pane) {
  if (event.button != 0) {
    return;
  }
  const doc = event.currentTarget.ownerDocument;
  const win = doc.defaultView;
  const root = doc.documentElement;
  const dir = pane.side == "right" ? -1 : 1;
  const startX = event.clientX;
  const startHidden = pane.hidden();
  const startWidth = startHidden ? 0 : pane.width();
  const threshold = pane.threshold(startHidden, startWidth);
  let hidden = startHidden;
  // Zeiger an die Seite binden: Bewegungen kommen weiter an, auch wenn die
  // Trennlinie mit der Leiste verschwindet oder der Zeiger die Seite verlässt
  try {
    root.setPointerCapture(event.pointerId);
  } catch {}
  const cursor = root.style.cursor;
  root.style.cursor = "col-resize";
  const onMove = e => {
    if (!(e.buttons & 1)) {
      end();
      return;
    }
    const size = startWidth + dir * (e.clientX - startX);
    const hide = size < threshold;
    if (hide != hidden) {
      hidden = hide;
      pane.setHidden(hide);
    }
    if (!hide) {
      pane.setWidth?.(size);
    }
  };
  const end = () => {
    win.removeEventListener("pointermove", onMove, true);
    win.removeEventListener("pointerup", end, true);
    root.style.cursor = cursor;
    try {
      root.releasePointerCapture(event.pointerId);
    } catch {}
    pane.done?.(hidden);
  };
  win.addEventListener("pointermove", onMove, true);
  win.addEventListener("pointerup", end, true);
}

// Thunderbirds eigenes Ziehen an einer Trennlinie (XUL-Splitter, Pane-Splitter)
// abschalten – dragPane übernimmt es (beide reagieren auf „mousedown“)
function blockNativeSplitter(event) {
  if (event.button == 0) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

// ---------------------------------------------------------------------------
// Logo-Cache (pro Domain, im Profil gespeichert)
// ---------------------------------------------------------------------------

// Fotos aus der macOS-Kontakte-App. iCloud liefert Kontaktfotos nur als Link,
// der eine iCloud-Web-Anmeldung verlangt – die Kontakte-App hat sie aber lokal.
// Ein Hilfsskript (eigener Prozess, nur lesend) legt stündlich Vorschaubilder
// und eine Zuordnungsliste (E-Mail, Name) im Profilordner „mail-cards-photos“
// ab. An den Kontakten selbst ändert sich nichts.
const MAC_PHOTOS_PREF = "extensions.mailcards.macContactPhotos";
// Updates beim Start suchen und installieren (höchstens alle 6 Stunden)
const AUTO_UPDATE_PREF = "extensions.mailcards.autoUpdate";
const AUTO_UPDATE_LAST_PREF = "extensions.mailcards.autoUpdateLast";
// reine Textmails in der Systemschrift (plaintext.css)
const PLAIN_TEXT_PREF = "extensions.mailcards.plainTextSystemFont";
// aus: keine Anfrage an Absender-Websites (Favicon, BIMI, Startseite)
const SENDER_LOGOS_PREF = "extensions.mailcards.senderLogos";
const MAC_PHOTOS_SCRIPT = `
ObjC.import('Contacts');
ObjC.import('Foundation');
function run(argv) {
  const dir = argv[0];
  const store = $.CNContactStore.alloc.init;
  const keys = $([$.CNContactIdentifierKey, $.CNContactImageDataAvailableKey, $.CNContactThumbnailImageDataKey,
    $.CNContactEmailAddressesKey, $.CNContactGivenNameKey, $.CNContactFamilyNameKey, $.CNContactOrganizationNameKey]);
  const req = $.CNContactFetchRequest.alloc.initWithKeysToFetch(keys);
  const out = [];
  store.enumerateContactsWithFetchRequestErrorUsingBlock(req, null, function (c, stop) {
    if (!c.imageDataAvailable) return;
    const data = c.thumbnailImageData;
    if (!data || Number(data.length) == 0) return;
    const file = ObjC.unwrap(c.identifier).replace(/[^A-Za-z0-9]/g, "_") + ".img";
    data.writeToFileAtomically(dir + "/" + file, true);
    const emails = [];
    for (let i = 0; i < Number(c.emailAddresses.count); i++) {
      emails.push(String(ObjC.unwrap(c.emailAddresses.objectAtIndex(i).value)).toLowerCase());
    }
    out.push({ f: file, e: emails,
      n: (String(ObjC.unwrap(c.givenName) || "") + " " + String(ObjC.unwrap(c.familyName) || "")).trim(),
      o: String(ObjC.unwrap(c.organizationName) || "") });
  });
  $(JSON.stringify(out)).writeToFileAtomicallyEncodingError(dir + "/index.json", true, $.NSUTF8StringEncoding, null);
  return String(out.length);
}`;

const MacPhotos = {
  byEmail: new Map(), // E-Mail → Dateipfad
  byName: new Map(), // Name (klein) → Dateipfad
  version: 0,
  running: false,
  listeners: new Set(),

  folder() {
    const f = Services.dirsvc.get("ProfD", Ci.nsIFile);
    f.append("mail-cards-photos");
    return f.path;
  },

  norm(name) {
    return (name || "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
  },

  async load() {
    if (Services.prefs.prefHasUserValue(MAC_PHOTOS_PREF) && !Services.prefs.getBoolPref(MAC_PHOTOS_PREF)) {
      return; // ausgeschaltet
    }
    try {
      const list = await IOUtils.readJSON(PathUtils.join(this.folder(), "index.json"));
      this.byEmail.clear();
      this.byName.clear();
      for (const entry of list) {
        const path = PathUtils.join(this.folder(), entry.f);
        for (const e of entry.e || []) {
          this.byEmail.set(e, path);
        }
        for (const n of [entry.n, entry.o]) {
          if (n && !this.byName.has(this.norm(n))) {
            this.byName.set(this.norm(n), path);
          }
        }
      }
      this.version++;
      log("mac photos loaded", { photos: list.length, emails: this.byEmail.size });
    } catch {}
  },

  // Dateipfad zum Foto eines Kontakts (über E-Mail-Adressen, sonst Name)
  lookup(emails = [], name = "") {
    for (const e of emails) {
      const hit = e && this.byEmail.get(String(e).toLowerCase());
      if (hit) {
        return hit;
      }
    }
    return this.byName.get(this.norm(name)) || null;
  },

  fileURL(path) {
    return PathUtils.toFileURI(path) + "?v=" + this.version;
  },

  // Liest die macOS-Kontakte (dafür fragt macOS einmal nach Zugriff) – nur,
  // wenn eingeschaltet (extensions.mailcards.macContactPhotos = true) oder
  // schon einmal eingerichtet (Fotoverzeichnis vorhanden)
  async enabled() {
    if (Services.prefs.prefHasUserValue(MAC_PHOTOS_PREF)) {
      return Services.prefs.getBoolPref(MAC_PHOTOS_PREF);
    }
    return IOUtils.exists(PathUtils.join(this.folder(), "index.json")).catch(() => false);
  },

  async sync() {
    if (Services.appinfo.OS != "Darwin" || this.running || !(await this.enabled())) {
      return;
    }
    this.running = true;
    const t0 = Date.now();
    const dir = this.folder();
    const script = PathUtils.join(PathUtils.tempDir, "mail-cards-contact-photos.js");
    try {
      await IOUtils.makeDirectory(dir, { ignoreExisting: true });
      await IOUtils.writeUTF8(script, MAC_PHOTOS_SCRIPT);
      const { Subprocess } = ChromeUtils.importESModule("resource://gre/modules/Subprocess.sys.mjs");
      const proc = await Subprocess.call({ command: "/usr/bin/osascript", arguments: ["-l", "JavaScript", script, dir], stderr: "pipe" });
      const killer = setTimeout(() => proc.kill(), 120000);
      const [out, err] = await Promise.all([proc.stdout.readString(), proc.stderr.readString()]);
      const { exitCode } = await proc.wait();
      clearTimeout(killer);
      log("mac photos sync", { ms: Date.now() - t0, exitCode, photos: out.trim(), err: err.trim().slice(0, 160) });
      if (exitCode == 0) {
        await this.load();
        // Dateien von Kontakten, die es nicht mehr gibt, entfernen
        const keep = new Set([...this.byEmail.values(), ...this.byName.values()]);
        for (const child of await IOUtils.getChildren(dir)) {
          if (child.endsWith(".img") && !keep.has(child)) {
            await IOUtils.remove(child).catch(() => {});
          }
        }
        this.listeners.forEach(fn => fn());
      }
    } catch (e) {
      log("mac photos sync error", String(e).slice(0, 200));
    } finally {
      this.running = false;
      await IOUtils.remove(script).catch(() => {});
    }
  },
};

class LogoCache {
  constructor() {
    this.path = PathUtils.join(PathUtils.profileDir, CACHE_FILE);
    this.entries = {};
    this.loaded = this.load();
    this.saveTimer = null;
  }

  async load() {
    try {
      this.entries = await IOUtils.readJSON(this.path);
    } catch {
      this.entries = {};
    }
    // Abgelaufenes entfernen – sonst wächst die Datei mit jedem Absender
    let dropped = 0;
    for (const [domain, e] of Object.entries(this.entries)) {
      if (!e || !e.t || Date.now() - e.t > (e.src ? HIT_TTL : MISS_TTL) || (!e.src && e.v !== 2)) {
        delete this.entries[domain];
        dropped++;
      }
    }
    if (dropped) {
      this.scheduleSave();
    }
  }

  get(domain) {
    const e = this.entries[domain];
    if (!e) {
      return undefined;
    }
    // „kein Logo“ aus älteren Versionen verwerfen: bis 3.0.82 scheiterte jeder Abruf
    if (!e.src && e.v !== 2) {
      return undefined;
    }
    const ttl = e.src ? HIT_TTL : MISS_TTL;
    return Date.now() - e.t < ttl ? e : undefined;
  }

  set(domain, value) {
    this.entries[domain] = { ...value, t: Date.now() };
    this.scheduleSave();
  }

  scheduleSave() {
    if (this.saveTimer) {
      return;
    }
    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      try {
        await IOUtils.writeJSON(this.path, this.entries, {
          tmpPath: this.path + ".tmp",
        });
      } catch (e) {
        log("cache save failed", e);
      }
    }, 2000);
  }
}

// ---------------------------------------------------------------------------
// Absenderbilder
// ---------------------------------------------------------------------------

class AvatarResolver {
  constructor(getWindow) {
    this.getWindow = getWindow;
    this.cache = new LogoCache();
    this.byEmail = new Map(); // email -> {src, small} | null
    this.pending = new Map(); // email -> Promise
    this.domainPending = new Map();
  }

  peek(email) {
    return this.byEmail.get(email);
  }

  resolve(email, hint = {}) {
    if (this.byEmail.has(email)) {
      return Promise.resolve(this.byEmail.get(email));
    }
    if (!this.pending.has(email)) {
      const p = this._resolve(email, hint)
        .catch(e => {
          log("avatar error", email, e);
          return null;
        })
        .then(result => {
          this.byEmail.set(email, result);
          this.pending.delete(email);
          return result;
        });
      this.pending.set(email, p);
    }
    return this.pending.get(email);
  }

  async _resolve(email, hint = {}) {
    const fromAb = await this.fromAddressBook(email);
    if (fromAb) {
      debugLog("avatar", email, "Adressbuch");
      return { src: await this.normalize(fromAb), small: false };
    }
    const domain = email.split("@")[1];
    if (!domain) {
      return null;
    }
    const org = orgDomain(domain);
    if (FREEMAIL.has(org) || FREEMAIL.has(domain)) {
      debugLog("avatar", email, "Initialen (Freemail)");
      return null;
    }
    let logo = await this.domainLogo(domain, org);
    let used = org;
    // Versand über fremde Dienste (z. B. brave.discoursemail.com): Die Marke
    // steckt dann oft nur in der Message-ID (…@community.brave.app). Nur
    // nutzen, wenn ihr Name auch im Absender vorkommt – sonst kämen Logos von
    // Versanddiensten wie Amazon SES oder Mailchimp.
    const idHost = ((hint.messageId || "").split("@")[1] || "").replace(/[>\s]/g, "").toLowerCase();
    if (!logo && idHost && idHost.includes(".")) {
      // von der Basisdomain aufwärts: community.brave.app → brave.app
      // (brave.app steht selbst in der Liste der Domain-Endungen)
      const sender = `${hint.name || ""} ${domain}`.toLowerCase();
      const labels = orgDomain(idHost).split(".");
      for (let i = 0; !logo && labels.length - i >= 2; i++) {
        const d = labels.slice(i).join(".");
        const brand = labels[i];
        if (d != org && brand.length >= 3 && sender.includes(brand) && !FREEMAIL.has(d)) {
          logo = await this.domainLogo(d, d);
          used = d;
        }
      }
    }
    debugLog("avatar", email, logo ? `Logo ${used} (${logo.source || "Speicher"})` : "Initialen (kein Logo)");
    return logo;
  }

  // Einheitliche Größe: einfarbigen bzw. durchsichtigen Rand eines Logos
  // erkennen, wegschneiden und das Motiv mit gleichem Abstand neu zentrieren.
  // Bilder ohne erkennbaren Rand (Fotos, randlose Logos) bleiben unverändert.
  async normalize(src) {
    const win = this.getWindow();
    if (!win || !src) {
      return src;
    }
    try {
      const img = new win.Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = src;
      });
      const N = 128;
      const XHTML = "http://www.w3.org/1999/xhtml";
      const canvas = win.document.createElementNS(XHTML, "canvas");
      canvas.width = canvas.height = N;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const iw = img.naturalWidth || N;
      const ih = img.naturalHeight || N;
      const scale = Math.min(N / iw, N / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const ox = (N - dw) / 2;
      const oy = (N - dh) / 2;
      ctx.drawImage(img, ox, oy, dw, dh);
      const data = ctx.getImageData(0, 0, N, N).data;
      const at = (x, y) => {
        const i = (Math.min(N - 1, Math.max(0, Math.round(y))) * N + Math.min(N - 1, Math.max(0, Math.round(x)))) * 4;
        return [data[i], data[i + 1], data[i + 2], data[i + 3]];
      };
      const corners = [
        at(ox + 1, oy + 1), at(ox + dw - 2, oy + 1),
        at(ox + 1, oy + dh - 2), at(ox + dw - 2, oy + dh - 2),
      ];
      const opaque = corners.filter(c => c[3] > 200).length >= 3;
      // Fotos erkennt man an unterschiedlichen Ecken – die bleiben unverändert
      if (opaque) {
        const spread = k => Math.max(...corners.map(c => c[k])) - Math.min(...corners.map(c => c[k]));
        if (spread(0) + spread(1) + spread(2) > 60) {
          return src;
        }
      }
      const bg = opaque
        ? [0, 1, 2].map(k => Math.round(corners.reduce((a, c) => a + c[k], 0) / 4))
        : null;
      let minX = N, minY = N, maxX = -1, maxY = -1;
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const i = (y * N + x) * 4;
          const a = data[i + 3];
          const content = opaque
            ? a > 24 && Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) > 48
            : a > 24;
          if (content) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) {
        return src;
      }
      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      // Randlose, durchsichtige Logos (z. B. ein runder Spotify-Kreis) sind
      // bereits für den Kreis gestaltet. Alle anderen Logos – zu kleine wie
      // zu große – kommen auf dieselbe Größe.
      if (!opaque && bw > N * 0.9 && bh > N * 0.9) {
        return src;
      }
      // Motiv auf ca. 69 % der Kantenlänge – passt auch diagonal in den Kreis
      const side = Math.max(bw, bh) * 1.45;
      const cx = (minX + maxX + 1) / 2;
      const cy = (minY + maxY + 1) / 2;
      const out = win.document.createElementNS(XHTML, "canvas");
      out.width = out.height = N;
      const octx = out.getContext("2d");
      octx.fillStyle = opaque ? `rgb(${bg.join(",")})` : "#fff";
      octx.fillRect(0, 0, N, N);
      octx.drawImage(canvas, cx - side / 2, cy - side / 2, side, side, 0, 0, N, N);
      return out.toDataURL("image/png");
    } catch (e) {
      log("normalize error", e);
      return src;
    }
  }

  async fromAddressBook(email) {
    let card = null;
    try {
      card = MailServices.ab.cardForEmailAddress(email);
    } catch {
      return null;
    }
    const url = card?.photoURL;
    if (url?.startsWith("data:")) {
      return url;
    }
    if (url?.startsWith("file:")) {
      // Foto im lokalen Adressbuch: Thunderbird legt es als Datei in <Profil>/Photos ab
      const win = this.getWindow();
      if (win) {
        try {
          const path = Services.io.newURI(url).QueryInterface(Ci.nsIFileURL).file.path;
          // nur ganze Dateien bis 2 MB – größere (alte Profile: Kamerafoto
          // unverändert kopiert) nicht abgeschnitten anzeigen, sondern wie im
          // Netz-Zweig überspringen
          const { size } = await IOUtils.stat(path);
          if (size >= 100 && size <= 2 * 1024 * 1024) {
            const buf = await IOUtils.read(path);
            return `data:image/jpeg;base64,${bytesToBase64(win, buf)}`;
          }
        } catch {}
      }
    }
    // Foto aus der macOS-Kontakte-App (iCloud-Fotos sind nur als Link hinterlegt)
    const local = MacPhotos.lookup([email, ...(card?.emailAddresses || [])], card?.displayName);
    if (local) {
      const win = this.getWindow();
      try {
        const buf = await IOUtils.read(local);
        return `data:image/jpeg;base64,${bytesToBase64(win, buf)}`;
      } catch {}
    }
    if (!url) {
      return null;
    }
    const win = this.getWindow();
    if (!win) {
      return null;
    }
    try {
      const res = await fetchWithTimeout(win, url);
      const type = (res.headers.get("content-type") || "").split(";")[0].trim();
      // Anmeldeseiten (iCloud: 401 mit HTML) sind kein Foto – dann Initialen
      if (!res.ok || !type.startsWith("image/")) {
        return null;
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length < 100 || buf.length > 2 * 1024 * 1024) {
        return null;
      }
      return `data:${type};base64,${bytesToBase64(win, buf)}`;
    } catch {
      return null;
    }
  }

  async domainLogo(domain, org) {
    if (!Services.prefs.getBoolPref(SENDER_LOGOS_PREF, true)) {
      return null;
    }
    await this.cache.loaded;
    const key = org;
    const cached = this.cache.get(key);
    if (cached) {
      if (!cached.src) {
        return null;
      }
      if (cached.n !== 2) {
        // Logo aus einer älteren Version: einmalig zuschneiden und merken
        const src = await this.normalize(cached.src);
        this.cache.set(key, { src, small: false, n: 2, source: cached.source });
        return { src, small: false, source: cached.source };
      }
      return { src: cached.src, small: false, source: cached.source };
    }
    if (!this.domainPending.has(key)) {
      const p = (async () => {
        const win = this.getWindow();
        if (!win) {
          return null;
        }
        let found = null;
        const timeoutsBefore = fetchTimeouts;
        for (const d of new Set([domain, org])) {
          found = await this.bimi(win, d);
          if (found) {
            break;
          }
        }
        if (!found) {
          found = await this.siteIcon(win, org);
        }
        if (found) {
          found = { src: await this.normalize(found.src), small: false, n: 2, source: found.source };
        }
        if (found || fetchTimeouts == timeoutsBefore) {
          this.cache.set(key, found || { src: null, v: 2 });
        }
        return found;
      })().finally(() => this.domainPending.delete(key));
      this.domainPending.set(key, p);
    }
    return this.domainPending.get(key);
  }

  async bimi(win, domain) {
    let records;
    try {
      records = await DNS.txt(`default._bimi.${domain}`);
    } catch {
      return null;
    }
    for (const rec of records || []) {
      const txt = (rec.strings || [rec.data || ""]).join("");
      if (!/v=BIMI1/i.test(txt)) {
        continue;
      }
      const m = txt.match(/(?:^|;)\s*l=([^;\s]+)/i);
      if (!m || !m[1].startsWith("https://")) {
        continue;
      }
      try {
        const res = await fetchWithTimeout(win, m[1], { max: 256 * 1024 });
        if (!res.ok) {
          continue;
        }
        const svg = await res.text();
        if (svg.length > 256 * 1024 || !/<svg[\s>]/i.test(svg.slice(0, 4096))) {
          continue;
        }
        return {
          src: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg),
          small: false,
          source: "BIMI",
        };
      } catch {
        // nächster Eintrag oder nächste Quelle
      }
    }
    return null;
  }

  async siteIcon(win, org) {
    const candidates = [
      `https://${org}/apple-touch-icon.png`,
      `https://www.${org}/apple-touch-icon.png`,
    ];
    // Icons aus dem <head> der Startseite (apple-touch-icon bevorzugt)
    for (const home of [`https://www.${org}/`, `https://${org}/`]) try {
      // nur der Anfang mit dem <head> wird gebraucht
      const res = await fetchWithTimeout(win, home, {
        headers: { Accept: "text/html" },
        max: 200000,
        truncate: true,
      });
      if (res.ok) {
        const html = (await res.text()).slice(0, 200000);
        const base = res.url;
        const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(x => x[0]);
        const scored = [];
        for (const tag of links) {
          const rel = (tag.match(/\brel\s*=\s*["']?([^"'>]+)/i) || [])[1] || "";
          const href = (tag.match(/\bhref\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
          if (!href || !/icon/i.test(rel)) {
            continue;
          }
          const sizes = (tag.match(/\bsizes\s*=\s*["']?(\d+)/i) || [])[1];
          let score = Number(sizes) || 32;
          if (/apple-touch-icon/i.test(rel)) {
            score += 1000;
          }
          if (/\.svg(\?|$)/i.test(href)) {
            score += 500;
          }
          try {
            scored.push({ url: Services.io.newURI(base).resolve(href), score });
          } catch {}
        }
        scored.sort((a, b) => b.score - a.score);
        candidates.unshift(...scored.slice(0, 3).map(s => s.url));
        break;
      }
    } catch (e) {
      debugLog("siteIcon", home, "Fehler", String(e));
    }
    candidates.push(`https://www.${org}/favicon.ico`, `https://${org}/favicon.ico`);

    for (const url of new Set(candidates)) {
      if (!url.startsWith("https://")) {
        continue;
      }
      try {
        const res = await fetchWithTimeout(win, url, { max: 512 * 1024 });
        const type = (res.headers.get("content-type") || "").split(";")[0];
        if (!res.ok || !type.startsWith("image/")) {
          continue;
        }
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.length < 100 || buf.length > 512 * 1024) {
          continue;
        }
        const small = !/apple-touch-icon|\.svg/i.test(url) && buf.length < 6000;
        return {
          src: `data:${type};base64,${bytesToBase64(win, buf)}`,
          small,
          source: "Website",
        };
      } catch (e) {
        debugLog("siteIcon", url, "Fehler", String(e));
      }
    }
    return null;
  }
}

// CSS-Variable nur setzen, wenn sich der Wert ändert – jede Änderung am
// Wurzelelement lässt Thunderbird das ganze Fenster neu durchrechnen (~10 ms)
function setVar(el, name, value) {
  if (el && el.style.getPropertyValue(name) != value) {
    el.style.setProperty(name, value);
  }
}

// Platz, den die Toolbar rechts der Mailliste braucht: alle Knöpfe in
// natürlicher Breite, das Suchfeld mit 333 px, der kleinste Abstand nach
// „Verfassen“ (12 px), der Rand rechts und 6 px Einzug an der Listenkante
// Breite der Fensterknöpfe rechts in der Toolbar-Zeile (Windows/Linux:
// Minimieren, Maximieren, Schließen; auf dem Mac 0)
function captionWidth(doc) {
  if (Services.appinfo.OS == "Darwin") {
    return 0; // auf dem Mac sitzen sie links (Ampel)
  }
  return Math.round(doc.querySelector("#unifiedToolbarContainer .titlebar-buttonbox-container")?.getBoundingClientRect().width || 0);
}

// Platz rechts neben der Knopfleiste in der Toolbar-Zeile (Windows/Linux:
// ≡-Menü und Fensterknöpfe stehen dort neben #unifiedToolbarContent und
// nehmen ihm Breite weg; auf dem Mac 0)
function rowTail(doc) {
  if (Services.appinfo.OS == "Darwin") {
    return 0;
  }
  const row = doc.getElementById("unifiedToolbarContainer")?.getBoundingClientRect();
  const content = doc.getElementById("unifiedToolbarContent")?.getBoundingClientRect();
  if (!row?.width || !content?.width) {
    return 0;
  }
  return Math.max(0, Math.round(row.right - content.right));
}

// minimal: nur die Knöpfe, die bei Platzmangel nicht weichen (SQUEEZE), und
// das Suchfeld in seiner kleinsten sinnvollen Breite – für Ziehgrenzen
function toolbarNeed(doc, minimal = false) {
  const content = doc.getElementById("unifiedToolbarContent");
  if (!content) {
    return 0;
  }
  const win = doc.defaultView;
  // rechts: Abstand für Today-Pane/-Knopf und was unter Windows/Linux neben
  // der Knopfleiste steht (≡-Menü, Fensterknöpfe – das Padding ist darum
  // kleiner, siehe --mc-row-tail)
  const pad = parseFloat(win.getComputedStyle(content).paddingInlineEnd) || 0;
  let need = 10 + Math.max(pad, 60) + rowTail(doc) + 12;
  let afterFirst = false;
  for (const li of content.children) {
    const id = li.getAttribute("item-id");
    if (id == "spacer") {
      afterFirst = true;
      continue;
    }
    if (!afterFirst || li.hidden || (!li.getBoundingClientRect().width && !li.hasAttribute("mc-squeezed"))) {
      continue;
    }
    if (minimal && SQUEEZE.includes(id)) {
      continue;
    }
    if (!minimal && li.hasAttribute("mc-squeezed")) {
      continue;
    }
    const cs = win.getComputedStyle(li);
    const margins = (parseFloat(cs.marginInlineStart) || 0) + (id == "write-message" ? 12 : parseFloat(cs.marginInlineEnd) || 0);
    need += (id == "search-bar" ? (minimal ? 160 : 333) : li.getBoundingClientRect().width) + margins;
  }
  return Math.ceil(need);
}

// Zu wenig Platz rechts der Mailliste (z. B. 1280 px mit Today-Pane): wie
// Apple Mail die unwichtigsten Knöpfe ausblenden, statt sie über die Liste
// und den Seitenleisten-Knopf zu schieben. fits() misst nach jedem Schritt.
const SQUEEZE = ["junk", "mark-as", "move-to", "forward-inline", "reply-all", "get-messages", "archive"];
function squeezeToolbar(doc, fits) {
  const content = doc.getElementById("unifiedToolbarContent");
  if (!content) {
    return;
  }
  for (const li of content.querySelectorAll(":scope > li[mc-squeezed]")) {
    li.removeAttribute("mc-squeezed");
  }
  for (const id of SQUEEZE) {
    if (fits()) {
      break;
    }
    content.querySelector(`:scope > li[item-id="${id}"]`)?.setAttribute("mc-squeezed", "");
  }
}

// ---------------------------------------------------------------------------
// Kalender: passendes Emoji vor dem Titel (nur Anzeige, der Termin bleibt
// unverändert). stems greifen auch in zusammengesetzten Wörtern
// („Geburtstagsfeier“, „Herbstferien“), words nur als ganzes Wort („Bad“
// nicht in „Badminton“). Reihenfolge: Spezielles vor Allgemeinem.
// ---------------------------------------------------------------------------
const EMOJI_PREF = "extensions.mailcards.calendarEmoji";
const UNREAD_TINT_PREF = "extensions.mailcards.unreadTint";
const BDAY_PREF = "extensions.mailcards.birthdays";
const BDAY_CAL_PREF = "extensions.mailcards.birthdayCalendarId";
const EMOJI_RULES = [
  ["🎂", { stems: ["geburtstag", "birthday", "rodjendan", "rođendan"], words: ["bday"] }],
  ["🎃", { stems: ["halloween"] }],
  ["🎄", { stems: ["weihnacht", "christmas", "xmas", "nikolaus", "advent"] }],
  ["🎆", { stems: ["silvester", "new year"] }],
  ["🐣", { stems: ["ostern", "easter"] }],
  ["💍", { stems: ["hochzeit", "wedding"] }],
  ["🐾", { stems: ["tierarzt", "tierärzt"], words: ["vet"] }],
  ["🦷", { stems: ["zahnarzt", "zahnärzt", "kieferchirurg", "kieferorthop", "dentist", "zahnreinigung"] }],
  ["💉", { stems: ["impfung", "vaccin", "blutabnahme"] }],
  ["🏥", { stems: ["krankenhaus", "spital", "hospital"] }],
  // „Ordination“ nur am Wortanfang (nicht in „Koordination“)
  ["🩺", { stems: ["arzt", "ärztin", "doctor", "therapie", "physio", "untersuchung", "befund"], re: /(?<![\p{L}\p{N}])ordination/u }],
  ["💇", { stems: ["friseur", "frisör", "haircut", "beauty", "kosmetik", "maniküre", "pediküre"] }],
  ["✈️", { stems: ["flughafen", "airport", "abflug", "rückflug", "flight"], words: ["flug"] }],
  ["🚆", { stems: ["bahnhof"], words: ["zug", "bahn", "train", "öbb"] }],
  ["🏖️", { stems: ["urlaub", "ferien", "vacation", "holiday", "strand"] }],
  ["🧘", { stems: ["yoga", "pilates", "meditation"] }],
  ["🏃", { stems: ["joggen", "laufen", "marathon"], words: ["run", "lauf"] }],
  ["🏊", { stems: ["schwimm"], words: ["swim"] }],
  ["⚽", { stems: ["fußball", "fussball", "soccer"], words: ["match"] }],
  ["🎾", { stems: ["tennis", "padel"] }],
  ["⛷️", { stems: ["skifahren", "skitag", "skiurlaub"], words: ["ski"] }],
  ["🏋️", { stems: ["training", "fitness", "workout", "turnen"], words: ["gym", "sport"] }],
  ["🎓", { stems: ["sponsion", "graduation", "matura", "abschlussfeier"] }],
  ["📚", { stems: ["schule", "schul", "englisch", "mathe", "nachhilfe", "prüfung", "hausübung", "hausaufgabe", "vorlesung", "lernen", "exam"], words: ["uni", "kurs", "course"] }],
  ["🏠", { stems: ["home office", "homeoffice"] }],
  ["📞", { stems: ["telefon", "anruf"], words: ["call", "zoom", "teams", "webex", "facetime"] }],
  ["👥", { stems: ["meeting", "besprechung", "jour fixe", "standup", "workshop"] }],
  ["☕", { stems: ["kaffee", "coffee"] }],
  ["🍽️", { stems: ["mittagessen", "abendessen", "frühstück", "breakfast", "brunch", "lunch", "dinner", "restaurant"], words: ["essen"] }],
  ["🍻", { stems: ["stammtisch"], words: ["bier", "drinks", "beer"] }],
  ["🎉", { stems: ["party", "feier", "fest "] }],
  ["🎵", { stems: ["konzert", "concert", "klavier", "gitarre", "musikschule", "chorprobe"] }],
  ["🎬", { stems: ["kino", "movie"] }],
  ["🎭", { stems: ["theater", "musical"], words: ["oper"] }],
  ["⚖️", { stems: ["gericht", "anwalt", "verhandlung", "notar"] }],
  // „Steuer“ auch in „Einkommensteuer“, aber nicht in Lenkungsgremien
  // („Steuerung(sgruppe)“, „Steuerkreis“, „Steuergruppe“)
  ["💰", { stems: ["finanzamt", "steuerberat"], words: ["bank"], re: /steuer(?!ung|kreis|gruppe)/u }],
  ["🛒", { stems: ["einkauf", "shopping", "supermarkt"] }],
  ["📦", { stems: ["umzug", "paket", "lieferung"] }],
  ["🚗", { stems: ["werkstatt", "pickerl", "reifenwechsel", "autoservice"], words: ["auto"] }],
  ["🔧", { stems: ["handwerker", "installateur", "reparatur", "elektriker"] }],
  ["🛁", { stems: ["badezimmer"], words: ["bad"] }],
  ["💻", { stems: ["laptop", "computer"] }],
  ["🧹", { stems: ["putzen", "reinigung", "putzfrau"] }],
  ["👶", { stems: ["baby", "kindergarten", "kita"] }],
  ["🐶", { stems: ["hund", "gassi"] }],
].map(([emoji, { stems = [], words = [], re = null }]) => ({
  emoji,
  stems,
  // eigener Ausdruck (auf den kleingeschriebenen Titel) für Sonderfälle
  re,
  // ganze Wörter: davor und danach kein Buchstabe und keine Ziffer
  word: words.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.join("|")})(?![\\p{L}\\p{N}])`, "iu") : null,
}));
const HAS_EMOJI = /\p{Extended_Pictographic}/u;
const EMOJI_CUSTOM_PREF = "extensions.mailcards.emojiCustom";
const emojiCache = new Map();
// eigene Stichwörter aus den Einstellungen: je Zeile „Stichwort = Emoji“
let customEmoji = null;
function customEmojiRules() {
  if (!customEmoji) {
    customEmoji = [];
    for (const line of Services.prefs.getStringPref(EMOJI_CUSTOM_PREF, "").split(/\r?\n/)) {
      const m = line.match(/^\s*(.+?)\s*[=:]\s*(\S+)\s*$/u);
      if (m && HAS_EMOJI.test(m[2])) {
        customEmoji.push({ stem: m[1].toLocaleLowerCase(), emoji: m[2] });
      }
    }
  }
  return customEmoji;
}
function resetEmojiRules() {
  customEmoji = null;
  emojiCache.clear();
}
function emojiFor(title) {
  const text = String(title || "").trim();
  if (!text || HAS_EMOJI.test(text)) {
    return ""; // schon ein Emoji im Titel – nichts zusätzlich
  }
  if (emojiCache.has(text)) {
    return emojiCache.get(text);
  }
  const lower = text.toLocaleLowerCase();
  // eigene Stichwörter zuerst
  let found = customEmojiRules().find(r => lower.includes(r.stem))?.emoji || "";
  for (const rule of found ? [] : EMOJI_RULES) {
    if (rule.stems.some(st => lower.includes(st)) || rule.word?.test(text) || rule.re?.test(lower)) {
      found = rule.emoji;
      break;
    }
  }
  if (emojiCache.size > 2000) {
    emojiCache.clear();
  }
  emojiCache.set(text, found);
  return found;
}

// ---------------------------------------------------------------------------
// Schnellfenster: natürliche Eingabe wie bei Fantastical – „Lunch mit Anna
// morgen 12 Uhr“ → Titel „Lunch mit Anna“, morgen 12:00–13:00. Erkennt
// Deutsch und Englisch: heute/morgen/übermorgen, Wochentage, 17.10.(2026),
// 17. Oktober, Uhrzeiten (12 Uhr, 12:30, 9am), Zeiträume (10–11 Uhr,
// von 10 bis 12), Dauer (für 2 Stunden) und „ganztägig“.
// ---------------------------------------------------------------------------
const NL_MONTHS = {
  jan: 0, januar: 0, jänner: 0, january: 0, feb: 1, februar: 1, february: 1, mär: 2, märz: 2, mar: 2, march: 2,
  apr: 3, april: 3, mai: 4, may: 4, jun: 5, juni: 5, june: 5, jul: 6, juli: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, okt: 9, oktober: 9, oct: 9, october: 9, nov: 10, november: 10, dez: 11, dezember: 11, dec: 11, december: 11,
};
const NL_WEEKDAYS = {
  sonntag: 0, sunday: 0, so: 0, sun: 0, montag: 1, monday: 1, mo: 1, mon: 1, dienstag: 2, tuesday: 2, di: 2, tue: 2,
  mittwoch: 3, wednesday: 3, mi: 3, wed: 3, donnerstag: 4, thursday: 4, do: 4, thu: 4,
  freitag: 5, friday: 5, fr: 5, fri: 5, samstag: 6, saturday: 6, sa: 6, sat: 6,
};
function parseNatural(text, now = new Date()) {
  let rest = ` ${text} `;
  const take = re => {
    const m = rest.match(re);
    if (m) {
      rest = rest.slice(0, m.index) + " " + rest.slice(m.index + m[0].length);
    }
    return m;
  };
  const B = "(?<![\\p{L}\\p{N}])"; // Wortanfang
  const E = "(?![\\p{L}\\p{N}])"; // Wortende
  let day = null;
  let allDay = false;
  // ganztägig
  if (take(new RegExp(`${B}(ganztägig|ganztags|den ganzen tag|all[ -]?day)${E}`, "iu"))) {
    allDay = true;
  }
  const dayNames = Object.keys(NL_WEEKDAYS).filter(k => k.length > 3).join("|");
  // relative Tage („morgen“ nach einem Wochentag ist der Vormittag: „Freitag
  // morgen 8 Uhr“ – nur nach dem ganzen Wort, nach „Karfreitag“ bleibt es morgen)
  let m = take(new RegExp(`${B}(übermorgen|day after tomorrow)${E}`, "iu"));
  if (m) {
    day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
  } else if ((m = take(new RegExp(`${B}(heute|today|(?<!${B}(?:${dayNames})\\s+)morgen|tomorrow)${E}`, "iu")))) {
    const plus = /^(morgen|tomorrow)$/i.test(m[1]) ? 1 : 0;
    day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + plus);
  }
  // Datum 17.10.(2026) / 17/10
  if (!day && (m = take(new RegExp(`${B}(?:am\\s+|on\\s+)?(\\d{1,2})\\.(\\d{1,2})\\.(\\d{2,4})?${E}`, "iu")))) {
    let y = m[3] ? Number(m[3]) : now.getFullYear();
    if (y < 100) {
      y += 2000;
    }
    day = new Date(y, Number(m[2]) - 1, Number(m[1]));
    if (!m[3] && day < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      day.setFullYear(y + 1); // ohne Jahr: nächstes Vorkommen
    }
  }
  // 17. Oktober / Oct 17 / October 17th
  const monthNames = Object.keys(NL_MONTHS).sort((a, b) => b.length - a.length).join("|");
  if (!day && (m = take(new RegExp(`${B}(?:am\\s+|on\\s+)?(\\d{1,2})\\.?\\s*(${monthNames})\\.?(?:\\s+(\\d{4}))?${E}`, "iu")))) {
    day = new Date(m[3] ? Number(m[3]) : now.getFullYear(), NL_MONTHS[m[2].toLowerCase()], Number(m[1]));
  } else if (!day && (m = take(new RegExp(`${B}(${monthNames})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?${E}`, "iu")))) {
    day = new Date(m[3] ? Number(m[3]) : now.getFullYear(), NL_MONTHS[m[1].toLowerCase()], Number(m[2]));
  }
  if (day && !m?.[3] && day < new Date(now.getFullYear(), now.getMonth(), now.getDate()) && !/heute|today/i.test(m?.[0] || "")) {
    day.setFullYear(day.getFullYear() + 1);
  }
  // Wochentag (nächstes Vorkommen; „nächsten Montag“ = in der nächsten Woche)
  if (!day && (m = take(new RegExp(`${B}(?:(am|on|nächsten|nächste[rn]?|next)\\s+)?(${dayNames})(?:\\s+morgens?)?${E}`, "iu")))) {
    const target = NL_WEEKDAYS[m[2].toLowerCase()];
    let diff = (target - now.getDay() + 7) % 7;
    if (diff == 0 || /^(nächst|next)/i.test(m[1] || "")) {
      diff += diff == 0 ? 7 : 0;
    }
    day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  }
  // Dauer (vor den Uhrzeiten, sonst wird „für 2h“ als 02:00 gelesen)
  let duration = null;
  if ((m = take(new RegExp(`${B}(?:für|for)\\s+(\\d+(?:[.,]5)?)\\s*(stunden?|std\\.?|hours?|hrs?|h|minuten|min\\.?|minutes?|mins?)${E}`, "iu")))) {
    const n = Number(m[1].replace(",", "."));
    duration = /^m/i.test(m[2]) ? n : n * 60;
  }
  // Uhrzeit: Zeitraum oder Einzelzeit
  const T = "(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm|a\\.m\\.|p\\.m\\.)?";
  const toMinutes = (h, min, ap) => {
    let hh = Number(h);
    if (ap && /p/i.test(ap) && hh < 12) hh += 12;
    if (ap && /a/i.test(ap) && hh == 12) hh = 0;
    return hh * 60 + Number(min || 0);
  };
  let startMin = null;
  let endMin = null;
  const range = take(new RegExp(`${B}(?:von\\s+|from\\s+|um\\s+|at\\s+)?${T}\\s*(?:-|–|bis|to|until)\\s*${T}\\s*(?:uhr|h)?${E}`, "iu"));
  if (range) {
    startMin = toMinutes(range[1], range[2], range[3]);
    endMin = toMinutes(range[4], range[5], range[6]);
    // „11-12am“ meint umgangssprachlich bis Mittag, nicht bis Mitternacht
    if (!range[3] && /^a/i.test(range[6]) && endMin == 0) {
      endMin = 12 * 60;
    }
    // nur das Ende hat am/pm: der Beginn übernimmt es, wenn er dann vor dem Ende
    // liegt („2-4pm“ → 14–16 Uhr, aber „11-1pm“ → 11–13 Uhr)
    if (!range[3] && range[6] && toMinutes(range[1], range[2], range[6]) < endMin) {
      startMin = toMinutes(range[1], range[2], range[6]);
    }
    // nur das Ende hat „am“ und liegt nach Mitternacht: der Beginn ist am
    // Abend davor („11-1am“ → 23–1 Uhr, nicht 11 Uhr bis 1 Uhr nachts)
    if (!range[3] && /^a/i.test(range[6] || "") && startMin > endMin) {
      const pm = toMinutes(range[1], range[2], "pm");
      if (pm > endMin) {
        startMin = pm;
      }
    }
  } else if ((m = take(new RegExp(`${B}(?:um\\s+|at\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?\\s*(?:uhr|h)${E}`, "iu")))) {
    startMin = toMinutes(m[1], m[2]);
  } else if ((m = take(new RegExp(`${B}(?:um\\s+|at\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm)${E}`, "iu")))) {
    startMin = toMinutes(m[1], m[2], m[3]);
  } else if ((m = take(new RegExp(`${B}(?:um|at)\\s+(\\d{1,2})(?:[:.](\\d{2}))?${E}`, "iu")))) {
    startMin = toMinutes(m[1], m[2]);
  } else if ((m = take(new RegExp(`${B}(\\d{1,2})[:](\\d{2})${E}`, "iu")))) {
    startMin = toMinutes(m[1], m[2]);
  }
  if (startMin != null && (startMin >= 24 * 60 || (endMin != null && endMin >= 24 * 60))) {
    return { title: text.trim() }; // keine gültige Uhrzeit – nichts erkannt
  }
  if (day == null && startMin == null && !allDay) {
    return { title: text.trim() };
  }
  // Füllwörter am Rand entfernen („am“, „um“, „on“, „at“)
  const title = rest.replace(new RegExp(`${B}(am|um|on|at|von|from)\\s*$`, "iu"), "")
    .replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").replace(/^[\s,–-]+|[\s,–-]+$/g, "").trim();
  const base = day || new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Dauer ohne Uhrzeit („Meeting morgen für 2h“): nicht ganztägig, die
  // Uhrzeit kommt aus der Vorbelegung des Schnellfensters
  const result = { title: title || text.trim(), allDay: allDay || (startMin == null && !!day && duration == null) };
  if (duration != null) {
    result.duration = duration;
  }
  if (!result.allDay && startMin != null) {
    result.start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), Math.floor(startMin / 60), startMin % 60);
    let end = endMin != null ? endMin : startMin + (duration ?? 60);
    if (endMin != null && end <= startMin) {
      // Ende vor dem Beginn: „9-5“ → 17:00, „22-2 Uhr“ → 02:00 am Folgetag;
      // 12-Stunden-Lesart nur bei Beginn bis Mittag („18-7 Uhr“ endet um 7 Uhr früh)
      end += !range[6] && startMin < 13 * 60 && end < 12 * 60 && end + 12 * 60 > startMin ? 12 * 60 : 24 * 60;
    }
    result.end = new Date(base.getFullYear(), base.getMonth(), base.getDate(), Math.floor(end / 60), end % 60);
    if (result.end <= result.start) {
      result.end = new Date(result.start.getTime() + 3600 * 1000);
    }
  } else {
    result.start = base;
  }
  return result;
}

// iCloud hängt alten Erinnerungslisten nach dem Update der Erinnerungen-App
// ein ⚠️ an den Namen – diese Listen werden nicht mehr über CalDAV abgeglichen
function calendarNote(calendar) {
  const name = calendar?.name || "";
  let host = "";
  try {
    host = calendar?.uri?.host || "";
  } catch {}
  if (!/\u26A0\uFE0F?\s*$/.test(name) || !/(^|\.)icloud\.com$/i.test(host)) {
    return null;
  }
  return Services.locale.appLocaleAsBCP47.startsWith("de")
    ? "iCloud markiert diese Liste mit ⚠️: Sie wurde in der Erinnerungen-App aktualisiert und wird nicht mehr über CalDAV abgeglichen – neue Erinnerungen erscheinen hier nicht."
    : "iCloud marks this list with ⚠️: it was upgraded in the Reminders app and no longer syncs over CalDAV – new reminders won't appear here.";
}

// Kanten für die Toolbar-Zeile nur dort setzen, wo sie gebraucht werden:
// an der Wurzel ließe jede Änderung alle ~5000 Elemente neu berechnen
// (25–40 ms pro Bild – die Seitenleisten-Animation ruckelt), an der
// Toolbar-Zeile sind es ~80.
function barTarget(doc) {
  return doc.getElementById("unifiedToolbarContainer") || doc.documentElement;
}
// Rechteck in Schreibrichtung: bei Rechts-nach-links-Sprachen gespiegelt
// (left = Abstand vom rechten Fensterrand), damit die Positionsrechnungen der
// Toolbar-Zeile für beide Richtungen gelten – die Werte landen in
// inset-inline-start & Co., die sich selbst spiegeln
function rectOf(el) {
  if (!el) {
    return undefined;
  }
  const r = el.getBoundingClientRect();
  const doc = el.ownerDocument;
  if (doc.__mcRtl === undefined) {
    doc.__mcRtl = doc.defaultView?.getComputedStyle(doc.documentElement).direction == "rtl";
  }
  if (!doc.__mcRtl) {
    return r;
  }
  const W = doc.documentElement.clientWidth;
  return { left: W - r.right, right: W - r.left, x: W - r.right, top: r.top, bottom: r.bottom, y: r.y, width: r.width, height: r.height };
}

function setBarVar(doc, name, value) {
  setVar(barTarget(doc), name, value);
}

// ---------------------------------------------------------------------------
// Kalender: Offline-Unterstützung standardmäßig an
// ---------------------------------------------------------------------------

// Online-Kalender (CalDAV, abonnierte ICS) ohne lokale Kopie lädt Thunderbird
// bei jedem Start komplett vom Server – bis dahin bleibt die Ansicht leer.
// Mit Offline-Unterstützung erscheinen die Termine sofort aus der lokalen
// Kopie, Änderungen kommen im Hintergrund nach. Eingeschaltet wird nur, wo
// die Einstellung nie angefasst wurde. Nur auf Wunsch
// (extensions.mailcards.calendarOffline = true): Thunderbird legt den
// Kalender dafür neu an (neue Kennung) – das stört Kalender, die andere
// Add-ons verwalten (TbSync, Provider), und lädt alles neu herunter.
function enableCalendarOffline() {
  if (!Services.prefs.getBoolPref("extensions.mailcards.calendarOffline", false)) {
    return 0;
  }
  let changed = 0;
  try {
    const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
    for (const calendar of cal.manager.getCalendars()) {
      if (!["caldav", "ics"].includes(calendar.type) || !/^https?:/.test(calendar.uri?.spec || "")) {
        continue;
      }
      if (calendar.getProperty("cache.supported") === false || calendar.getProperty("cache.always")) {
        continue;
      }
      if (Services.prefs.prefHasUserValue(`calendar.registry.${calendar.id}.cache.enabled`)) {
        continue; // bewusst gesetzt – so lassen
      }
      calendar.setProperty("cache.enabled", true);
      changed++;
    }
  } catch (e) {
    log("calendar offline error", String(e).slice(0, 160));
  }
  if (changed) {
    log("calendar offline enabled", { changed });
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Design aus der Erweiterung (theme.css)
// ---------------------------------------------------------------------------

// Das komplette Design liegt als theme.css in der Erweiterung – so kommt es
// mit jedem Update automatisch mit, ohne userChrome.css im Profil. Liegt dort
// noch eine (ältere, manuell kopierte) userChrome.css dieses Designs, gilt
// diese und theme.css bleibt aus, damit nichts doppelt greift.
// Kopfzeile der eigenen userChrome.css (ältere Fassungen trugen noch den alten Text)
const THEME_MARKERS = ["halo.spaces – ruhiges Design für Thunderbird", "Thunderbird im Stil von Apple Mail"];
// Start ohne Aufblitzen (Einstellung, Standard aus): Thunderbird zeichnet das
// Fenster, bevor Erweiterungen starten – nur eine userChrome.css im Profil gilt
// von Anfang an. Ist die Option an, schreibt halo.spaces sein Design dorthin
// (mit eigener Kopfzeile) und schaltet toolkit.legacyUserProfileCustomizations.
// stylesheets ein; nach Updates neu geschrieben. Aus, deaktiviert oder
// deinstalliert: Datei weg, Einstellung zurück. Eine userChrome.css ohne unsere
// Kopfzeile (selbst angelegt, alte Handinstallation) wird nie angefasst
const EARLY_THEME_PREF = "extensions.mailcards.earlyTheme";
const EARLY_LEGACY_PREF = "extensions.mailcards.earlyThemeSetLegacy";
const LEGACY_PREF = "toolkit.legacyUserProfileCustomizations.stylesheets";
const EarlyTheme = {
  HEAD: "/* halo.spaces: automatisch geschrieben (Start ohne Aufblitzen), Version ",
  file() {
    const file = Services.dirsvc.get("ProfD", Ci.nsIFile);
    file.append("chrome");
    file.append("userChrome.css");
    return file;
  },
  // Fassung aus unserer Kopfzeile, sonst null (fremde oder keine Datei)
  versionOf(head) {
    const at = (head || "").indexOf(this.HEAD);
    return at < 0 ? null : head.slice(at + this.HEAD.length).split(" ")[0];
  },
  async head() {
    const path = this.file().path;
    if (!(await IOUtils.exists(path))) {
      return null;
    }
    return (await IOUtils.readUTF8(path)).slice(0, 4096);
  },
  async sync() {
    try {
      if (Services.prefs.getBoolPref(EARLY_THEME_PREF, false) && Services.prefs.getBoolPref("extensions.mailcards.bundledTheme", true)) {
        await this.write();
      } else {
        await this.remove();
      }
    } catch (e) {
      log("early theme error", e);
    }
  },
  async write() {
    const head = await this.head();
    if (head !== null && this.versionOf(head) === null) {
      log("early theme: eigene userChrome.css des Nutzers – nicht überschrieben");
      return false;
    }
    if (head !== null && this.versionOf(head) == extensionVersion) {
      this.legacyOn();
      return true;
    }
    const channel = NetUtil.newChannel({ uri: "resource://mailcards/theme.css", loadUsingSystemPrincipal: true });
    const stream = channel.open();
    const css = NetUtil.readInputStreamToString(stream, stream.available(), { charset: "UTF-8" });
    stream.close();
    const file = this.file();
    await IOUtils.makeDirectory(file.parent.path, { ignoreExisting: true });
    await IOUtils.writeUTF8(file.path, `${this.HEAD}${extensionVersion} – nicht von Hand ändern, wird ersetzt */\n${css}`);
    this.legacyOn();
    return true;
  },
  legacyOn() {
    if (!Services.prefs.getBoolPref(LEGACY_PREF, false)) {
      Services.prefs.setBoolPref(LEGACY_PREF, true);
      Services.prefs.setBoolPref(EARLY_LEGACY_PREF, true);
    }
  },
  async remove() {
    const head = await this.head();
    if (head !== null && this.versionOf(head) !== null) {
      await IOUtils.remove(this.file().path);
    }
    // nur zurücksetzen, was halo.spaces selbst eingeschaltet hat
    if (Services.prefs.getBoolPref(EARLY_LEGACY_PREF, false)) {
      Services.prefs.clearUserPref(LEGACY_PREF);
      Services.prefs.clearUserPref(EARLY_LEGACY_PREF);
    }
  },
};

const ThemeSheet = {
  uri: "resource://mailcards/theme.css",
  active: false,
  init() {
    this.active = false;
    if (!Services.prefs.getBoolPref("extensions.mailcards.bundledTheme", true)) {
      return;
    }
    try {
      const file = Services.dirsvc.get("ProfD", Ci.nsIFile);
      file.append("chrome");
      file.append("userChrome.css");
      if (file.exists()) {
        const stream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
        stream.init(file, -1, 0, 0);
        const head = NetUtil.readInputStreamToString(stream, Math.min(stream.available(), 4096));
        stream.close();
        // eigene Kopie für den Start ohne Aufblitzen (EarlyTheme): gilt nur in der
        // aktuellen Fassung – nach einem Update lud Thunderbird noch die alte
        const managed = EarlyTheme.versionOf(head);
        if (managed !== null) {
          if (managed == extensionVersion) {
            log("theme: eigene userChrome.css (Start ohne Aufblitzen) ist aktuell");
            return;
          }
        } else if (THEME_MARKERS.some(m => head.includes(m))) {
          log("theme: userChrome.css im Profil hat Vorrang");
          return;
        }
      }
    } catch (e) {
      log("theme check error", String(e).slice(0, 120));
    }
    this.active = true;
  },
  // alle Thunderbird-eigenen Dokumente (wie userChrome.css: chrome://-Seiten)
  // sowie die Inhalts-Tabs Adressbuch, Einstellungen, Add-ons …
  wanted(doc) {
    const url = doc?.documentURI || "";
    return url.startsWith("chrome://") ||
      /^about:(addressbook|preferences|addons|accountsettings|accountsetup|message|3pane|import|profiling|downloads)/.test(url);
  },
  apply(win) {
    if (!this.active || !win || win.__mcTheme == this.uri || !this.wanted(win.document)) {
      return;
    }
    try {
      // nach einem Update: die alte Fassung in schon offenen Seiten ersetzen
      if (win.__mcTheme) {
        try {
          win.windowUtils.removeSheetUsingURIString(win.__mcTheme, win.windowUtils.USER_SHEET);
        } catch {}
      }
      win.windowUtils.loadSheetUsingURIString(this.uri, win.windowUtils.USER_SHEET);
      win.__mcTheme = this.uri;
    } catch {}
  },
  // alle Dokumente eines Fensters – auch die der Inhalts-Tabs (Einstellungen,
  // Adressbuch …): deren Browser sind eigene Bäume, nicht Teil des Fensters
  contexts(top) {
    const roots = [top?.browsingContext];
    for (const browserEl of top?.document?.querySelectorAll("browser") || []) {
      roots.push(browserEl.browsingContext);
    }
    const all = new Set();
    for (const root of roots) {
      for (const bc of root?.getAllBrowsingContextsInSubtree?.() || []) {
        all.add(bc);
      }
    }
    return all;
  },
  applyTree(top) {
    for (const bc of this.contexts(top)) {
      this.apply(bc.window); // null für Inhalte in anderen Prozessen (Mails)
    }
  },
  removeAll() {
    for (const top of Services.wm.getEnumerator(null)) {
      for (const bc of this.contexts(top)) {
        const win = bc.window;
        if (win?.__mcTheme) {
          try {
            win.windowUtils.removeSheetUsingURIString(win.__mcTheme, win.windowUtils.USER_SHEET);
          } catch {}
          delete win.__mcTheme;
        }
      }
    }
  },
};

// ---------------------------------------------------------------------------
// Einbindung in die Kartenansicht
// ---------------------------------------------------------------------------

class CardEnhancer {
  constructor(options) {
    // Zeilenzahl der Vorschau: Einstellung extensions.mailcards.previewLines
    // (Standard 1 wie in Apple Mail, 0 = keine Vorschau).
    const lines = Services.prefs.getIntPref(PREVIEW_PREF, options.previewLines ?? 1);
    this.previewLines = Math.max(0, Math.min(4, lines));
    this.contactPhotos = Services.prefs.getBoolPref(CONTACT_PHOTOS_PREF, true);
    this.windows = new Set();
    this.restorers = [];
    this.winRestorers = new WeakMap();
    this.requested = new Set();
    this.pendingPreview = new Map();
    this.previewTimer = null;
    this.fullQueue = [];
    this.fullActive = 0;
    this.stats = { quick: 0, full: { ok: 0, empty: 0, nomime: 0, error: 0 } };
    this.statsLogged = false;
    this.avatars = new AvatarResolver(() => this.anyWindow());
    this.mainWindows = new Set();
  }

  // Gmail: dieselbe Mail liegt als Label in mehreren Ordnern (Posteingang,
  // Wichtig, Alle Nachrichten …). Thunderbird gleicht den Gelesen-Status der
  // anderen Ordner erst ab, wenn man sie öffnet – bis dahin zeigt z. B.
  // „Wichtig“ eine Zahl, obwohl alles gelesen ist. Darum die Kopien sofort
  // mitziehen (auf dem Server ist es ohnehin dieselbe Nachricht).
  syncGmailLabels() {
    const READ = Ci.nsMsgMessageFlags.Read;
    let busy = false;
    const listener = {
      onFolderPropertyFlagChanged(hdr, property, oldFlag, newFlag) {
        if (busy || property != "Status" || !((oldFlag ^ newFlag) & READ)) {
          return;
        }
        try {
          const folder = hdr.folder;
          const server = folder?.server;
          if (server?.type != "imap" || !server.QueryInterface(Ci.nsIImapIncomingServer).isGMailServer || !hdr.messageId) {
            return;
          }
          const read = !!(newFlag & READ);
          busy = true; // die eigenen Änderungen lösen den Listener erneut aus
          for (const other of server.rootFolder.descendants) {
            if (other == folder || other.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
              continue;
            }
            // nur Ordner, deren Zahl sich ändern kann – andere Datenbanken nicht öffnen
            const unread = other.getNumUnread(false);
            if (read ? unread <= 0 : other.getTotalMessages(false) - unread <= 0) {
              continue;
            }
            const copy = other.msgDatabase?.getMsgHdrForMessageID(hdr.messageId);
            if (copy && copy.isRead != read) {
              other.markMessagesRead([copy], read);
            }
          }
        } catch (e) {
          log("gmail label sync error", String(e).slice(0, 160));
        } finally {
          busy = false;
        }
      },
    };
    MailServices.mailSession.AddFolderListener(listener, Ci.nsIFolderListener.propertyFlagChanged);

    // Am Handy oder im Web Gelesenes erfährt Thunderbird außerhalb des
    // Posteingangs erst beim Öffnen des Ordners. Darum Gmail-Ordner, die noch
    // Ungelesenes zeigen, alle 5 Minuten abgleichen (nur diese, wenige Ordner)
    const F = Ci.nsMsgFolderFlags;
    const refresh = () => {
      if (Services.io.offline) {
        return;
      }
      for (const server of MailServices.accounts.allServers) {
        try {
          if (server.type != "imap" || !server.QueryInterface(Ci.nsIImapIncomingServer).isGMailServer) {
            continue;
          }
          for (const f of server.rootFolder.descendants) {
            if (f.getFlag(F.Inbox | F.Virtual | F.Trash | F.Junk | F.ImapNoselect) || f.getNumUnread(false) <= 0) {
              continue;
            }
            f.updateFolder(null);
          }
        } catch (e) {
          log("gmail refresh error", String(e).slice(0, 160));
        }
      }
    };
    const first = setTimeout(refresh, 60 * 1000);
    const every = setInterval(refresh, 5 * 60 * 1000);
    this.restorers.push(() => {
      MailServices.mailSession.RemoveFolderListener(listener);
      clearTimeout(first);
      clearInterval(every);
    });
  }

  // Erstinstallation: Theme auf „System – automatisch“, außer eins der drei
  // eingebauten (System, Hell, Dunkel) ist schon aktiv. Liefert, ob umgestellt wurde
  async applyThemeOnce() {
    try {
      const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
      const active = (await AddonManager.getAddonsByTypes(["theme"])).find(a => a.isActive)?.id;
      if (Object.values(APPEARANCE_THEMES).includes(active)) {
        return false;
      }
      const auto = await AddonManager.getAddonByID(APPEARANCE_THEMES.auto);
      await auto?.enable();
      log("theme: Erstinstallation – auf System umgestellt", active);
      return !!auto;
    } catch (e) {
      log("theme switch error", e);
      return false;
    }
  }

  start() {
    // Erstinstallation oder Update? Bestandsnutzer haben schon Einmal-Prefs einer
    // früheren Fassung (Suche, Toolbar, Kartenzeilen) – vor allem anderen prüfen, der Start setzt sie gleich
    const WELCOME_PREF = "extensions.mailcards.welcomeShown";
    const existing = ["searchApplied", "toolbarApplied", "rowcountApplied"]
      .some(name => Services.prefs.getBoolPref(`extensions.mailcards.${name}`, false));
    const firstInstall = !existing && !Services.prefs.getBoolPref(WELCOME_PREF, false);
    this.firstInstall = firstInstall;
    if (existing && !Services.prefs.getBoolPref(WELCOME_PREF, false)) {
      // Bestandsnutzer nach einem Update nicht begrüßen (und keine Plattform-Notiz mehr)
      Services.prefs.setBoolPref(WELCOME_PREF, true);
    }
    // Erstinstallation: Erscheinungsbild „System – automatisch“, damit das Design
    // hell/dunkel mit dem System wechselt (Thunderbirds Hell/Dunkel und fremde
    // Themes malen eigene Farben darüber). Eine bewusste Wahl unter den drei
    // eingebauten (System, Hell, Dunkel) bleibt erhalten
    const themeSwitched = firstInstall ? this.applyThemeOnce() : Promise.resolve(false);
    // Start ohne Aufblitzen: Datei im Profil passend zur Einstellung (nach Updates neu)
    EarlyTheme.sync();
    const earlyObs = { observe: () => EarlyTheme.sync() };
    Services.prefs.addObserver(EARLY_THEME_PREF, earlyObs);
    this.restorers.push(() => Services.prefs.removeObserver(EARLY_THEME_PREF, earlyObs));
    // Vorschauzeilen (Ansicht → Vorschauzeilen) gelten sofort, ohne Neustart
    const previewObs = { observe: () => this.applyPreviewLines() };
    Services.prefs.addObserver(PREVIEW_PREF, previewObs);
    this.restorers.push(() => Services.prefs.removeObserver(PREVIEW_PREF, previewObs));
    // Kontaktfoto ein/aus (Drei-Punkte-Menü) ebenso
    const photosObs = { observe: () => this.applyContactPhotos() };
    Services.prefs.addObserver(CONTACT_PHOTOS_PREF, photosObs);
    this.restorers.push(() => Services.prefs.removeObserver(CONTACT_PHOTOS_PREF, photosObs));
    // Ansicht und Layout der Mailliste nur in gültigen Kombinationen (Karten
    // vertikal, Tabelle klassisch) – beim Start bestehende Profile umstellen
    syncViewChoice(LISTVIEW_PREF);
    const viewObs = { observe: (_s, _t, pref) => syncViewChoice(pref) };
    Services.prefs.addObserver(LISTVIEW_PREF, viewObs);
    Services.prefs.addObserver(PANE_PREF, viewObs);
    this.restorers.push(() => {
      Services.prefs.removeObserver(LISTVIEW_PREF, viewObs);
      Services.prefs.removeObserver(PANE_PREF, viewObs);
    });
    // Wie Apple Mail: Absender, Betreff, darunter die Vorschau. Thunderbirds
    // dritte Kartenzeile wäre sonst nur eine Leerzeile über der Vorschau.
    // (einmalig – wer danach wieder 3 Zeilen wählt, behält sie)
    if (this.previewLines && !Services.prefs.getBoolPref("extensions.mailcards.rowcountApplied", false)) {
      Services.prefs.setIntPref("mail.threadpane.cardsview.rowcount", 2);
      Services.prefs.setBoolPref("extensions.mailcards.rowcountApplied", true);
    }
    this.applyToolbarOnce();
    this.applySpaceToolbarsOnce();
    // Suche über alle Konten und Treffer als einfache Liste (Einstellungen →
    // Allgemein) – einmalig, wer es danach abschaltet, behält das
    if (!Services.prefs.getBoolPref("extensions.mailcards.searchApplied", false)) {
      Services.prefs.setBoolPref("mailnews.database.global.indexer.enabled", true);
      Services.prefs.setBoolPref("gloda.show_as_list_by_default", true);
      Services.prefs.setBoolPref("extensions.mailcards.searchApplied", true);
    }
    // Wie Apple Mail: das Verfassen-Fenster schließt beim Senden sofort, die
    // Mail geht im Hintergrund über den Postausgang hinaus, ohne Fenster
    // „Nachricht wird gesendet“. Thunderbird meldet Fehler dabei nur in der
    // Aktivitätsanzeige – darum zeigt sendErrors() sie selbst als Dialog.
    // Die vorherigen Werte werden gemerkt und beim Ausschalten wiederhergestellt.
    for (const [pref, saved, value, def] of [
      ["mailnews.show_send_progress", "extensions.mailcards.sendProgressSaved", false, true],
      ["mailnews.sendInBackground", "extensions.mailcards.sendBackgroundSaved", true, false],
    ]) {
      if (!Services.prefs.prefHasUserValue(saved)) {
        Services.prefs.setBoolPref(saved, Services.prefs.getBoolPref(pref, def));
      }
      Services.prefs.setBoolPref(pref, value);
      this.restorers.push(() => {
        if (!Services.prefs.prefHasUserValue(saved)) {
          return;
        }
        const was = Services.prefs.getBoolPref(saved, def);
        Services.prefs.clearUserPref(saved);
        if (was == def) {
          Services.prefs.clearUserPref(pref);
        } else {
          Services.prefs.setBoolPref(pref, was);
        }
      });
    }
    this.sendErrors();
    this.flushOutbox();
    SendLater.start();
    // Einmal nach der Erstinstallation begrüßen: was halo.spaces ändert und wo
    // die Einstellungen liegen. Windows/Linux: im selben Fenster der Hinweis,
    // dass halo.spaces für macOS gemacht ist (früher ein eigenes Fenster)
    const NOTE_PREF = "extensions.mailcards.platformNoteShown";
    const platformNote = Services.appinfo.OS != "Darwin" && !Services.prefs.getBoolPref(NOTE_PREF, false);
    if (!Services.prefs.getBoolPref(WELCOME_PREF, false) || platformNote) {
      const welcome = !Services.prefs.getBoolPref(WELCOME_PREF, false);
      const noteTimer = setTimeout(async () => {
        const w = Services.wm.getMostRecentWindow("mail:3pane");
        if (w) {
          Services.prefs.setBoolPref(WELCOME_PREF, true);
          if (platformNote) {
            Services.prefs.setBoolPref(NOTE_PREF, true);
          }
          this.openHaloWindow(w, { welcome, platformNote, themeSwitched: await themeSwitched });
        }
      }, 6000);
      this.restorers.push(() => clearTimeout(noteTimer));
    }
    // nach dem Start, wenn der Kalender-Manager bereit ist
    const offlineTimer = setTimeout(() => enableCalendarOffline(), 8000);
    this.restorers.push(() => clearTimeout(offlineTimer));
    // Update gleich beim Start statt erst bei Thunderbirds täglicher Prüfung
    const updateTimer = setTimeout(() => this.autoUpdate(), 20000);
    this.restorers.push(() => clearTimeout(updateTimer));
    this.hookBirthdays();
    renamePersonalBookOnce();
    watchPersonalBook(this.restorers);
    // Fotos aus der macOS-Kontakte-App: kurz nach dem Start und dann stündlich
    MacPhotos.load();
    this.registerIconVars();
    // Unser Stylesheet in alle Thunderbird-Dokumente, für die userChrome.css
    // nicht gilt (Dialoge in Seiten, Unterdialoge, Inhalts-Tabs)
    const docObserver = {
      observe: doc => {
        try {
          const url = doc.documentURI || "";
          if (ThemeSheet.active) {
            ThemeSheet.apply(doc.defaultView);
          }
          // Termin-Details: Fenster so groß, dass alles sichtbar ist
          if (url.startsWith("chrome://calendar/content/calendar-summary-dialog.xhtml") && doc.defaultView) {
            const dlg = doc.defaultView;
            // im selben Ladeschritt direkt nach Thunderbirds eigenem Aufbau (dessen
            // load-Handler steht erst nach DOMContentLoaded fest), also bevor das
            // Fenster erscheint – mit Verzögerung sprang es sichtbar auf die neue Größe
            doc.documentElement.style.minWidth = "480px";
            dlg.addEventListener("DOMContentLoaded", () => {
              dlg.addEventListener("load", () => this.fitSummaryDialog(dlg), { once: true });
            }, { once: true });
          }
          // Termin-/Aufgaben-Fenster: Titel und Beschriftungen ohne Doppelpunkt
          if (url.startsWith("chrome://calendar/content/calendar-event-dialog.xhtml") && doc.defaultView) {
            const dlg = doc.defaultView;
            dlg.addEventListener("load", () => this.tidyEventDialog(dlg), { once: true });
          }
          // Beschreibung eines Termins/einer Aufgabe (Fenster und Tab): Schrift
          // wie die Felder darüber (siehe event-description.css)
          if (url.startsWith("chrome://calendar/content/calendar-item-iframe.xhtml") && doc.defaultView) {
            const iw = doc.defaultView;
            // direkt nach Thunderbirds eigenem onLoad im selben Schritt (dessen
            // load-Handler steht erst nach DOMContentLoaded fest) – per Verzögerung
            // rückten die Felder sichtbar an ihre Apple-Plätze
            // Das Fenster erscheint schon, bevor dieses Formular fertig ist – bis
            // dahin unsichtbar, sonst sieht man die Felder an Thunderbirds Plätzen
            const root = doc.documentElement;
            root.style.visibility = "hidden";
            const reveal = () => root.style.removeProperty("visibility");
            iw.setTimeout(reveal, 2000);
            iw.addEventListener("DOMContentLoaded", () => iw.addEventListener("load", () => {
              try {
                this.styleItemDescription(iw);
                hookDateTimePickers(iw);
                keepDurationAlways(iw);
                appleEventLayout(iw);
                if (iw.parent?.location?.href.startsWith("chrome://calendar/content/calendar-event-dialog.xhtml")) {
                  this.tidyEventDialog(iw.parent);
                }
              } finally {
                reveal();
              }
            }, { once: true }), { once: true });
          }
          // „Teilnehmer einladen“: Beginn/Ende ebenso
          if (url.startsWith("chrome://calendar/content/calendar-event-dialog-attendees.xhtml") && doc.defaultView) {
            const aw = doc.defaultView;
            aw.addEventListener("load", () => aw.setTimeout(() => hookDateTimePickers(aw), 0), { once: true });
          }
          // Dialogfenster als ruhige Karte ohne sichtbare Titelleiste (macOS)
          if (CARD_WINDOWS.some(u => url.startsWith(u)) && doc.defaultView) {
            const cw = doc.defaultView;
            cw.addEventListener("DOMContentLoaded", () => cardWindow(cw), { once: true });
          }
          // Erinnerungen: Fenster so hoch wie die Einträge (Thunderbird merkt
          // sich sonst eine feste Größe – bei einem Eintrag viel Leerraum)
          if (url.startsWith("chrome://calendar/content/calendar-alarm-dialog.xhtml") && doc.defaultView) {
            const dlg = doc.defaultView;
            dlg.addEventListener("load", () => dlg.setTimeout(() => this.fitAlarmDialog(dlg), 200), { once: true });
          }
          if (!/^(chrome:\/\/(messenger|calendar|messenger-newsblog)\/|about:(addressbook|preferences|addons|accountsettings|accountsetup|message|3pane))/.test(url)) {
            return;
          }
          const win = doc.defaultView;
          if (/^about:(3pane|message)/.test(url) && win) {
            win.addEventListener("DOMContentLoaded", () => {
              this.hookMailContext(doc);
              // neu geladene Mailansicht gleich einrichten (Karten, Bilder, …)
              if (url.startsWith("about:3pane")) {
                this.patch(win, 0);
              }
              if (url.startsWith("about:message")) {
                this.hookHeaderAvatar(doc);
              }
              // Nachricht im eigenen Fenster: Knöpfe im Mailkopf zeigen
              // – ebenso, wenn die Mail-Toolbar keine Antworten-Knöpfe hat
              // (eigene Toolbar-Anordnung), sonst fehlten sie ganz
              let replyInToolbar = false;
              try {
                const { getState } = ChromeUtils.importESModule("resource:///modules/CustomizationState.mjs");
                replyInToolbar = getState().mail?.includes("reply") ?? false;
              } catch {}
              if (url.startsWith("about:message") &&
                  (!replyInToolbar || win.top?.document.documentElement.getAttribute("windowtype") == "mail:messageWindow")) {
                doc.documentElement.setAttribute("mc-standalone", "true");
              }
            }, { once: true });
          }
          if (!win || win.__mcSheet || ThemeSheet.active) {
            return; // mit theme.css ist userChrome.css nicht nötig
          }
          // Dokumente in Chrome-Docshells bekommen userChrome.css schon selbst
          if (win.docShell?.itemType == Ci.nsIDocShellTreeItem.typeChrome) {
            return;
          }
          const file = Services.dirsvc.get("ProfD", Ci.nsIFile);
          file.append("chrome");
          file.append("userChrome.css");
          if (!file.exists()) {
            return;
          }
          const uri = Services.io.newFileURI(file).spec;
          win.windowUtils.loadSheetUsingURIString(uri, win.windowUtils.USER_SHEET);
          win.__mcSheet = uri;
        } catch (e) {
          log("doc sheet error", String(e).slice(0, 160));
        }
      },
    };
    Services.obs.addObserver(docObserver, "document-element-inserted");
    this.restorers.push(() => Services.obs.removeObserver(docObserver, "document-element-inserted"));
    const onPhotos = () => this.avatars.byEmail.clear(); // neue Fotos beim nächsten Anzeigen nutzen
    MacPhotos.listeners.add(onPhotos);
    const t1 = setTimeout(() => MacPhotos.sync(), 20000);
    const t2 = setInterval(() => MacPhotos.sync(), 3600 * 1000);
    this.restorers.push(() => {
      clearTimeout(t1);
      clearInterval(t2);
      MacPhotos.listeners.delete(onPhotos);
    });
    this.syncGmailLabels();
    // Thunderbird lädt die Mailansicht (about:3pane) beim Start oft erst,
    // nachdem die Erweiterung schon läuft – darum jedes Hauptfenster
    // beobachten und seine Tabs wiederholt nach neuen Mailansichten absuchen.
    ExtensionSupport.registerWindowListener("mail-cards", {
      chromeURLs: ["chrome://messenger/content/messenger.xhtml"],
      onLoadWindow: w => this.watchMainWindow(w),
    });
    this.watchChatVariant();
    // Verfassen-Fenster: Symbolleiste nur mit Symbolen, sobald Beschriftungen
    // gekürzt würden (siehe watchComposeToolbar)
    const composeCleanups = new Set();
    ExtensionSupport.registerWindowListener("mail-cards-compose", {
      chromeURLs: ["chrome://messenger/content/messengercompose/messengercompose.xhtml"],
      onLoadWindow: w => {
        this.watchComposeToolbar(w, composeCleanups);
        try {
          hookComposeApple(w, composeCleanups);
        } catch (e) {
          log("compose apple error", e);
        }
        try {
          UndoSend.hook(w, composeCleanups);
          SendLater.hook(w, composeCleanups);
        } catch (e) {
          log("undo send hook error", e);
        }
        try {
          installDialogBox(w, { push: fn => composeCleanups.add(fn) });
        } catch (e) {
          log("dialog box error", e);
        }
      },
    });
    this.restorers.push(() => {
      ExtensionSupport.unregisterWindowListener("mail-cards-compose");
      for (const cleanup of [...composeCleanups]) {
        try {
          cleanup();
        } catch {}
      }
    });
  }

  // Chat-Stil „Thunderbird“ (mail): im Dunkelmodus die mitgelieferte Variante
  // „Dark“ statt der weißen „Light“ – für Vorschau in den Einstellungen und
  // Unterhaltungen. Nur der Standardwert wird umgestellt; wer eine Variante
  // oder einen anderen Stil gewählt hat, behält ihn.
  watchChatVariant() {
    const VARIANT = "messenger.options.messagesStyle.variant";
    const defaults = Services.prefs.getDefaultBranch("");
    let original;
    try {
      original = defaults.getCharPref(VARIANT);
    } catch {
      return;
    }
    const sync = w => {
      const theme = Services.prefs.getCharPref("messenger.options.messagesStyle.theme", "mail");
      const dark = theme == "mail" && w.matchMedia("(prefers-color-scheme: dark)").matches;
      const want = dark ? "Dark" : original;
      if (defaults.getCharPref(VARIANT) != want) {
        defaults.setCharPref(VARIANT, want);
        debugLog("Chat-Variante (Standard)", want);
      }
    };
    const queries = new Map();
    // anderer Stil gewählt: Standard zurück, sonst fehlte dort die Variante
    const themeObserver = () => {
      const w = Services.wm.getMostRecentWindow("mail:3pane");
      if (w) {
        sync(w);
      }
    };
    Services.prefs.addObserver("messenger.options.messagesStyle.theme", themeObserver);
    ExtensionSupport.registerWindowListener("mail-cards-chatvariant", {
      chromeURLs: ["chrome://messenger/content/messenger.xhtml"],
      onLoadWindow: w => {
        const mq = w.matchMedia("(prefers-color-scheme: dark)");
        const onChange = () => sync(w);
        mq.addEventListener("change", onChange);
        queries.set(w, () => mq.removeEventListener("change", onChange));
        w.addEventListener("unload", () => queries.delete(w), { once: true });
        sync(w);
      },
    });
    this.restorers.push(() => {
      ExtensionSupport.unregisterWindowListener("mail-cards-chatvariant");
      Services.prefs.removeObserver("messenger.options.messagesStyle.theme", themeObserver);
      for (const remove of queries.values()) {
        try {
          remove();
        } catch {}
      }
      queries.clear();
      defaults.setCharPref(VARIANT, original);
    });
  }

  // Schmale Verfassen-Fenster: Thunderbird kürzt die Beschriftungen der
  // Symbolleiste („Se…“, sehr schmal mitten im Buchstaben). Wie Apple Mail
  // zeigt die Leiste dann nur Symbole (Attribut „mc-icons-only“, spaces.css;
  // Tooltips nennen die Knöpfe). Die Grenze hängt von der Sprache ab
  // („Verschlüsseln“ ist breiter als „Encrypt“), deshalb wird gemessen statt
  // eine feste Breite zu nehmen: nur Symbole, sobald eine Beschriftung oder
  // die Leiste überläuft; Beschriftungen zurück, sobald die Leiste so breit
  // ist, wie sie dafür sein muss.
  watchComposeToolbar(w, cleanups) {
    const d = w.document;
    const bar = d.getElementById("composeToolbar2");
    const box = d.getElementById("compose-toolbox");
    if (!bar || bar.__mcIconsWatched) {
      return;
    }
    bar.__mcIconsWatched = true;
    const ATTR = "mc-icons-only";
    let need = 0; // nötige Breite der Leiste für die Beschriftungen
    const update = () => {
      if (w.closed || !bar.isConnected) {
        return;
      }
      // Modus „nur Text“ bzw. „nur Symbole“ aus „Anpassen“ bleibt unberührt
      const mode = box?.getAttribute("mode");
      if (mode == "text" || mode == "icons") {
        bar.removeAttribute(ATTR);
        need = 0;
        return;
      }
      if (bar.hasAttribute(ATTR)) {
        if (bar.clientWidth >= need) {
          bar.removeAttribute(ATTR);
          // im nächsten Bild neu messen, falls es doch nicht passt
          w.requestAnimationFrame(update);
        }
        return;
      }
      let short = Math.max(0, bar.scrollWidth - bar.clientWidth);
      for (const button of bar.querySelectorAll(":scope > toolbarbutton")) {
        const text = button.querySelector(".toolbarbutton-text");
        if (!text?.getClientRects().length) {
          continue;
        }
        short += Math.max(0, text.scrollWidth - text.clientWidth, button.scrollWidth - button.clientWidth);
      }
      if (short > 1) {
        need = bar.clientWidth + short + 8;
        bar.setAttribute(ATTR, "true");
      }
    };
    const reset = () => {
      bar.removeAttribute(ATTR);
      need = 0;
      update();
    };
    const ro = new w.ResizeObserver(() => update());
    ro.observe(bar);
    // andere Knöpfe („Anpassen“) oder anderer Modus: neu messen
    const mo = new w.MutationObserver(reset);
    mo.observe(bar, { childList: true });
    if (box) {
      mo.observe(box, { attributes: true, attributeFilter: ["mode"] });
    }
    const cleanup = () => {
      ro.disconnect();
      mo.disconnect();
      cleanups.delete(cleanup);
      if (!w.closed) {
        bar.removeAttribute(ATTR);
        delete bar.__mcIconsWatched;
      }
    };
    cleanups.add(cleanup);
    w.addEventListener("unload", cleanup, { once: true });
    update();
  }

  // Kleinste Fensterbreite je Space: beim Verkleinern schrumpft nur ein
  // Bereich mit (die Mail, die Kalenderansicht, der Einstellungsinhalt …),
  // alle anderen behalten ihre Breite. Also darf das Fenster nur so schmal
  // werden, bis dieser Bereich seine Mindestbreite (CSS) erreicht – dann
  // überlappt nichts und nichts wird abgeschnitten.
  hookMinWindowWidth(w) {
    const d = w.document;
    const root = d.documentElement;
    const tabmail = d.getElementById("tabmail");
    const FLEX = ["messagePane", "detailsPane", "preferencesContainer", "calendarDisplayBox", "conversationsBox"];
    // Elemente im Hauptdokument nur im passenden Tab (ausgeblendete Tabs behalten
    // ihre Breite: der Kalender maß sonst 560×0 px und sperrte die Fensterbreite)
    const MODE = { calendarDisplayBox: ["calendar", "tasks"], conversationsBox: ["chat"] };
    const shown = el => {
      const r = el?.getBoundingClientRect();
      return !!r && r.width > 0 && r.height > 0 && (el.checkVisibility?.() ?? true);
    };
    let observed = new Set();
    const ro = new w.ResizeObserver(() => update());
    // { width, min, watch }: Breite und Mindestbreite des Bereichs, der beim
    // Verkleinern schrumpft, und die zu beobachtenden Elemente
    const measure = () => {
      const tab = tabmail?.currentTabInfo;
      const mode = tab?.mode?.name;
      const bd = tab?.browser?.contentDocument;
      if (mode == "addressBookTab" && bd?.getElementById("cardsPane")) {
        // Adressbuch: ohne Auswahl ist die Detailspalte ausgeblendet – dann zählt
        // der freie Platz rechts der Liste; das Ein- und Ausblenden meldet der
        // ResizeObserver (kein resize-Ereignis)
        const cw = bd.defaultView;
        const dp = bd.getElementById("detailsPane"), cp = bd.getElementById("cardsPane");
        const watch = [dp, cp].filter(Boolean);
        const min = (dp && parseFloat(cw.getComputedStyle(dp).minWidth)) || 560;
        if (shown(dp)) {
          return { width: dp.getBoundingClientRect().width, min: parseFloat(cw.getComputedStyle(dp).minWidth) || 0, watch };
        }
        if (!shown(cp)) {
          return { watch };
        }
        if (bd.body.classList.contains("layout-table")) {
          return { width: cp.getBoundingClientRect().width, min, watch };
        }
        return { width: cw.innerWidth - cp.getBoundingClientRect().right, min, watch };
      }
      const docs = [tab?.chromeBrowser?.contentDocument, bd, d].filter(Boolean);
      for (const doc of docs) {
        for (const id of FLEX) {
          if (doc == d && MODE[id] && !MODE[id].includes(mode)) {
            continue;
          }
          const el = doc.getElementById(id);
          if (shown(el)) {
            const min = parseFloat(el.ownerDocument.defaultView.getComputedStyle(el).minWidth) || 0;
            return { width: el.getBoundingClientRect().width, min, watch: [el] };
          }
        }
      }
      return { watch: [] };
    };
    let later = null;
    const update = () => {
      try {
        // während einer Seitenleisten-Animation nicht rechnen: das Setzen am
        // Fenster würde jedes Bild das ganze Fenster neu gestalten (Ruckeln)
        if (d.getElementById("today-pane-panel")?.__mcAnimating || w.__mcSpacesAnimating) {
          w.clearTimeout(later);
          later = w.setTimeout(update, 350);
          return;
        }
        const { width, min, watch } = measure();
        const next = new Set(watch);
        for (const el of observed) {
          if (!next.has(el)) {
            ro.unobserve(el);
          }
        }
        for (const el of next) {
          if (!observed.has(el)) {
            ro.observe(el);
          }
        }
        observed = next;
        // ohne sichtbares Element keine Mindestbreite (nie innerWidth sperren)
        if (width === undefined) {
          root.style.removeProperty("min-width");
          return;
        }
        const slack = Math.max(0, width - min);
        // nie unter 800 px (dann wäre schon die Toolbar zu eng)
        let value = Math.max(800, Math.round(w.innerWidth - slack));
        // Chat: Kontaktspalte + Chat-Knöpfe + kleinstes Suchfeld (40 px) + was
        // rechts der Suche liegt müssen nebeneinander passen
        if (tabmail?.currentTabInfo?.mode?.name == "chat") {
          const lp = d.getElementById("listPaneBox")?.getBoundingClientRect();
          const tb = d.getElementById("chat-view-toolbox")?.getBoundingClientRect();
          const s = d.querySelector('#unifiedToolbarContent > li[item-id="search-bar"]')?.getBoundingClientRect();
          if (lp?.width && tb?.width && s?.width) {
            value = Math.max(value, Math.ceil(lp.right + 12 + tb.width + 12 + 40 + (w.innerWidth - s.right)));
          }
        }
        // nie breiter als der Bildschirm: auf kleinen Bildschirmen (oder mit
        // Today-Pane) ließe sich das Fenster sonst nicht mehr einpassen
        const screenWidth = w.screen?.availWidth;
        if (screenWidth > 0) {
          value = Math.min(value, Math.max(800, screenWidth - (w.outerWidth - w.innerWidth)));
        }
        // nur bei echter Änderung schreiben (jedes Setzen gestaltet das Fenster neu)
        if (Math.abs((parseFloat(root.style.minWidth) || 0) - value) >= 2) {
          root.style.minWidth = `${value}px`;
        }
      } catch (e) {
        log("min window width error", e);
      }
    };
    const onTab = () => w.setTimeout(update, 300);
    tabmail?.tabContainer?.addEventListener("TabSelect", onTab);
    w.addEventListener("resize", update);
    const timer = w.setTimeout(update, 2000);
    this.restorers.push(() => {
      ro.disconnect();
      w.clearTimeout(timer);
      tabmail?.tabContainer?.removeEventListener("TabSelect", onTab);
      w.removeEventListener("resize", update);
      root.style.removeProperty("min-width");
    });
  }

  // Restorer, der nur so lange lebt wie sein (Inhalts-)Fenster: beim Schließen
  // verworfen – sonst hielte this.restorers das tote Fenster bis zum Beenden fest
  addWinRestorer(win, fn) {
    this.restorers.push(fn);
    if (!win) {
      return;
    }
    let set = this.winRestorers.get(win);
    if (!set) {
      set = new Set();
      this.winRestorers.set(win, set);
      win.addEventListener("unload", () => {
        this.winRestorers.delete(win);
        this.restorers = this.restorers.filter(f => !set.has(f));
      }, { once: true });
    }
    set.add(fn);
  }

  watchMainWindow(w) {
    if (this.mainWindows.has(w)) {
      return;
    }
    this.mainWindows.add(w);
    try {
      installDialogBox(w, { push: fn => this.addWinRestorer(w, fn) });
    } catch (e) {
      log("dialog box error", e);
    }
    // je Fenster (nicht am gemeinsamen Enhancer, sonst wirkt der Knopf im zuletzt
    // geöffneten Fenster): Tooltip des Seitenleisten-Knopfs und Popover „Neu“
    let sidebarTip = null;
    let newPopup = null;
    this.hookMinWindowWidth(w);
    // Leerer Chat: Thunderbird fokussiert den Standardknopf („Get started“)
    // per Skript, Gecko zeigt dann dauerhaft den Fokusring – Fokus behalten
    // (Return löst ihn aus), den Ring aber nur bei Tastaturbedienung zeigen
    const ch = w.chatHandler;
    if (ch && typeof ch._updateFocus == "function" && !ch.__mcFocusHooked) {
      const origFocus = ch._updateFocus;
      ch._updateFocus = function (...args) {
        const res = origFocus.apply(this, args);
        const el = w.document.activeElement;
        if (el?.matches?.(".im-placeholder-screen button") && el.matches(":focus-visible")) {
          el.blur();
          el.focus({ focusVisible: false });
        }
        return res;
      };
      ch.__mcFocusHooked = true;
      this.restorers.push(() => {
        ch._updateFocus = origFocus;
        delete ch.__mcFocusHooked;
      });
    }
    log("main window", { tabs: w.document.getElementById("tabmail")?.tabInfo?.length ?? null });
    // Attribut „mc-mail“ am Hauptfenster, solange ein Mail-Tab vorne ist –
    // userChrome.css färbt Toolbar- und Tab-Leiste nur dann wie Apple Mail.
    // Rechte Kante der Seitenleiste in den übrigen Bereichen (Kalender,
    // Aufgaben, Adressbuch, Chat, Einstellungen) relativ zur Toolbar-Zeile:
    // userChrome.css färbt damit die Zeile darüber im Seitenleisten-Grau.
    const SIDEBARS = {
      calendar: () => w.document.getElementById("calSidebar"),
      tasks: () => w.document.getElementById("calSidebar"),
      chat: () => w.document.getElementById("listPaneBox"),
      addressBookTab: tab => tab.browser?.contentDocument?.getElementById("booksPane"),
      // (die animierte Leiste selbst – ihr Inhalt behält beim Ein-/Ausblenden
      // seine volle Breite)
      preferencesTab: tab => {
        const doc = tab.browser?.contentDocument;
        return doc?.getElementById("pref-category-box") || doc?.getElementById("categories");
      },
      contentTab: tab => {
        const doc = tab.browser?.contentDocument;
        const url = doc?.documentURI || "";
        return url.startsWith("about:addons") ? doc.getElementById("sidebar")
          : url.startsWith("about:accountsettings") ? doc.getElementById("accountTreeBox")
          : null;
      },
    };
    // Bereiche-Leiste ausgeblendet: Thunderbird zeigt unten links einen Knopf zum
    // Einblenden – die Statusleiste beginnt dann rechts davon statt darunter
    const updateStatusMin = () => {
      const d = w.document;
      const status = d.getElementById("status-bar");
      const reveal = d.getElementById("spacesToolbarReveal");
      if (!status) {
        return;
      }
      const sr = status.getBoundingClientRect();
      // Thunderbirds Knopf bzw. unser eigener (#mcSpacesToggle), wenn er über der Statusleiste liegt
      const min = [reveal, d.getElementById("mcSpacesToggle")].reduce((m, b) => {
        const rr = b && !b.hidden ? b.getBoundingClientRect() : null;
        return rr?.width && rr.bottom > sr.top && rr.top < sr.bottom ? Math.max(m, Math.round(rr.right - sr.left + 8)) : m;
      }, 0);
      setVar(status, "--mc-status-min", `${Math.max(0, min)}px`);
    };
    this.statusMinUpdaters ??= new Set();
    this.statusMinUpdaters.add(updateStatusMin);
    this.restorers.push(() => {
      this.statusMinUpdaters?.delete(updateStatusMin);
      const status = w.document.getElementById("status-bar");
      status?.style.removeProperty("--mc-status-min");
      status?.style.removeProperty("--mc-status-side");
    });
    const updateSideEdge = () => {
      // während die Bereiche-Leiste animiert, nichts ans Fenster schreiben –
      // jede Variable dort kostet ein komplettes Neuberechnen (25–40 ms);
      // am Ende der Animation wird einmal ausgerichtet
      if (w.__mcSpacesAnimating) {
        return;
      }
      const d = w.document;
      const tab = d.getElementById("tabmail")?.currentTabInfo;
      const el = SIDEBARS[tab?.mode?.name]?.(tab);
      const row = d.getElementById("unifiedToolbarContainer");
      if (!el || !row) {
        barTarget(d).style.removeProperty("--mc-side-right");
        d.getElementById("status-bar")?.style.removeProperty("--mc-status-side");
        updateStatusMin();
        // Tabs ohne eigene Seitenleiste (globale Suche, sonstige Inhalts-Tabs):
        // Abstandhalter nicht auf dem Wert des zuletzt besuchten Bereichs
        // lassen – Knöpfe und Suchfeld beginnen rechts vom Seitenleisten-Knopf
        // (gemessen nach dem Entfernen von --mc-side-right, also an seinem
        // Platz in diesem Tab)
        const content = row && d.getElementById("unifiedToolbarContent");
        const first = content?.querySelector(':scope > li[item-id="spacer"]') || content;
        const pinned = rectOf(d.getElementById("spacesPinnedButton"));
        if (first && pinned?.width) {
          const start = rectOf(first).left;
          setBarVar(d, "--mc-tab-offset", `${Math.max(0, Math.round(pinned.right + 12 - start))}px`);
        }
        return;
      }
      const inContent = el.ownerDocument != d;
      const shift = inContent ? rectOf(tab.browser).left : 0;
      const r = rectOf(el);
      const rowLeft = rectOf(row).left;
      const right = r.width ? shift + r.right - rowLeft : 0;
      setBarVar(d, "--mc-side-right", `${Math.max(0, Math.round(right))}px`);
      // Statusleiste wie in der Mail: Inhalt (Online-Symbol …) beginnt rechts der
      // Seitenleiste dieses Bereichs statt am Fensterrand
      const status = d.getElementById("status-bar");
      if (status && tab.mode.name != "mail3PaneTab") {
        const sl = rectOf(status).left;
        setVar(status, "--mc-status-side", `${Math.max(0, Math.round(r.width ? shift + r.right - sl : 0))}px`);
      }
      updateStatusMin();
      // Wo die Knöpfe beginnen (erster Abstandhalter der Toolbar): im
      // Adressbuch über der Kontaktkarte rechts der Liste – wie in der Mail
      // über der geöffneten Nachricht –, sonst neben der Seitenleiste.
      const content = d.getElementById("unifiedToolbarContent");
      // Bezug: erster Abstandhalter (davor liegen ausgeblendete Knöpfe anderer Bereiche)
      const start = rectOf(content?.querySelector(':scope > li[item-id="spacer"]') || content)?.left ?? rowLeft;
      let edge = shift + (r.width ? r.right : 0) + 12;
      // erste Knöpfe in jedem Bereich an derselben Stelle wie in der Mail
      // (Kalender und Aufgaben: „+“ wie in Apple Kalender gleich rechts der
      // Seitenleiste)
      const ownEdge = tab.mode.name == "calendar";
      if (this.mcButtonsLeft && !ownEdge) {
        edge = this.mcButtonsLeft;
      }
      if (tab.mode.name == "addressBookTab") {
        const cards = el.ownerDocument.getElementById("cardsPane");
        // (beim Abschalten/Update wieder abmelden – sonst richtet die alte
        // Fassung bis zum Neustart weiter aus und kämpft mit der neuen)
        if (cards && cards.__mcObserver?.owner !== this) {
          const ro = new el.ownerDocument.defaultView.ResizeObserver(() => updateSideEdge());
          ro.observe(cards);
          ro.observe(el); // Adressbuchliste ein-/ausgeblendet: Kontaktliste rückt
          el.ownerDocument.getElementById("booksSplitter") && ro.observe(el.ownerDocument.getElementById("booksSplitter"));
          cards.__mcObserver = { owner: this, ro };
          // am Adressbuch-Fenster: beim Schließen des Tabs verworfen (hielte sonst
          // das geschlossene Adressbuch samt Kontaktliste bis zum Beenden fest)
          this.addWinRestorer(el.ownerDocument.defaultView, () => {
            ro.disconnect();
            delete cards.__mcObserver;
          });
        }
        // Kontaktliste so breit wie die Mailliste – dann passen Kopfzeile und
        // Knöpfe genau ins selbe Raster
        const shared = el.ownerDocument.getElementById("sharedSplitter");
        // Ziehen am Teiler im Adressbuch: flüssig (währenddessen nicht
        // angleichen), nur so weit, dass Knöpfe und Suche Platz haben; die
        // neue Breite gilt danach auch für die Mailliste
        if (shared && !shared.__mcHooked && typeof shared._updateSize == "function") {
          shared.__mcHooked = true;
          const origUpdate = shared._updateSize;
          shared._updateSize = function (size) {
            const c = rectOf(cards);
            const b = rectOf(tab.browser);
            // (ohne Wert – beim Loslassen – nur die tatsächliche Größe übernehmen)
            if (typeof size == "number" && c && b) {
              const maxRight = rectOf(row).right - toolbarNeed(d);
              // nur am Wachsen hindern – nie unter die jetzige Breite drücken,
              // sonst springen Liste und Kontaktfoto beim Anfassen des Teilers
              size = Math.min(size, Math.max(160, Math.round(c.width), maxRight - (b.left + c.left)));
            }
            return origUpdate.call(this, size);
          };
          const onResizing = () => (shared.__mcDragging = true);
          const onResized = () => {
            if (!shared.__mcDragging) {
              return;
            }
            shared.__mcDragging = false;
            const c = rectOf(cards);
            const b = rectOf(tab.browser);
            if (c?.width && b) {
              this.mcListWidth = Math.round(c.width);
              this.mcButtonsLeft = b.left + c.right + 6;
              this.mcListPending = true; // die Mail übernimmt die Breite beim nächsten Anzeigen
            }
            updateSideEdge();
          };
          shared.addEventListener("splitter-resizing", onResizing);
          shared.addEventListener("splitter-resized", onResized);
          this.addWinRestorer(el.ownerDocument.defaultView, () => {
            shared._updateSize = origUpdate;
            shared.removeEventListener("splitter-resizing", onResizing);
            shared.removeEventListener("splitter-resized", onResized);
            delete shared.__mcHooked;
          });
        }
        // rechte Kante der Kontaktliste dort, wo in der Mail die Mailliste endet –
        // auch bei ausgeblendeter Adressbuchliste (die Liste wird dann breiter)
        const cl = rectOf(cards);
        if (this.mcButtonsLeft && shared && "width" in shared && !shared.__mcDragging && cl && !el.__mcShowing &&
            !el.ownerDocument.body.classList.contains("layout-table")) {
          // … aber nie so breit, dass die Kontaktdetails unter ihre Mindestbreite
          // kämen (mit Today-Pane ist das Adressbuch enger als die Mail – sonst
          // drückte das Raster die Adressbuchliste zusammen)
          const dp = el.ownerDocument.getElementById("detailsPane");
          const detailsMin = (dp && parseFloat(el.ownerDocument.defaultView.getComputedStyle(dp).minWidth)) || 0;
          const room = Math.floor(el.ownerDocument.documentElement.clientWidth - cl.left - detailsMin - 2);
          const want = Math.min(Math.round(this.mcButtonsLeft - 6 - (shift + cl.left)), room);
          if (want >= 160 && Math.abs((shared.width || 0) - want) >= 1) {
            shared.width = want;
          }
        }
        const cr = rectOf(cards);
        // Tabellenansicht: die Liste reicht bis zum Fensterrand – Knöpfe und
        // Suche bleiben an ihrem Platz, die Kopfzeile endet davor, und die
        // Trennlinie entfällt (keine Spaltenkante darunter)
        const table = el.ownerDocument.body.classList.contains("layout-table");
        d.documentElement.toggleAttribute("mc-ab-table", table);
        if (cr?.width && table) {
          setBarVar(d, "--mc-ab-list-right", `${Math.round(edge - 6 - rowLeft)}px`);
        } else if (cr?.width) {
          // Knöpfe nie über der Kontaktliste
          edge = Math.max(this.mcButtonsLeft ? edge : 0, shift + cr.right + 6);
          setBarVar(d, "--mc-ab-list-right", `${Math.round(shift + cr.right - rowLeft)}px`);
        }
      }
      // Aufgaben wie die Mail: Kartenliste so breit wie die Mailliste (die Details
      // rechts nehmen den Rest), darüber Titel/Anzahl, Filter und „…“; die Knöpfe
      // beginnen rechts der Liste
      if (tab.mode.name == "tasks") {
        const side = d.documentElement.hasAttribute("mc-task-side");
        const details = d.getElementById("calendar-task-details-container");
        const taskList = d.documentElement.hasAttribute("mc-task-list") ? d.getElementById("mcTaskCards") : d.getElementById("calendar-task-tree");
        if (details?.__mcDragged) {
          // von Hand gezogen: diese Listenbreite gilt jetzt auch für Mail und Adressbuch
          delete details.__mcDragged;
          const lr0 = rectOf(taskList);
          if (lr0?.width) {
            this.mcListWidth = Math.round(lr0.width);
            this.mcButtonsLeft = lr0.right + 6;
            this.mcListPending = true;
          }
        }
        if (side && details && this.mcButtonsLeft && !details.__mcDragging) {
          const dr = rectOf(details);
          const lr = rectOf(taskList);
          // rechte Kante des Inhaltsbereichs (nicht der Details oder ihres Rahmens –
          // die wachsen mit der neuen Breite, das schaukelte sich auf)
          const tp = rectOf(d.getElementById("today-pane-panel"));
          const right = Math.min(rectOf(d.getElementById("tabmail-container"))?.right || Infinity,
            tp?.width ? tp.left : Infinity, w.innerWidth);
          if (dr.width && lr?.width && right) {
            const splitW = Math.max(0, dr.left - lr.right);
            const want = Math.round(right - (this.mcButtonsLeft - 6) - splitW);
            const max = Math.round(right - lr.left - splitW - 280); // Liste mindestens 280 px
            const width = Math.max(360, Math.min(want, max));
            if (Math.abs(dr.width - width) >= 1) {
              details.style.width = `${width}px`;
            }
          }
        }
        const lr = rectOf(taskList);
        if (side && lr?.width) {
          edge = Math.max(edge, lr.right + 6);
          setBarVar(d, "--mc-task-list-right", `${Math.round(lr.right - rowLeft)}px`);
        } else {
          setBarVar(d, "--mc-task-list-right", `${Math.round(edge - 6 - rowLeft)}px`);
        }
        d.documentElement.toggleAttribute("mc-task-table", !side);
        // Aktionsknöpfe gleich rechts vom „+“
        const plus = [...d.querySelectorAll('#unifiedToolbarContent > li:is([item-id="new-task"], [item-id="new-event"])')]
          .find(li => rectOf(li).width);
        const pr = rectOf(plus?.querySelector("button"));
        if (pr?.width) {
          setVar(d.getElementById("task-actions-toolbar"), "--mc-ta-left", `${Math.round(pr.right + 8)}px`);
        }
      }
      const toggle = rectOf(d.getElementById("spacesPinnedButton"));
      if (toggle?.width) {
        edge = Math.max(edge, toggle.right + 12);
      }
      // Chat: Knöpfe und Suche dürfen sich nie überlagern – erst die Suche bis
      // 160 px kürzen, dann die Knöpfe nach links rücken (höchstens bis neben
      // die Kontaktspalte), zuletzt die Suche bis 40 px kürzen (das Suchfeld
      // steht rechtsbündig, seine rechte Kante bleibt beim Kürzen stehen)
      if (tab.mode.name == "chat") {
        const tb = rectOf(d.getElementById("chat-view-toolbox"));
        const s = rectOf(d.querySelector('#unifiedToolbarContent > li[item-id="search-bar"]'));
        if (tb?.width && s?.width) {
          const sideEdge = Math.max(shift + (r.width ? r.right : 0) + 12, toggle?.width ? toggle.right + 12 : 0);
          edge = Math.max(sideEdge, Math.min(edge, s.right - 12 - 160 - tb.width));
          setBarVar(d, "--mc-chat-search-max", `${Math.max(40, Math.floor(s.right - (edge + tb.width) - 12))}px`);
        }
      }
      setBarVar(d, "--mc-tab-offset", `${Math.max(0, Math.round(edge - start))}px`);
      // dieselbe Kante im Fenster und die Toolbar-Zeile – für Leisten, die
      // in diese Zeile verlegt werden (Chat)
      const rr = rectOf(row);
      // nur an den Leisten, die in die Toolbar-Zeile verlegt werden
      const rowVar = (name, value) => {
        for (const id of ["chat-view-toolbox", "viewToggle", "task-addition-box", "task-actions-toolbar"]) {
          setVar(d.getElementById(id), name, value);
        }
      };
      rowVar("--mc-caption-w", `${captionWidth(d)}px`);
      // Minikalender der Today-Pane so breit wie der in der Kalenderleiste
      const calMm = d.getElementById("calMinimonth");
      if (calMm?.offsetWidth) {
        setVar(d.getElementById("today-minimonth"), "--mc-mm-w", `${calMm.offsetWidth}px`);
      }
      rowVar("--mc-tab-left", `${Math.round(edge)}px`);
      // linke Kante des Suchfelds: der Hinweis „schreibgeschützter Kalender“
      // in der Toolbar-Zeile endet davor
      const sb = rectOf(d.querySelector('#unifiedToolbarContent > li[item-id="search-bar"]:not([hidden])'));
      if (sb?.width) {
        rowVar("--mc-search-left", `${Math.round(sb.left)}px`);
        // Aufgaben: der Hinweis endet vor den Aktionsknöpfen (stehen vor dem Suchfeld)
        const ta = tab.mode.name == "tasks" ? rectOf(d.getElementById("task-actions-toolbar")) : null;
        if (ta?.width) {
          setVar(d.getElementById("task-addition-box"), "--mc-search-left", `${Math.round(ta.left)}px`);
        }
      }
      rowVar("--mc-row-top", `${Math.round(rr.top)}px`);
      rowVar("--mc-row-h", `${Math.round(rr.height)}px`);
      const toggle2 = d.getElementById("viewToggle");
      if (toggle2?.offsetWidth) {
        setVar(toggle2, "--mc-toggle-half", `${Math.ceil(toggle2.offsetWidth / 2)}px`);
        // Suchfeld im Kalender nie unter der mittigen Umschaltung (Windows:
        // Fenstertasten und ≡-Menü nehmen rechts Platz weg)
        const search = rectOf(d.querySelector('#unifiedToolbarContent > li[item-id="search-bar"]'));
        if (search?.width) {
          const tr = rectOf(toggle2);
          setBarVar(d, "--mc-cal-search-max", `${Math.max(40, Math.floor(search.right - tr.right - 12))}px`);
        }
      }
    };
    this.restorers.push(() => squeezeToolbar(w.document, () => true));
    this.sideEdgeUpdaters ??= new Set();
    this.sideEdgeUpdaters.add(updateSideEdge);
    const sideRO = new w.ResizeObserver(updateSideEdge);
    // (chat-view-toolbox: andere Breite der Chat-Knöpfe, z. B. neuer Statustext)
    for (const id of ["calSidebar", "listPaneBox", "tabmail-container", "chat-view-toolbox"]) {
      const el = w.document.getElementById(id);
      if (el) {
        sideRO.observe(el);
      }
    }
    this.restorers.push(() => sideRO.disconnect());

    // userChrome.css gilt nicht für Seiten in eigenen Browsern (Adressbuch,
    // Einstellungen, Add-ons). Dort dasselbe Stylesheet aus dem Profil als
    // User-Sheet laden, damit Farben und Regeln überall gleich sind.
    const CONTENT_PAGES = /^about:(addressbook|preferences|addons|accountsettings|accountsetup)/;
    const sheetURI = () => {
      if (ThemeSheet.active) {
        return ThemeSheet.uri;
      }
      const file = Services.dirsvc.get("ProfD", Ci.nsIFile);
      file.append("chrome");
      file.append("userChrome.css");
      return file.exists() ? Services.io.newFileURI(file).spec : null;
    };
    // Initialen wie Apple Kontakte: Vor- und Nachname → zwei Buchstaben
    // („AW“), sonst die ersten zwei Wörter des Namens, bei einem Wort einer.
    const firstLetter = word =>
      Array.from((word || "").normalize().replaceAll(/[^\p{Letter}\p{Nd}]+/gu, ""))[0] || "";
    const initialOf = (name, card) => {
      const first = firstLetter(card?.firstName);
      const last = firstLetter(card?.lastName);
      if (first && last) {
        return (first + last).toUpperCase();
      }
      const words = (name || "").normalize().split(/\s+/).map(firstLetter).filter(Boolean);
      return words.slice(0, 2).join("").toUpperCase();
    };
    // Firma statt Person (wie Apple Kontakte): als Firma markiert (iCloud:
    // X-ABShowAs:COMPANY) oder ohne Vor-/Nachname, aber mit Firmenname
    const isCompany = card => {
      if (!card || card.isMailList) {
        return false;
      }
      let props = null;
      try {
        props = card.supportsVCard ? card.vCardProperties : null;
      } catch {}
      const showAs = String(props?.getFirstValue("x-abshowas") || "").toUpperCase();
      if (showAs == "COMPANY") {
        return true;
      }
      const prop = name => {
        try {
          return card.getProperty(name, "") || "";
        } catch {
          return "";
        }
      };
      const org = (props && [props.getFirstValue("org")].flat()[0]) || prop("Company");
      return !!org && !card.firstName && !card.lastName;
    };
    const COMPANY_AVATAR = "resource://mailcards/icons/company-avatar.svg";
    // neuer Kontakt noch ohne Namen: Person auf dem Verlauf statt Initialen
    const PERSON_AVATAR = "resource://mailcards/icons/person-avatar.svg";
    // großes Bild ohne Foto: Initialen auf dem Verlauf der Liste (statt
    // Thunderbirds Umriss-Figur)
    const initialsImage = text => {
      const esc = String(text).replace(/[<>&"']/g, ch => `&#${ch.charCodeAt(0)};`);
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B4CAE4"/><stop offset="1" stop-color="#8A97C5"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><text x="50" y="50" dy="0.35em" text-anchor="middle" fill="#fff" font-family="-apple-system, BlinkMacSystemFont, system-ui, sans-serif" font-weight="600" font-size="44">${esc}</text></svg>`;
      return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    };
    // Kontaktfotos, die sich nicht laden lassen (z. B. verwaiste Foto-Datei),
    // zeigen sonst den Ersatztext „Profile picture …“. Dann wie bei Kontakten
    // ohne Foto die Initialen anzeigen.
    const fixAvatar = (el, name, card) => {
      const img = el.shadowRoot?.querySelector("img");
      const letters = el.shadowRoot?.querySelector("span");
      // Zeilen der Kontaktliste werden beim Scrollen für andere Kontakte
      // wiederverwendet: den Handler des vorigen Kontakts zuerst entfernen,
      // sonst schreibt er dessen Initialen in diese Zeile
      if (img && el.__mcFallback) {
        img.removeEventListener("error", el.__mcFallback);
        el.__mcFallback = null;
      }
      if (!img || !letters || !img.getAttribute("src") || el.classList.contains("is-mail-list")) {
        return;
      }
      const fallback = () => {
        if (img.hidden || !img.getAttribute("src")) {
          return;
        }
        img.hidden = true;
        letters.textContent = initialOf(typeof name == "function" ? name() : name, card);
        letters.hidden = false;
      };
      // kein Ersatztext „Profile picture …“, auch nicht während des Ladens
      img.removeAttribute("data-l10n-id");
      img.removeAttribute("data-l10n-args");
      img.alt = "";
      if (img.complete && img.naturalWidth == 0) {
        fallback();
      } else {
        el.__mcFallback = fallback;
        img.addEventListener("error", fallback, { once: true });
      }
    };
    const hookAvatars = cw => {
      const restorers = { push: fn => this.addWinRestorer(cw, fn) };
      const Avatar = cw.customElements?.get("contact-avatar");
      if (!Avatar || Avatar.prototype.__mcFix) {
        return;
      }
      const orig = Avatar.prototype.setData;
      Avatar.prototype.setData = function (opts = {}) {
        const result = orig.call(this, opts);
        const c = opts.card;
        const name = c?.displayName || c?.primaryEmail || c?.name || c?.email || opts.recipient;
        const photoURL = c?.photoURL || "";
        if (c && !c.isMailList && !photoURL.startsWith("data:")) {
          const local = MacPhotos.lookup([c.primaryEmail, ...(c.emailAddresses || [])], c.displayName || opts.recipient);
          const img = this.shadowRoot?.querySelector("img");
          const span = this.shadowRoot?.querySelector("span");
          if (local && img && span) {
            img.src = MacPhotos.fileURL(local);
            img.hidden = false;
            span.hidden = true;
          }
        }
        // ohne Foto: zwei Initialen statt Thunderbirds einem Buchstaben,
        // bei Firmen ein Gebäude (Bild über CSS, Klasse mc-company)
        const letters = this.shadowRoot?.querySelector("span");
        if (letters && !letters.hidden && !c?.isMailList) {
          if (isCompany(c)) {
            letters.textContent = "";
            this.classList.add("mc-company");
          } else {
            const text = initialOf(opts.recipient || name, c);
            if (text) {
              letters.textContent = text;
            }
          }
        }
        fixAvatar(this, opts.recipient || name, c);
        // Kartenansicht wie macOS-Kontakte: nur Name bzw. Firma, nie die E-Mail-Adresse
        // (zweite Zeile: Firma; ohne Namen steht die Firma oben, nur ohne beides die Adresse)
        const row = this.closest?.('tr[is="ab-card-row"]');
        if (row?.address && c && !c.isMailList) {
          // Firma: vCard ORG (Thunderbird 158 füllt „Company“ nicht mehr), sonst die alte Eigenschaft
          let company = "";
          try {
            const org = c.supportsVCard ? c.vCardProperties?.getFirstValue("org") : null;
            company = String((Array.isArray(org) ? org[0] : org) || c.getProperty?.("Company", "") || "").trim();
          } catch {}
          const nameEl = row.querySelector(".ab-card-first-line .name");
          // ohne Namen erzeugt Thunderbird ihn aus der Adresse („nur.firma“)
          const named = !!(c.displayName || c.firstName || c.lastName);
          if (!named && nameEl) {
            nameEl.textContent = company || c.primaryEmail || nameEl.textContent;
            company = "";
          }
          row.address.textContent = company;
          row.classList.toggle("mc-one-line", !company);
        }
        return result;
      };
      Avatar.prototype.__mcFix = true;
      restorers.push(() => {
        Avatar.prototype.setData = orig;
        delete Avatar.prototype.__mcFix;
      });
      // Großes Foto in Detailansicht und Bearbeiten: Foto aus der macOS-Kontakte-App,
      // wenn iCloud nur den Link hat; ohne Foto (oder wenn es sich nicht laden
      // lässt) wie in der Liste die Initialen bzw. bei Firmen das Gebäude
      const PLACEHOLDER = "chrome://messenger/skin/icons/new/compact/user.svg";
      const hookPhoto = (photo, info) => {
        if (!photo) {
          return;
        }
        const generate = () => {
          const { card, name, first, last, person } = info();
          const text = initialOf(name, { firstName: first ?? card?.firstName, lastName: last ?? card?.lastName });
          const url = card && isCompany(card) ? COMPANY_AVATAR : text ? initialsImage(text) : person ? PERSON_AVATAR : "";
          if (url && url != photo.getAttribute("src")) {
            photo.__mcGenerated = url;
            photo.src = url;
          }
        };
        const fixPhoto = () => {
          const { card } = info();
          const src = photo.getAttribute("src") || "";
          if (src && src != PLACEHOLDER && src != photo.__mcGenerated) {
            // eigenes Foto: nur iCloud-Links durch das lokale Foto ersetzen
            if (card && !/^(data|file|blob):/.test(src)) {
              const local = MacPhotos.lookup([card.primaryEmail, ...(card.emailAddresses || [])], card.displayName);
              if (local) {
                photo.src = MacPhotos.fileURL(local);
              }
            }
            return;
          }
          generate();
        };
        const onError = () => {
          if (photo.getAttribute("src") != photo.__mcGenerated) {
            generate();
          }
        };
        photo.addEventListener("error", onError);
        const mo = new cw.MutationObserver(fixPhoto);
        mo.observe(photo, { attributes: true, attributeFilter: ["src"] });
        fixPhoto();
        restorers.push(() => {
          mo.disconnect();
          photo.removeEventListener("error", onError);
        });
        return fixPhoto;
      };
      hookPhoto(cw.document.getElementById("viewContactPhoto"), () => {
        const card = cw.detailsPane?.currentCard;
        return { card, name: card?.displayName || card?.primaryEmail };
      });
      // Bearbeiten: Initialen folgen dem Namen während der Eingabe
      const editHeading = cw.document.getElementById("editContactHeadingName");
      const fixEditPhoto = hookPhoto(cw.document.querySelector("#photoInput .contact-photo"), () => {
        const val = id => cw.document.getElementById(id)?.value?.trim();
        const card = cw.detailsPane?.currentCard;
        const first = val("vcard-n-firstname");
        const last = val("vcard-n-lastname");
        if (card) {
          return { card, name: editHeading?.textContent, first, last };
        }
        // neuer Kontakt: Überschrift ist anfangs der Platzhalter „New Contact“ –
        // Initialen nur aus den Feldern (Anzeigename, Vor-/Nachname, E-Mail)
        const email = cw.document.querySelector('#vcard-email input[type="email"]')?.value?.trim();
        const name = val("vCardDisplayName") || [first, last].filter(Boolean).join(" ") ||
          (email ? email.split("@")[0] : "");
        return { card: null, name, first, last, person: true };
      });
      if (fixEditPhoto && editHeading) {
        const mo = new cw.MutationObserver(fixEditPhoto);
        mo.observe(editHeading, { childList: true, characterData: true, subtree: true });
        restorers.push(() => mo.disconnect());
      }
      // schon angezeigte Fotos ebenfalls prüfen
      for (const el of cw.document.querySelectorAll("contact-avatar")) {
        fixAvatar(el, () =>
          el.closest(".card-container")?.querySelector(".name")?.textContent ||
          cw.document.getElementById("viewContactName")?.textContent || "");
      }
    };

    // Bearbeiten wie Apple Kontakte: sichtbar sind Vor- und Nachname, E-Mail,
    // Telefon und Adressen; leere seltene Felder erst nach „Weitere Felder“,
    // Präfix, zweiter Vorname, Suffix, Spitzname, Anzeigename nach
    // „Weitere Namensfelder“. Was schon ausgefüllt ist, bleibt immer sichtbar.
    const hookEditLayout = cw => {
      const restorers = { push: fn => this.addWinRestorer(cw, fn) };
      // vcard-edit definiert erst edit.mjs am Ende des Dokuments – läuft der
      // erste Aufruf früher, auf die Definition warten statt das Fenster
      // ungepatcht zu lassen
      const EditCard = cw.customElements?.get("vcard-edit");
      if (!EditCard) {
        if (cw.customElements && !cw.__mcLayoutWait) {
          cw.__mcLayoutWait = true;
          cw.customElements.whenDefined("vcard-edit").then(() => {
            cw.__mcLayoutWait = false;
            try {
              hookEditLayout(cw);
            } catch (e) {
              log("contact edit layout error", e);
            }
          });
        }
        return;
      }
      if (EditCard.prototype.__mcLayout) {
        return;
      }
      const OPTIONAL = {
        url: ["url"],
        tz: ["tz"],
        impp: ["impp"],
        "bday-anniversary": ["bday", "anniversary"],
        note: ["note"],
        org: ["title", "role", "org"],
        custom: ["x-custom1", "x-custom2", "x-custom3", "x-custom4"],
      };
      const NAME_PARTS = ["prefix", "middlename", "suffix"];
      const filled = value => [value].flat().some(v => v != null && String(v).trim());
      const moreButton = (onClick) => {
        const b = cw.document.createElement("button");
        b.type = "button";
        b.className = "mc-more-button";
        b.addEventListener("click", onClick);
        return b;
      };
      const label = (b, open, more, fewer) => {
        if (b) {
          b.textContent = tr(open ? fewer : more);
          b.setAttribute("aria-expanded", String(open));
        }
      };
      const markOptional = ve => {
        const entries = ve.vCardProperties?.entries || [];
        for (const [id, keys] of Object.entries(OPTIONAL)) {
          const fs = ve.querySelector(`#addr-book-edit-${id}`);
          fs?.setAttribute("mc-optional", "");
          fs?.toggleAttribute("mc-filled", entries.some(e => keys.includes(e.name) && filled(e.value)));
        }
      };
      const markNames = n => {
        for (const part of NAME_PARTS) {
          const el = n.querySelector(`#n-list-component-${part}`);
          el?.toggleAttribute("mc-filled", filled(el.querySelector("input")?.value));
        }
        const nick = n.querySelector("vcard-nickname");
        nick?.toggleAttribute("mc-filled", filled(nick.querySelector("input")?.value));
      };
      const setNames = (n, open) => {
        if (open) {
          // gleich als Felder zeigen statt Thunderbirds einzelner „+“-Knöpfe
          for (const part of NAME_PARTS) {
            const el = n.querySelector(`#n-list-component-${part}`);
            if (el?.classList.contains("hasButton")) {
              el.querySelector("label").hidden = false;
              el.querySelector("input").hidden = false;
              el.querySelector("button").hidden = true;
              el.classList.remove("hasButton");
            }
          }
        } else {
          markNames(n);
        }
        n.classList.toggle("mc-more", open);
        label(n.__mcButton, open, "More name fields", "Fewer name fields");
      };
      const setMore = (ve, open) => {
        if (!open) {
          markOptional(ve);
        }
        ve.classList.toggle("mc-more", open);
        label(ve.__mcButton, open, "More fields", "Fewer fields");
      };
      const layout = ve => {
        const n = ve.querySelector("#addr-book-edit-n");
        if (!n || !ve.vCardProperties) {
          return;
        }
        markOptional(ve);
        n.__mcButton = moreButton(() => setNames(n, !n.classList.contains("mc-more")));
        n.append(n.__mcButton);
        setNames(n, false);
        if (!ve.__mcButton) {
          ve.__mcButton = moreButton(() => setMore(ve, !ve.classList.contains("mc-more")));
        }
        if (!ve.__mcButton.isConnected) {
          ve.after(ve.__mcButton);
        }
        setMore(ve, false);
      };
      const origUpdate = EditCard.prototype.updateView;
      EditCard.prototype.updateView = function (...args) {
        const result = origUpdate.apply(this, args);
        try {
          layout(this);
        } catch (e) {
          log("contact edit layout error", e);
        }
        return result;
      };
      EditCard.prototype.__mcLayout = true;
      restorers.push(() => {
        EditCard.prototype.updateView = origUpdate;
        delete EditCard.prototype.__mcLayout;
        for (const el of cw.document.querySelectorAll(".mc-more-button")) {
          el.remove();
        }
      });
      for (const ve of cw.document.querySelectorAll("vcard-edit")) {
        layout(ve);
      }
    };

    // Adressbuch: doppelte Kontakte zusammenführen (nur in der Anzeige – an den
    // Kontakten in Google/iCloud ändert sich nichts). Gleich ist, was denselben
    // Namen hat und dieselbe E-Mail-Adresse oder bei einem von beiden keine.
    // Von mehreren gleichen bleibt der vollständigste Eintrag stehen.
    // Ein-/ausschalten im Darstellungsmenü der Kontaktliste.
    const DEDUPE_PREF = "extensions.mailcards.hideDuplicateContacts";
    const dedupeRows = rows => {
      const score = card => {
        let n = 0;
        try {
          n = card.vCardProperties?.entries?.length || 0;
        } catch {}
        // lokal gespeicherte Fotos zeigen sicher an, Web-Adressen (iCloud) oft nicht
        const photo = card.photoURL || "";
        return n + (/^(data|file|moz-icon):/.test(photo) ? 6 : photo ? 1 : 0);
      };
      const norm = t => (t || "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
      const groups = new Map(); // Name → Liste von Clustern { email, best, rows }
      const keep = new Set();
      for (const row of rows) {
        const card = row.card;
        if (!card || card.isMailList) {
          keep.add(row);
          continue;
        }
        // der Name, den die Liste anzeigt (auch Firma, wenn kein Name gesetzt ist)
        let shown = "";
        try {
          shown = row.getText?.("GeneratedName") || "";
        } catch {}
        const name = norm(shown) || norm(card.displayName) ||
          norm(`${card.firstName || ""} ${card.lastName || ""}`);
        const email = norm(card.primaryEmail);
        if (!name) {
          keep.add(row);
          continue;
        }
        const clusters = groups.get(name) || [];
        groups.set(name, clusters);
        let cluster = clusters.find(c => !email || !c.email || c.email == email);
        if (!cluster) {
          cluster = { email, best: row, rows: [row] };
          clusters.push(cluster);
          continue;
        }
        cluster.rows.push(row);
        if (!cluster.email && email) {
          cluster.email = email;
        }
        if (score(card) > score(cluster.best.card)) {
          cluster.best = row;
        }
      }
      for (const clusters of groups.values()) {
        for (const c of clusters) {
          keep.add(c.best);
          // welcher Eintrag stehen bleibt (Auswahl beim Zusammenführen übertragen)
          for (const r of c.rows) {
            r.mcBest = c.best;
          }
          // in welchen Adressbüchern es diesen Kontakt gibt (für die Labels)
          c.best.mcSources = [...new Set(c.rows.map(r => r.directory?.dirName).filter(Boolean))];
        }
      }
      return rows.filter(r => keep.has(r));
    };
    const hookDedupe = cw => {
      const restorers = { push: fn => this.addWinRestorer(cw, fn) };
      const view = cw.cardsPane?.cardsList?.view;
      const Adapter = view?.constructor;
      if (!Adapter?.prototype?.sortBy || Adapter.prototype.__mcDedupe) {
        return;
      }
      const orig = Adapter.prototype.sortBy;
      Adapter.prototype.sortBy = function (column, direction, resort = false) {
        let replaced = false;
        if (Services.prefs.getBoolPref(DEDUPE_PREF, true) && this._rowMap?.length) {
          const old = this._rowMap;
          const rows = dedupeRows(old);
          if (rows.length != old.length) {
            // Das Original liest die Auswahl über die Zeilennummern: sie über
            // die Zeilen auf die neuen Nummern übertragen, sonst rutscht die
            // Markierung auf den Nachbarkontakt. War eine weggefallene Dublette
            // gewählt, den stehen gebliebenen Eintrag wählen. Einmal neu
            // aufbauen statt Zeile für Zeile verschieben – jedes Verschieben
            // zeichnet die Liste ab dort neu (bei hunderten Dubletten aus
            // CardDAV fror das Adressbuch sonst sekundenlang ein).
            const sel = this.selection;
            const kept = new Set(rows);
            let picked = null;
            let current = null;
            if (sel?.count) {
              picked = new Set();
              for (let i = 0; i < old.length; i++) {
                if (sel.isSelected(i)) {
                  if (!kept.has(old[i])) {
                    replaced = true;
                  }
                  picked.add(kept.has(old[i]) ? old[i] : old[i].mcBest);
                }
              }
              const cur = old[sel.currentIndex];
              current = cur && (kept.has(cur) ? cur : cur.mcBest);
            }
            this._rowMap = rows;
            if (picked) {
              const at = new Map(rows.map((r, i) => [r, i]));
              sel.selectEventsSuppressed = true;
              sel.clearSelection();
              for (const r of picked) {
                const j = at.get(r);
                if (j !== undefined && !sel.isSelected(j)) {
                  sel.toggleSelect(j);
                }
              }
              sel.currentIndex = at.get(current) ?? -1;
              sel.selectEventsSuppressed = false;
            }
            resort = true;
          }
        }
        const result = orig.call(this, column, direction, resort);
        // Thunderbird meldet eine so geänderte Auswahl nicht: ohne „select“
        // zeigte die Detailansicht weiter die weggefallene Dublette
        if (replaced) {
          this._tree?.dispatchEvent(new this._tree.ownerDocument.defaultView.CustomEvent("select"));
        }
        return result;
      };
      Adapter.prototype.__mcDedupe = true;
      restorers.push(() => {
        Adapter.prototype.sortBy = orig;
        delete Adapter.prototype.__mcDedupe;
      });

      // Etiketten in Kontofarbe (Liste, Tabelle und Detailansicht)
      const bookPills = (doc, sources) => sources.map(n => {
        const pill = doc.createElement("span");
        pill.className = "mc-book";
        pill.textContent = n;
        const c = accountColor(n);
        pill.style.setProperty("--c", c);
        pill.classList.toggle("mc-dark-color", textOnColor(c) == "#fff" && isVeryDark(c));
        return pill;
      });
      // Detailansicht: unter dem Namen, zu welchen Konten der Kontakt gehört –
      // bei zusammengeführten Kontakten alle (wie in der Liste)
      const pane = cw.detailsPane;
      if (pane && typeof pane.displayContact == "function" && !pane.__mcBooks) {
        const origDisplay = pane.displayContact;
        pane.displayContact = function (card, ...rest) {
          const result = origDisplay.call(this, card, ...rest);
          try {
            const doc = cw.document;
            doc.getElementById("mcDetailBooks")?.remove();
            if (card && !card.isMailList) {
              const rows = Object.values(cw.cardsPane?.cardsList?.view?._rowMap || {});
              const row = rows.find(r => r?.card?.UID == card.UID);
              let sources = row?.mcSources?.length ? row.mcSources : [];
              if (!sources.length) {
                const dir = row?.directory || (card.directoryUID && MailServices.ab.getDirectoryFromUID(card.directoryUID));
                sources = [dir?.dirName].filter(Boolean);
              }
              const headings = doc.querySelector("#viewContact .contact-headings");
              if (sources.length && headings) {
                const box = doc.createElement("p");
                box.id = "mcDetailBooks";
                box.className = "mc-books";
                box.replaceChildren(...bookPills(doc, sources));
                headings.appendChild(box);
              }
            }
          } catch (e) {
            log("detail books error", e);
          }
          return result;
        };
        pane.__mcBooks = true;
        restorers.push(() => {
          pane.displayContact = origDisplay;
          delete pane.__mcBooks;
          cw.document.getElementById("mcDetailBooks")?.remove();
        });
      }

      // Labels je Kontakt: aus welchen Adressbüchern er stammt – nur in der
      // vereinigten Ansicht „Alle Adressbücher“
      const Row = cw.customElements.get("ab-card-row");
      // Kontaktkarten genau so hoch wie die Mailkarten (Thunderbird rechnet
      // die Liste mit ROW_HEIGHT, das Design übernimmt --mc-card-h)
      if (Row && !Object.getOwnPropertyDescriptor(Row, "ROW_HEIGHT")?.get) {
        const self = this;
        Object.defineProperty(Row, "ROW_HEIGHT", {
          configurable: true,
          get: () => self.mcCardHeight || 67,
          set: () => {},
        });
        cw.document.documentElement.style.setProperty("--mc-card-h", `${this.mcCardHeight || 67}px`);
        try {
          cw.cardsPane?.cardsList?.reset?.();
        } catch {}
        restorers.push(() => {
          delete Row.ROW_HEIGHT;
          Row.ROW_HEIGHT = 52;
        });
      }
      if (Row && !Row.prototype.__mcBooks) {
        const origFill = Row.prototype.fillRow;
        Row.prototype.fillRow = function (...args) {
          const result = origFill.apply(this, args);
          try {
            let box = this.querySelector(".mc-books");
            // Labels nur in „Alle Adressbücher“ und solange „Adressbuch“ im Menü angehakt ist
            const showBooks = cw.document.getElementById("sortContext")
              ?.querySelector('menuitem[value="addrbook"]')?.hasAttribute("checked") ?? true;
            const unified = cw.document.getElementById("books")?.selectedIndex == 0 && showBooks;
            const row = this.view?._rowMap?.[this._index];
            const sources = row?.mcSources?.length ? row.mcSources : [row?.directory?.dirName].filter(Boolean);
            if (!unified || !sources.length) {
              box?.remove();
            } else {
              if (!box) {
                box = cw.document.createElement("span");
                box.className = "mc-books";
                this.firstLine.appendChild(box);
              }
              box.replaceChildren(...bookPills(cw.document, sources));
              box.title = sources.join(", ");
            }
          } catch (e) {
            log("book labels error", e);
          }
          return result;
        };
        Row.prototype.__mcBooks = true;
        restorers.push(() => {
          Row.prototype.fillRow = origFill;
          delete Row.prototype.__mcBooks;
        });
      }

      // Tabellenansicht: Thunderbirds Spalte „Adressbuch“ zeigt dieselben
      // Konto-Etiketten wie die Karten – bei zusammengeführten Kontakten alle
      // Bücher, nicht nur eines. Einmalig eingeblendet.
      const TableRow = cw.customElements.get("ab-table-card-row");
      if (TableRow && !TableRow.prototype.__mcBooks) {
        const origTableFill = TableRow.prototype.fillRow;
        TableRow.prototype.fillRow = function (...args) {
          const result = origTableFill.apply(this, args);
          try {
            const cell = this.querySelector(".addrbook-column");
            const row = this.view?._rowMap?.[this._index];
            const sources = row?.mcSources?.length ? row.mcSources : [row?.directory?.dirName].filter(Boolean);
            if (cell && !cell.hidden && sources.length) {
              const box = cw.document.createElement("span");
              box.className = "mc-books";
              box.replaceChildren(...bookPills(cw.document, sources));
              cell.replaceChildren(box);
              cell.title = sources.join(", ");
            }
          } catch (e) {
            log("table labels error", e);
          }
          // jede zweite Zeile leicht getönt wie in der Mail-Tabelle (nach der
          // echten Listenposition – die Zeilen werden beim Scrollen wiederverwendet)
          this.toggleAttribute("data-mc-odd", this._index % 2 == 1);
          return result;
        };
        TableRow.prototype.__mcBooks = true;
        restorers.push(() => {
          TableRow.prototype.fillRow = origTableFill;
          delete TableRow.prototype.__mcBooks;
        });
      }
      // Tabellenzeilen so hoch wie in der Mail-Tabelle (13-px-Schrift, 28 px);
      // Thunderbird setzt ROW_HEIGHT je nach Dichte neu – der Wert bleibt
      // gemerkt, gelesen wird mindestens 28
      if (TableRow && !Object.getOwnPropertyDescriptor(TableRow, "ROW_HEIGHT")?.get) {
        let tbHeight = TableRow.ROW_HEIGHT || 22;
        Object.defineProperty(TableRow, "ROW_HEIGHT", {
          configurable: true,
          get: () => Math.max(tbHeight, 28),
          set: v => {
            tbHeight = v;
          },
        });
        try {
          cw.cardsPane?.cardsList?.reset?.();
        } catch {}
        restorers.push(() => {
          delete TableRow.ROW_HEIGHT;
          TableRow.ROW_HEIGHT = tbHeight;
        });
      }
      if (TableRow) {
        const COLUMN_PREF = "extensions.mailcards.abLabelColumn";
        const pane = cw.cardsPane;
        const abColumn = pane?.COLUMNS?.find(c => c.id == "addrbook");
        if (abColumn && !Services.prefs.getBoolPref(COLUMN_PREF, false)) {
          abColumn.hidden = false;
          const visible = pane.COLUMNS.filter(c => !c.hidden).map(c => c.id).join(",");
          Services.xulStore.setValue("about:addressbook", "cards", "columns", visible);
          try {
            pane.table.setColumns(pane.COLUMNS);
            pane.cardsList.reset?.();
          } catch {}
          Services.prefs.setBoolPref(COLUMN_PREF, true);
        }
      }

      // Schalter im Darstellungsmenü („…“ neben der Suche)
      const menu = cw.document.getElementById("sortContext");
      // Abschnittstitel, damit klar ist, dass „Anzeigename“ eine Auswahl ist
      if (menu && !menu.querySelector(".mc-caption")) {
        const caption = (label, before, sep, section) => {
          if (!before) {
            return;
          }
          const c = cw.document.createXULElement("menucaption");
          c.className = "mc-caption";
          // Abschnitt für das CSS (Tabellenansicht blendet „Sort“ aus)
          c.setAttribute("mc-section", section);
          c.setAttribute("label", label);
          // „View“ folgt ohne Thunderbirds Trenner auf „Sort“: eigene Trennlinie davor
          const s = sep ? cw.document.createXULElement("menuseparator") : null;
          if (s) {
            s.className = "mc-caption-sep";
            before.before(s);
          }
          before.before(c);
          restorers.push(() => {
            c.remove();
            s?.remove();
          });
        };
        caption(tr("Show Names As"), menu.querySelector('menuitem[name="format"]'), false, "format");
        caption(tr("Sort"), menu.querySelector('menuitem[name="sort"]'), false, "sort");
        caption(tr("View"), menu.querySelector('menuitem[value="addrbook"]'), true, "view");
        // Thunderbirds Trenner vor „Table layout“ ausblenden: „View“ (Address
        // Book, Table layout, Merge Duplicate Contacts) hat innen keine Linie
        let tbSep = menu.querySelector("#sortContextTableLayout")?.previousElementSibling;
        while (tbSep && tbSep.localName != "menuseparator") {
          tbSep = tbSep.previousElementSibling;
        }
        if (tbSep && !tbSep.hidden && menu.querySelector(".mc-caption-sep")) {
          tbSep.hidden = true;
          restorers.push(() => {
            tbSep.hidden = false;
          });
        }
      }
      if (menu && !cw.document.getElementById("mcHideDuplicates")) {
        // ohne eigenen Trenner: gehört zum Abschnitt „View“
        const item = cw.document.createXULElement("menuitem");
        item.id = "mcHideDuplicates";
        item.setAttribute("type", "checkbox");
        item.setAttribute("label", tr("Merge Duplicate Contacts"));
        if (Services.prefs.getBoolPref(DEDUPE_PREF, true)) {
          item.setAttribute("checked", "true");
        }
        item.addEventListener("command", () => {
          Services.prefs.setBoolPref(DEDUPE_PREF, item.hasAttribute("checked"));
          // Liste neu aufbauen (ausgeschaltet kommen die Doppelten zurück)
          cw.booksList?.dispatchEvent(new cw.CustomEvent("select"));
        });
        menu.append(item);
        restorers.push(() => item.remove());
      }
      // aktuelle Liste sofort bereinigen
      cw.booksList?.dispatchEvent(new cw.CustomEvent("select"));
    };

    const styleContentPages = () => {
      markSearch();
      const uri = sheetURI();
      const tabmail = w.document.getElementById("tabmail");
      if (!uri || !tabmail) {
        return;
      }
      for (const tab of tabmail.tabInfo) {
        const cw = tab.browser?.contentWindow;
        const url = cw?.document?.documentURI || "";
        // Restorer dieses Tabs verfallen mit seinem Fenster
        const winRestorers = { push: fn => this.addWinRestorer(cw, fn) };
        if (cw && url.startsWith("about:preferences")) {
          try {
            hookAppearanceChoice(cw, winRestorers);
          } catch (e) {
            log("appearance choice error", e);
          }
          try {
            hookPrefCategories(cw, winRestorers);
          } catch (e) {
            log("pref categories error", e);
          }
          try {
            hookShortcutsLink(cw, winRestorers);
          } catch (e) {
            log("shortcuts link error", e);
          }
        }
        if (cw && url.startsWith("about:addressbook")) {
          try {
            hookAvatars(cw);
            hookEditLayout(cw);
            hookBooksHeader(cw, winRestorers);
            hookSplitterReset(cw.document);
          } catch (e) {
            log("avatar fix error", e);
          }
          try {
            hookCollectedAddresses(cw, winRestorers);
          } catch (e) {
            log("collected addresses error", e);
          }
          try {
            hookPhotoDialog(cw, winRestorers);
          } catch (e) {
            log("photo dialog error", e);
          }
          try {
            hookDedupe(cw);
            colorAccountRows(cw.document, winRestorers);
            cacheCardCount(cw.document, winRestorers);
          } catch (e) {
            log("dedupe error", e);
          }
          try {
            hookPersonalBook(cw, winRestorers);
          } catch (e) {
            log("personal book error", e);
          }
          try {
            hookLastContact(cw, winRestorers);
          } catch (e) {
            log("last contact error", e);
          }
        }
        if (!cw || !CONTENT_PAGES.test(url) || cw.__mcSheet == uri || cw.__mcTheme) {
          continue;
        }
        try {
          cw.windowUtils.loadSheetUsingURIString(uri, cw.windowUtils.USER_SHEET);
          cw.__mcSheet = uri;
        } catch (e) {
          log("content sheet error", url, e);
        }
      }
    };

    // Seitenleisten der übrigen Bereiche ein-/ausblenden wie die Ordnerliste
    // (Zustand je Bereich gespeichert, gleiche Animation wie in der Mail)
    const SIDE_PREF = "extensions.mailcards.hiddenSidebars";
    const SIDE_TOGGLE = {
      calendar: () => [w.document.getElementById("calSidebar"), w.document.getElementById("calsidebar_splitter")],
      tasks: () => [w.document.getElementById("calSidebar"), w.document.getElementById("calsidebar_splitter")],
      chat: () => [w.document.getElementById("listPaneBox"), w.document.getElementById("listSplitter")],
      addressBookTab: tab => {
        const doc = tab.browser?.contentDocument;
        return [doc?.getElementById("booksPane"), doc?.getElementById("booksSplitter")];
      },
      preferencesTab: tab => [tab.browser?.contentDocument?.getElementById("pref-category-box"), null],
      contentTab: tab => {
        const doc = tab.browser?.contentDocument;
        const url = doc?.documentURI || "";
        return url.startsWith("about:addons") ? [doc.getElementById("sidebar"), null]
          : url.startsWith("about:accountsettings") ? [doc.getElementById("accountTreeBox"), null]
          : [null, null];
      },
    };
    // Eine gemeinsame Breite für alle Seitenleisten: Wechselt man den Bereich,
    // bekommt dessen Seitenleiste dieselbe Breite – die Knöpfe springen nicht.
    // Zieht man eine Seitenleiste breiter/schmaler, gilt das für alle.
    const WIDTH_PREF = "extensions.mailcards.sidebarWidth";
    // gemeinsame Höchstbreite aller Seitenleisten (CSS-Variable, 360 px wie im Kalender)
    const sideMax = el => {
      const win = el.ownerDocument.defaultView;
      return parseFloat(win.getComputedStyle(el).getPropertyValue("--mt-sidebar-max-width")) || 360;
    };
    const sidebarFor = tab => {
      if (!tab) {
        return [null, null, null];
      }
      if (tab.mode?.name == "mail3PaneTab") {
        const ab = tab.chromeBrowser?.contentWindow;
        return [ab?.document?.getElementById("folderPane"), ab?.document?.getElementById("folderPaneSplitter"), ab];
      }
      const [el, splitter] = SIDE_TOGGLE[tab.mode?.name]?.(tab) || [];
      return [el, splitter, el?.ownerDocument?.defaultView];
    };
    const busy = (el, win) => !el || el.__mcAnimating || win?.__mcAnimating || el.classList.contains("mc-side-hidden");
    const applyCommonWidth = tab => {
      // Einstellungen: eigene feste Breite (240 px wie die Systemeinstellungen)
      if (tab?.mode?.name == "preferencesTab") {
        return;
      }
      // (noch keine eigene Breite gespeichert: 206 px wie die Ordnerliste in Apple Mail)
      // (nie breiter als die gemeinsame Höchstbreite, --mt-sidebar-max-width)
      const [el, splitter, win] = sidebarFor(tab);
      if (busy(el, win)) {
        return;
      }
      const W = Math.min(sideMax(el), Services.prefs.getIntPref(WIDTH_PREF, 0) || 206);
      if (W < 160) {
        return;
      }
      // (Mail, Adressbuch: die Spalte des Teilers zählt – sie kann breiter
      // sein als die auf die Höchstbreite begrenzte Leiste)
      const hr = splitter?.localName == "hr" && "width" in splitter;
      const current = hr && splitter.width ? splitter.width : el.getBoundingClientRect().width;
      if (!current || Math.abs(current - W) < 1.5) {
        return;
      }
      el.__mcSetting = Date.now();
      if (splitter?.localName == "hr" && "width" in splitter) {
        // Thunderbirds Pane-Splitter (Mail, Adressbuch) – speichert selbst
        splitter.width = W;
        splitter.dispatchEvent(new win.CustomEvent("splitter-resized", { bubbles: true }));
        // feste Breite aus der Ein-/Ausblend-Animation mitziehen
        if (el.style.getPropertyPriority("width") == "important") {
          el.style.setProperty("width", `${W}px`, "important");
        }
      } else {
        el.style.setProperty("width", `${W}px`, "important");
        if (splitter) {
          el.setAttribute("width", String(W));
          try {
            Services.xulStore.persist(el, "width");
          } catch {}
        }
      }
      // Toolbar-Kanten (Mail: Beginn der Knöpfe über der Nachricht) neu messen
      for (const ms of [50, 300, 700]) {
        w.setTimeout(() => {
          this.sideEdgeUpdaters?.forEach(fn => fn());
          this.offsetUpdaters?.forEach(fn => fn());
        }, ms);
      }
    };
    const watchWidth = tab => {
      const [el, splitter, win] = sidebarFor(tab);
      // Merkmal gehört dieser Fassung: ein liegengebliebenes „true“ einer älteren
      // (3.2.0 räumte es beim Update ohne Neustart nicht weg) blockiert nicht
      if (!el || el.__mcWidthWatch === this) {
        return;
      }
      el.__mcWidthWatch = this;
      // Startwert: die Breite der Ordnerliste in der Mail
      if (!Services.prefs.getIntPref(WIDTH_PREF, 0) && tab.mode?.name == "mail3PaneTab") {
        const width = Math.round(el.getBoundingClientRect().width);
        if (width >= 160) {
          // nie schmaler als Apple Mails 206 px; Thunderbirds Vorgabe (198) ist keine eigene Wahl
          Services.prefs.setIntPref(WIDTH_PREF, Math.max(width, 206));
        }
      }
      // Nur echtes Ziehen am Trenner zählt als neue Breite – übernommen erst
      // beim Loslassen und nie schmaler als 160 px (nicht das Einrichten der
      // Seite, Animationen oder Thunderbirds Mindestbreiten)
      if (splitter) {
        const onDown = () => {
          win.addEventListener("pointerup", () => win.setTimeout(() => {
            if (busy(el, win)) {
              return;
            }
            const width = Math.round(el.getBoundingClientRect().width);
            if (width >= 160 && Math.abs(width - Services.prefs.getIntPref(WIDTH_PREF, 0)) >= 2) {
              Services.prefs.setIntPref(WIDTH_PREF, width);
            }
          }, 300), { once: true });
        };
        splitter.addEventListener("pointerdown", onDown);
        this.addWinRestorer(win, () => {
          splitter.removeEventListener("pointerdown", onDown);
          if (el.__mcWidthWatch === this) {
            delete el.__mcWidthWatch;
          }
        });
      }
    };
    // Doppelklick auf eine Trennlinie stellt ihre Standardbreite wieder her:
    // Seitenleisten 206 px (gemeinsam), Mail-/Kontaktliste Thunderbirds
    // Standard (die andere Liste zieht mit), Today-Pane 280 px
    const hookSplitterReset = doc => {
      if (!doc || doc.__mcSplitterReset) {
        return;
      }
      doc.__mcSplitterReset = true;
      const SIDEBAR_SPLITTERS = new Set(["folderPaneSplitter", "booksSplitter", "calsidebar_splitter", "listSplitter"]);
      // Teiler fangen den Zeiger beim Drücken ein – Loslassen, Klick und
      // Doppelklick landen dann am Dokument statt am Teiler; deshalb den
      // Teiler vom letzten Drücken merken
      const SPLITTER = "splitter, hr[is='pane-splitter'], [is='pane-splitter']";
      let lastDown = null;
      const onDown = event => {
        const splitter = event.target.closest?.(SPLITTER);
        lastDown = splitter ? { splitter, time: Date.now() } : null;
      };
      const onDblClick = event => {
        const splitter = event.target.closest?.(SPLITTER) ||
          (lastDown && Date.now() - lastDown.time < 800 ? lastDown.splitter : null);
        if (!splitter?.id) {
          return;
        }
        if (SIDEBAR_SPLITTERS.has(splitter.id)) {
          event.preventDefault();
          Services.prefs.clearUserPref(WIDTH_PREF);
          syncSidebarWidth();
        } else if (splitter.id == "messagePaneSplitter") {
          event.preventDefault();
          // Mailliste zurück auf ihre Standardbreite (die Nachricht nimmt den Rest)
          Services.prefs.clearUserPref(LIST_WIDTH_PREF);
          w.setTimeout(() => this.offsetUpdaters?.forEach(fn => fn()), 50);
        } else if (splitter.id == "sharedSplitter") {
          event.preventDefault();
          this.mcButtonsLeft = undefined; // nicht gleich wieder an die Mailliste angleichen
          splitter.width = null;
          w.setTimeout(() => {
            const cards = doc.getElementById("cardsPane")?.getBoundingClientRect();
            const tab = w.document.getElementById("tabmail")?.currentTabInfo;
            const b = tab?.browser?.getBoundingClientRect();
            if (cards?.width && b) {
              this.mcListWidth = Math.round(cards.width);
              this.mcButtonsLeft = b.left + cards.right + 6;
              this.mcListPending = true; // die Mailliste übernimmt die Kante
            }
            updateSideEdge();
          }, 50);
        } else if (splitter.id == "today-splitter") {
          event.preventDefault();
          const panel = doc.getElementById("today-pane-panel");
          if (panel) {
            panel.setAttribute("width", "280");
            panel.style.width = "280px";
            panel.setModeAttribute?.("modewidths", "280");
          }
        }
      };
      doc.addEventListener("mousedown", onDown, true);
      doc.addEventListener("dblclick", onDblClick, true);
      this.addWinRestorer(doc.defaultView, () => {
        doc.removeEventListener("mousedown", onDown, true);
        doc.removeEventListener("dblclick", onDblClick, true);
        delete doc.__mcSplitterReset;
      });
    };

    const syncSidebarWidth = () => {
      const tabmail = w.document.getElementById("tabmail");
      const tab = tabmail?.currentTabInfo;
      const mail = tabmail?.tabInfo?.find(t => t.mode?.name == "mail3PaneTab");
      if (mail) {
        watchWidth(mail);
      }
      watchWidth(tab);
      applyCommonWidth(tab);
    };

    const sideState = () => {
      try {
        return JSON.parse(Services.prefs.getStringPref(SIDE_PREF, "{}"));
      } catch {
        return {};
      }
    };
    const currentSide = () => {
      const tab = w.document.getElementById("tabmail")?.currentTabInfo;
      const mode = tab?.mode?.name;
      const [el, splitter] = SIDE_TOGGLE[mode]?.(tab) || [];
      return { mode, el, splitter };
    };
    // Thunderbirds eigenes Zuklappen der Leiste (Trenner ganz nach links
    // gezogen) aufheben und abschalten – ein-/ausgeblendet wird über den
    // Seitenleisten-Knopf, sonst bliebe die Leiste nach dem Einblenden leer
    const unCollapse = (el, splitter) => {
      if (splitter?.localName == "splitter") {
        if (splitter.getAttribute("collapse") != "none") {
          splitter.setAttribute("collapse", "none");
        }
        if (splitter.getAttribute("state") == "collapsed") {
          splitter.setAttribute("state", "open");
        }
      }
      if (el?.getAttribute("collapsed") == "true") {
        el.removeAttribute("collapsed");
      }
    };
    const applySideState = () => {
      const { mode, el, splitter } = currentSide();
      if (!el || el.__mcAnimating) {
        return;
      }
      unCollapse(el, splitter);
      const hidden = !!sideState()[mode];
      el.classList.toggle("mc-side-hidden", hidden);
      splitter?.classList.toggle("mc-side-hidden", hidden);
      placeSideGrip();
    };
    const sideHidden = () => {
      const { mode, el } = currentSide();
      return el ? !!sideState()[mode] : false;
    };
    const toggleSpaceSidebar = () => {
      const { mode, el, splitter } = currentSide();
      if (!el || el.__mcAnimating) {
        return;
      }
      const win = el.ownerDocument.defaultView;
      const show = el.classList.contains("mc-side-hidden");
      const state = sideState();
      state[mode] = !show;
      // Kalender und Aufgaben teilen sich die Seitenleiste
      if (mode == "calendar" || mode == "tasks") {
        state.calendar = state.tasks = !show;
      }
      Services.prefs.setStringPref(SIDE_PREF, JSON.stringify(state));
      const DURATION = motionMs(250);
      const curve = cubicBezier(0.25, 0.1, 0.25, 1);
      unCollapse(el, splitter);
      if (show) {
        el.classList.remove("mc-side-hidden");
        splitter?.classList.remove("mc-side-hidden");
        placeSideGrip();
      }
      const full = el.getBoundingClientRect().width;
      if (!full) {
        return;
      }
      el.__mcAnimating = true;
      el.classList.add("mc-side-anim");
      // gespeicherte Breite der Leiste (Inline-Stil) merken und danach wiederherstellen
      const PROPS = ["overflow", "min-width", "width", "max-width"];
      const saved = PROPS.map(p => [p, el.style.getPropertyValue(p), el.style.getPropertyPriority(p)]);
      const kids = [...el.children];
      kids.forEach(k => k.style.setProperty("min-width", `${full}px`));
      el.style.setProperty("overflow", "hidden", "important");
      el.style.setProperty("min-width", "0px", "important");
      // Adressbuch: die Rasterspalte der Liste mitziehen, sonst bliebe die
      // Kontaktliste stehen und spränge erst am Ende
      const gridBody = el.id == "booksPane" ? el.ownerDocument.body : null;
      const savedColumn = gridBody?.style.getPropertyValue("--booksSplitter-width");
      const setW = v => {
        el.style.setProperty("width", `${v}px`, "important");
        el.style.setProperty("max-width", `${v}px`, "important");
        gridBody?.style.setProperty("--booksSplitter-width", `${v}px`);
      };
      // Adressbuch: beim Ausblenden die Breite der Kontaktliste merken; beim
      // Einblenden behält sie gleich wieder diese Breite (wie die Mailliste) und
      // die Details geben den Platz ab – sonst schrumpfte die Liste erst nach und
      // nach und drückte die Bücherliste unter ihre Breite (unter Windows sichtbar)
      const shared = gridBody?.querySelector("#sharedSplitter");
      const cardsPane = gridBody?.querySelector("#cardsPane");
      if (gridBody && !show && cardsPane) {
        el.__mcCardsWidth = Math.round(cardsPane.getBoundingClientRect().width);
      }
      if (gridBody && show && shared && el.__mcCardsWidth && "width" in shared) {
        shared.width = el.__mcCardsWidth;
        el.__mcShowing = true;
      }
      if (show) {
        setW(0);
      }
      let start = null;
      const step = now => {
        if (start === null) {
          start = now;
        }
        const k = Math.min(1, (now - start) / DURATION);
        setW(full * (show ? curve(k) : 1 - curve(k)));
        updateSideEdge();
        if (k < 1) {
          win.requestAnimationFrame(step);
          return;
        }
        for (const [prop, value, prio] of saved) {
          if (value) {
            el.style.setProperty(prop, value, prio);
          } else {
            el.style.removeProperty(prop);
          }
        }
        kids.forEach(kid => kid.style.removeProperty("min-width"));
        if (gridBody) {
          if (savedColumn) {
            gridBody.style.setProperty("--booksSplitter-width", savedColumn);
          } else {
            gridBody.style.removeProperty("--booksSplitter-width");
          }
        }
        if (!show) {
          el.classList.add("mc-side-hidden");
          splitter?.classList.add("mc-side-hidden");
        }
        el.classList.remove("mc-side-anim");
        el.__mcAnimating = false;
        delete el.__mcShowing;
        updateSideEdge();
        sidebarTip?.();
        placeSideGrip();
      };
      win.requestAnimationFrame(() => win.requestAnimationFrame(step));
    };

    // Seitenleiste per Trennlinie ziehen – in allen Bereichen dieselbe Logik
    // (dragPane): breiter/schmaler bis zur gemeinsamen Höchstbreite, unter
    // DRAG_HIDE px sofort und ohne Animation ausgeblendet, im selben Zug
    // zurückgezogen wieder da. Ausgeblendet bleibt am linken Rand eine schmale
    // Greifzone (#mcSideGrip), an der man sie wieder herauszieht. Die Breite
    // von vor dem Ziehen bleibt fürs Einblenden
    const DRAG_HIDE = 120;
    const SIDE_MIN = 160;
    const SIDE_ROOM = 400; // mindestens so viel Platz bleibt der Ansicht daneben
    const SIDE_GRIP = 5; // so breit wie die Trennlinien
    const setSideHidden = (mode, el, splitter, hidden) => {
      const state = sideState();
      state[mode] = hidden;
      // Kalender und Aufgaben teilen sich die Seitenleiste
      if (mode == "calendar" || mode == "tasks") {
        state.calendar = state.tasks = hidden;
      }
      Services.prefs.setStringPref(SIDE_PREF, JSON.stringify(state));
      if (!hidden) {
        unCollapse(el, splitter);
      }
      el.classList.toggle("mc-side-hidden", hidden);
      splitter?.classList.toggle("mc-side-hidden", hidden);
      updateSideEdge();
      sidebarTip?.();
      placeSideGrip();
    };
    const hideSideNow = (mode, el, splitter) => setSideHidden(mode, el, splitter, true);
    // Seitenleiste des Tabs als Objekt für dragPane
    const sidePane = tab => {
      const mode = tab?.mode?.name;
      const [el, splitter, win] = sidebarFor(tab);
      if (!el || !win) {
        return null;
      }
      const commonWidth = () => Math.min(sideMax(el), Services.prefs.getIntPref(WIDTH_PREF, 0) || 206);
      const pane = {
        el, splitter, win, mode,
        side: "left",
        width: () => el.getBoundingClientRect().width,
        threshold: () => DRAG_HIDE,
      };
      const lock = W => {
        // Thunderbirds Sperre der Breite („width: …px !important“) mitziehen
        if (el.style.getPropertyPriority("width") == "important") {
          el.style.setProperty("width", `${W}px`, "important");
        }
      };
      if (mode == "mail3PaneTab") {
        if (!splitter) {
          return null;
        }
        // Mail: ausgeblendet heißt von Thunderbirds Teiler zugeklappt
        pane.hidden = () => splitter.isCollapsed;
        pane.setHidden = hidden => {
          splitter.isCollapsed = hidden;
          if (!hidden) {
            lock(splitter.width || commonWidth());
          }
          updateSideEdge();
          this.offsetUpdaters?.forEach(fn => fn());
          sidebarTip?.();
          placeSideGrip();
        };
        pane.setWidth = W => {
          splitter.width = W;
          lock(W);
        };
        pane.save = () => splitter.dispatchEvent(new win.CustomEvent("splitter-resized", { bubbles: true }));
      } else {
        const hr = splitter?.localName == "hr" && "width" in splitter;
        pane.hidden = () => el.classList.contains("mc-side-hidden");
        pane.setHidden = hidden => setSideHidden(mode, el, splitter, hidden);
        // ohne eigene Trennlinie (Einstellungen): feste Breite, nur ein-/ausblenden
        if (splitter) {
          pane.setWidth = W => {
            if (hr) {
              splitter.width = W;
            } else {
              el.style.setProperty("width", `${W}px`, "important");
            }
          };
          pane.save = () => {
            if (hr) {
              splitter.dispatchEvent(new win.CustomEvent("splitter-resized", { bubbles: true }));
              return;
            }
            const W = parseFloat(el.style.getPropertyValue("width"));
            if (W) {
              el.setAttribute("width", String(Math.round(W)));
              try {
                Services.xulStore.persist(el, "width");
              } catch {}
            }
          };
        }
      }
      pane.commonWidth = commonWidth;
      return pane;
    };
    const startSideDrag = event => {
      const pane = sidePane(w.document.getElementById("tabmail")?.currentTabInfo);
      if (!pane || event.button != 0 || pane.el.__mcAnimating || pane.win.__mcAnimating) {
        return;
      }
      // höchstens die gemeinsame Höchstbreite, aber nie so breit, dass die
      // Ansicht daneben (Mailliste, Kalender, Chat) unter ihre Mindestbreite
      // gedrückt wird – Thunderbirds eigener Teiler (jetzt abgeschaltet) hat
      // das bisher selbst begrenzt
      let room = Infinity;
      try {
        const parent = pane.el.parentElement;
        let need = 0;
        for (const c of parent?.children || []) {
          if (c != pane.el && c != pane.splitter && c.getBoundingClientRect().width > 0) {
            need += parseFloat(pane.win.getComputedStyle(c).minWidth) || 0;
          }
        }
        if (parent) {
          room = parent.getBoundingClientRect().width - Math.max(SIDE_ROOM, need);
        }
      } catch {}
      const max = Math.max(SIDE_MIN, Math.min(sideMax(pane.el), room));
      let resized = false;
      dragPane(event, {
        side: "left",
        hidden: pane.hidden,
        width: pane.width,
        threshold: pane.threshold,
        setHidden: pane.setHidden,
        setWidth: pane.setWidth && (W => {
          pane.setWidth(Math.round(Math.min(max, Math.max(SIDE_MIN, W))));
          resized = true;
          updateSideEdge();
        }),
        done: hidden => {
          if (pane.setWidth) {
            if (hidden) {
              // ausgeblendet losgelassen: beim Einblenden wieder die gemeinsame Breite
              pane.setWidth(pane.commonWidth());
            } else if (resized) {
              Services.prefs.setIntPref(WIDTH_PREF, Math.round(pane.width()));
            }
            pane.save?.();
          }
          placeSideGrip();
          updateSideEdge();
          this.offsetUpdaters?.forEach(fn => fn());
        },
      });
    };
    // Greifzone: bei ausgeblendeter Seitenleiste am linken Rand (gleich rechts
    // der Bereiche-Leiste), bei einer Leiste ohne eigene Trennlinie
    // (Einstellungen) auch an ihrem rechten Rand – eine je Dokument
    const sideGrip = doc => {
      let grip = doc.getElementById("mcSideGrip");
      if (grip) {
        return grip;
      }
      grip = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
      grip.id = "mcSideGrip";
      grip.setAttribute("aria-hidden", "true");
      grip.style.cssText = `position: fixed; z-index: 10; width: ${SIDE_GRIP}px; display: none;`;
      grip.addEventListener("pointerdown", startSideDrag);
      grip.addEventListener("mousedown", blockNativeSplitter, true);
      doc.documentElement.append(grip);
      this.addWinRestorer(doc.defaultView == w ? null : doc.defaultView, () => grip.remove());
      return grip;
    };
    const placeSideGrip = () => {
      const pane = sidePane(w.document.getElementById("tabmail")?.currentTabInfo);
      const mainGrip = w.document.getElementById("mcSideGrip");
      if (mainGrip && pane?.el.ownerDocument != w.document) {
        mainGrip.style.display = "none";
      }
      if (!pane) {
        return;
      }
      const grip = sideGrip(pane.el.ownerDocument);
      const hidden = pane.hidden();
      if (!hidden && pane.splitter) {
        grip.style.display = "none";
        return;
      }
      const box = (hidden ? pane.el.parentNode : pane.el).getBoundingClientRect();
      if (!box.height) {
        grip.style.display = "none";
        return;
      }
      grip.style.left = `${Math.round(hidden ? box.left : box.right - SIDE_GRIP / 2)}px`;
      grip.style.top = `${Math.round(box.top)}px`;
      grip.style.height = `${Math.round(box.height)}px`;
      grip.style.cursor = hidden ? "e-resize" : "col-resize";
      grip.style.display = "block";
    };
    // Fenstergröße geändert oder Bereiche-Leiste ein-/ausgeblendet: neu setzen
    const gripRo = new w.ResizeObserver(() => placeSideGrip());
    const gripBox = w.document.getElementById("tabmail-container");
    gripBox && gripRo.observe(gripBox);
    this.restorers.push(() => gripRo.disconnect());
    // Trennlinie des Bereichs übernehmen (statt Thunderbirds eigenem Ziehen)
    const hookSideDrag = tab => {
      placeSideGrip();
      const [el, splitter, win] = sidebarFor(tab);
      if (!el || !splitter || !win || splitter.__mcSideDrag === this) {
        return;
      }
      splitter.__mcSideDrag = this;
      splitter.addEventListener("pointerdown", startSideDrag);
      splitter.addEventListener("mousedown", blockNativeSplitter, true);
      // Mail: Thunderbird klappt die Ordnerliste auch selbst (Menü Ansicht)
      splitter.addEventListener("splitter-collapsed", placeSideGrip);
      splitter.addEventListener("splitter-expanded", placeSideGrip);
      this.addWinRestorer(win, () => {
        splitter.removeEventListener("pointerdown", startSideDrag);
        splitter.removeEventListener("mousedown", blockNativeSplitter, true);
        splitter.removeEventListener("splitter-collapsed", placeSideGrip);
        splitter.removeEventListener("splitter-expanded", placeSideGrip);
        if (splitter.__mcSideDrag === this) {
          delete splitter.__mcSideDrag;
        }
      });
    };

    // Suchfeld oben rechts: im Adressbuch filtert es die Kontakte, in den
    // Aufgaben die Aufgabenliste, in den Einstellungen die Einstellungen (statt der
    // Mail-Volltextsuche) – die Suchfelder in diesen Seiten entfallen.
    const SEARCH_TARGETS = {
      addressBookTab: {
        label: "Search Contacts",
        input: cw => cw?.cardsPane?.searchInput,
        set: (input, text) => input.overrideSearchTerm(text), // löst dort selbst die Suche aus
      },
      tasks: {
        label: "Search Tasks",
        input: () => w.document.getElementById("task-text-filter-field"),
        set: (input, text) => {
          input.value = text;
          input.dispatchEvent(new w.Event("input", { bubbles: true }));
        },
      },
      // Mail: alle Postfächer (Suchordner), Tippen sucht kurz verzögert
      mail3PaneTab: {
        label: "Search All Mailboxes",
        input: () => ({ value: this.mailSearchTerm || "" }),
        mail: true,
      },
      preferencesTab: {
        label: "Search Settings",
        input: cw => cw?.document.getElementById("searchInput"),
        set: (input, text) => {
          input.value = text;
          input.dispatchEvent(new input.ownerDocument.defaultView.Event("input", { bubbles: true }));
        },
      },
    };
    const currentTarget = () => {
      const tab = w.document.getElementById("tabmail")?.currentTabInfo;
      const target = SEARCH_TARGETS[tab?.mode?.name];
      return target ? { target, cw: tab.browser?.contentWindow } : null;
    };
    const abWindow = () => {
      const tab = w.document.getElementById("tabmail")?.currentTabInfo;
      return tab?.mode?.name == "addressBookTab" ? tab.browser?.contentWindow : null;
    };
    const globalSearch = () => w.document.querySelector("#unifiedToolbarContent global-search-bar");
    // Platzhalter einheitlich „Search …“ je Bereich; in der Mail je Ordner
    // („Search Sent“), bei Sammelordnern „Search All Mailboxes“
    const PLACEHOLDERS = { calendar: "Search Calendar", tasks: "Search Tasks", chat: "Search Chat",
      addressBookTab: "Search Contacts", preferencesTab: "Search Settings" };
    const placeholderText = mode => {
      if (mode == "mail3PaneTab") {
        const base = this.searchBase(w.document.getElementById("tabmail")?.currentAbout3Pane);
        return this.isUnifiedFolder(base) ? tr("Search All Mailboxes") : tr("Search {name}", { name: appleFolderName(base) });
      }
      return tr(PLACEHOLDERS[mode] || "Search");
    };
    const setPlaceholder = mode => {
      const placeholder = globalSearch()?.querySelector('[slot="placeholder"]');
      if (placeholder && !placeholder.hasAttribute("data-l10n-id")) {
        const text = placeholderText(mode);
        if (placeholder.textContent != text) {
          placeholder.textContent = text;
        }
      }
    };
    w.__mcSearchPlaceholder = () => setPlaceholder(w.document.getElementById("tabmail")?.currentTabInfo?.mode?.name);
    this.restorers.push(() => delete w.__mcSearchPlaceholder);
    const syncSearchForTab = mode => {
      const bar = globalSearch();
      if (!bar) {
        return;
      }
      const target = SEARCH_TARGETS[mode];
      if (w.__mcSearchMode && w.__mcSearchMode != mode) {
        bar.reset(); // leert dabei auch die Suche der verlassenen Seite
      }
      w.__mcSearchMode = target ? mode : null;
      // Platzhalter je Bereich: Thunderbird gibt dem Suchfeld einen eigenen
      // <span slot="placeholder"> – das placeholder-Attribut (nur Ersatzinhalt
      // des Slots) bliebe unsichtbar. Erst nachdem styleSearch Thunderbirds
      // Text abgekoppelt hat (sonst bleibt dessen Übersetzung stehen).
      setPlaceholder(mode);
      if (target) {
        const term = target.input(currentTarget()?.cw)?.value || "";
        bar.overrideSearchTerm?.(term);
      }
    };
    const hookSearchForwarding = () => {
      const content = w.document.getElementById("unifiedToolbarContent");
      if (!content || content.__mcSearchHook) {
        return;
      }
      content.__mcSearchHook = true;
      const forward = event => {
        if (!w.__mcSearchMode || event.target.localName != "global-search-bar") {
          return;
        }
        event.stopImmediatePropagation();
        event.preventDefault();
        const cur = currentTarget();
        if (cur?.target.mail) {
          const text = event.type == "search" ? event.detail ?? event.target.value : event.detail;
          w.clearTimeout(w.__mcMailSearchTimer);
          const run = () => this.mailSearch(w, text || "");
          // Eingabetaste oder leeres Feld sofort, beim Tippen kurz warten
          if (event.type == "search" || !text) {
            run();
          } else {
            w.__mcMailSearchTimer = w.setTimeout(run, 250);
          }
          return;
        }
        const input = cur?.target.input(cur.cw);
        if (input && event.type == "autocomplete") {
          cur.target.set(input, event.detail || "");
        }
      };
      content.addEventListener("autocomplete", forward, true);
      content.addEventListener("search", forward, true);
      this.restorers.push(() => {
        content.removeEventListener("autocomplete", forward, true);
        content.removeEventListener("search", forward, true);
        delete content.__mcSearchHook;
      });
    };

    // Menüleiste → Help: „Halo Spaces …“ öffnet das Info-Fenster mit
    // Update-Prüfung, Feedback und „Danke sagen“.
    const hookHelpMenu = () => {
      const d = w.document;
      const popup = d.getElementById("menu_HelpPopup");
      if (!popup || d.getElementById("mcHaloSpaces")) {
        return;
      }
      const sep = d.createXULElement("menuseparator");
      sep.id = "mcCheckUpdatesSeparator";
      const item = d.createXULElement("menuitem");
      item.id = "mcHaloSpaces";
      item.setAttribute("label", "halo.spaces …");
      item.addEventListener("command", () => this.openHaloWindow(w));
      const anchor = d.getElementById("aboutName");
      popup.insertBefore(sep, anchor);
      popup.insertBefore(item, anchor);
      this.restorers.push(() => {
        sep.remove();
        item.remove();
      });
    };

    // Ansicht → Vorschauzeilen (Menüleiste und App-Menü → Ansicht): Keine,
    // 1–4 Zeilen, Häkchen am aktuellen Wert; gilt sofort (applyPreviewLines).
    // Nur in der Kartenansicht wirksam, in der Tabelle daher ausgegraut
    const hookPreviewMenu = () => {
      const d = w.document;
      if (d.getElementById("mcPreviewLines")) {
        return;
      }
      const values = [0, 1, 2, 3, 4];
      const label = n => (n == 0 ? tr("None") : n == 1 ? tr("1 Line") : tr("{n} Lines", { n }));
      const current = () => Math.max(0, Math.min(4, Services.prefs.getIntPref(PREVIEW_PREF, 1)));
      const choose = n => {
        if (n == 1) {
          Services.prefs.clearUserPref(PREVIEW_PREF); // Standard: nichts im Profil speichern
        } else {
          Services.prefs.setIntPref(PREVIEW_PREF, n);
        }
      };
      const added = [];
      // Menüleiste: Untermenü nach „Layout“
      const layout = d.getElementById("menu_MessagePaneLayout");
      if (layout) {
        const menu = d.createXULElement("menu");
        menu.id = "mcPreviewLines";
        menu.setAttribute("label", tr("Preview Lines"));
        const popup = d.createXULElement("menupopup");
        popup.id = "mcPreviewLinesPopup";
        for (const n of values) {
          const item = d.createXULElement("menuitem");
          item.setAttribute("type", "radio");
          item.setAttribute("name", "mcpreviewlines");
          item.setAttribute("label", label(n));
          item.setAttribute("value", String(n));
          item.addEventListener("command", () => choose(n));
          popup.append(item);
        }
        popup.addEventListener("popupshowing", event => {
          if (event.target != popup) {
            return;
          }
          for (const item of popup.children) {
            item.toggleAttribute("checked", item.getAttribute("value") == String(current()));
          }
        });
        menu.append(popup);
        layout.after(menu);
        added.push(menu);
        const viewPopup = d.getElementById("menu_View_Popup");
        const onView = event => {
          if (event.target == viewPopup) {
            menu.disabled = viewChoice() != "cards";
          }
        };
        viewPopup?.addEventListener("popupshowing", onView);
        this.restorers.push(() => viewPopup?.removeEventListener("popupshowing", onView));
      }
      // App-Menü → Ansicht: Knopf mit eigener Unteransicht wie „Layout“
      const appLayout = d.getElementById("appmenu_MessagePaneLayout");
      const viewView = d.getElementById("appMenu-viewView");
      if (appLayout && viewView) {
        const view = d.createXULElement("panelview");
        view.id = "mcPreviewLinesView";
        view.className = "PanelUI-subView";
        view.setAttribute("title", tr("Preview Lines"));
        const body = d.createXULElement("vbox");
        body.className = "panel-subview-body";
        for (const n of values) {
          const button = d.createXULElement("toolbarbutton");
          button.className = "subviewbutton subviewbutton-iconic";
          button.setAttribute("type", "radio");
          button.setAttribute("name", "mcpreviewlines");
          button.setAttribute("label", label(n));
          button.setAttribute("value", String(n));
          button.addEventListener("command", () => {
            choose(n);
            w.PanelUI?.hide();
          });
          body.append(button);
        }
        view.append(body);
        view.addEventListener("ViewShowing", () => {
          for (const button of body.children) {
            button.toggleAttribute("checked", button.getAttribute("value") == String(current()));
          }
        });
        viewView.after(view);
        const nav = d.createXULElement("toolbarbutton");
        nav.id = "appmenu_mcPreviewLines";
        nav.className = "subviewbutton subviewbutton-iconic subviewbutton-nav";
        nav.setAttribute("label", tr("Preview Lines"));
        nav.setAttribute("closemenu", "none");
        nav.addEventListener("command", () => w.PanelUI.showSubView("mcPreviewLinesView", nav));
        appLayout.after(nav);
        added.push(view, nav);
        const onAppView = () => {
          nav.disabled = viewChoice() != "cards";
        };
        viewView.addEventListener("ViewShowing", onAppView);
        this.restorers.push(() => viewView.removeEventListener("ViewShowing", onAppView));
      }
      this.restorers.push(() => added.forEach(el => el.remove()));
    };

    // Aufgaben: die Filter („Current Tasks“, „Today“ …) als Menü hinter einem
    // Knopf wie „Quick Filter“ in der Mail statt als Liste in der Seitenleiste.
    // Die Auswahl klickt Thunderbirds eigene Liste (Filterlogik und Speicherung
    // bleiben); der Knopf ist in Akzentfarbe, solange ein anderer Filter als
    // „Current Tasks“ gilt
    // Aufgaben: Filter („Current Tasks“, „Today“ …) und Ansicht (Karten/Tabelle)
    // wie in der Mail über der Liste – Filter-Knopf und „…“ im Listenkopf
    // (#mcListHeader). Die Filter-Auswahl klickt Thunderbirds eigene Liste
    // (Filterlogik und Speicherung bleiben); der Filter-Knopf ist getönt, solange
    // ein anderer Filter als „Current Tasks“ gilt
    const hookTaskFilter = () => {
      const d = w.document;
      const group = d.getElementById("task-tree-filtergroup");
      if (!group || d.getElementById("mcTaskFilterPopup")?.__mcOwner === HOOK_OWNER) {
        return;
      }
      d.getElementById("mcTaskFilterPopup")?.remove();
      d.getElementById("mcTaskFilter")?.remove(); // (Knopf der Toolbar früherer Fassungen)
      const popup = d.createXULElement("menupopup");
      popup.id = "mcTaskFilterPopup";
      popup.__mcOwner = HOOK_OWNER;
      (d.getElementById("mainPopupSet") || d.querySelector("popupset") || d.documentElement).append(popup);
      const sync = () => {
        this.updateListHeader(w);
      };
      popup.addEventListener("popupshowing", event => {
        if (event.target != popup) {
          return;
        }
        if (popup.dataset.kind == "view") {
          // „list“ bleibt der gespeicherte Wert (Kompatibilität), heißt aber wie in der Mail „Kartenansicht“
          popup.replaceChildren(...[["list", "Card View"], ["table", "Table View"]].map(([key, label]) => {
            const item = d.createXULElement("menuitem");
            item.setAttribute("type", "radio");
            item.setAttribute("name", "mctaskview");
            item.setAttribute("label", tr(label));
            item.dataset.view = key;
            if (taskView() == key) {
              item.setAttribute("checked", "true");
            }
            item.addEventListener("command", () => setTaskView(w, key));
            return item;
          }));
          return;
        }
        popup.replaceChildren(...[...group.querySelectorAll("radio")].map(radio => {
          const item = d.createXULElement("menuitem");
          item.setAttribute("type", "radio");
          item.setAttribute("name", "mctaskfilter");
          item.setAttribute("label", radio.label || radio.getAttribute("label") || radio.value);
          if (radio.selected || group.value == radio.value) {
            item.setAttribute("checked", "true");
          }
          item.addEventListener("command", () => {
            // Thunderbirds eigene Umschaltung: setzt Liste und Auswahl gemeinsam
            // (ein Klick auf das ausgeblendete Optionsfeld erreicht die Liste
            // nicht immer – sie zeigte dann weiter den alten Filter)
            if (typeof w.taskViewUpdate == "function") {
              w.taskViewUpdate(radio.value);
            } else {
              radio.click();
            }
            w.setTimeout(sync, 0);
          });
          return item;
        }));
      });
      group.addEventListener("command", sync);
      group.addEventListener("select", sync);
      sync();
      this.restorers.push(() => {
        popup.remove();
        group.removeEventListener("command", sync);
        group.removeEventListener("select", sync);
      });
    };

    // Ansicht → Layout (Menüleiste, App-Menü): nur noch die zwei gültigen
    // Kombinationen – Kartenansicht (immer vertikal), Tabelle klassisch.
    // Thunderbirds Punkte bleiben (Häkchen über mail.pane_config.dynamic,
    // syncViewChoice hält die Ansicht passend), nur umbenannt und Karten zuerst;
    // „breit“ und „Message List Header“ (ohne Wirkung, eigener Listenkopf) ausgeblendet
    const hookLayoutMenus = () => {
      const d = w.document;
      if (d.getElementById("messagePaneVertical")?.__mcLayout) {
        return;
      }
      const relabel = [
        ["messagePaneVertical", "appmenu_messagePaneVertical", tr("Card View")],
        ["messagePaneClassic", "appmenu_messagePaneClassic", tr("Table View: Classic")],
      ];
      for (const [menuId, appId, label] of relabel) {
        for (const el of [d.getElementById(menuId), d.getElementById(appId)]) {
          if (!el) {
            continue;
          }
          const old = { label: el.getAttribute("label"), accesskey: el.getAttribute("accesskey") };
          el.setAttribute("label", label);
          el.removeAttribute("accesskey");
          el.__mcLayout = true;
          this.restorers.push(() => {
            el.setAttribute("label", old.label);
            if (old.accesskey) {
              el.setAttribute("accesskey", old.accesskey);
            }
            delete el.__mcLayout;
          });
        }
      }
      for (const [firstId, beforeId] of [["messagePaneVertical", "messagePaneClassic"], ["appmenu_messagePaneVertical", "appmenu_messagePaneClassic"]]) {
        const el = d.getElementById(firstId), before = d.getElementById(beforeId);
        if (el && before && el.nextElementSibling !== null) {
          const next = el.nextElementSibling;
          before.before(el);
          this.restorers.push(() => next?.before(el));
        }
      }
      for (const id of ["messagePaneWide", "appmenu_messagePaneWide", "menu_toggleThreadPaneHeader", "appmenu_toggleThreadPaneHeader"]) {
        const el = d.getElementById(id);
        if (el && !el.hidden) {
          el.hidden = true;
          this.restorers.push(() => (el.hidden = false));
        }
      }
    };

    // Gibt es oben das Suchfeld? (fehlt, wenn die globale Suche/Indexierung
    // aus ist oder es aus der Toolbar entfernt wurde) – nur dann blendet
    // userChrome.css die Suchfelder in Einstellungen, Adressbuch, Aufgaben aus
    const markSearch = () => {
      const has = !!w.document.querySelector('#unifiedToolbarContent > li[item-id="search-bar"]');
      w.document.documentElement.toggleAttribute("mc-search", has);
      for (const tab of w.document.getElementById("tabmail")?.tabInfo || []) {
        tab.browser?.contentDocument?.documentElement?.toggleAttribute("mc-search", has);
      }
    };
    const markTab = () => {
      hookSearchForwarding();
      hookHelpMenu();
      hookPreviewMenu();
      hookNewTabMenus(w.document, this.restorers);
      try {
        hookTaskFilter();
        relinkTaskTree(w, this.restorers);
        hookTaskView(w, this.restorers);
        hookTaskCards(w, this.restorers);
      } catch (e) {
        log("task filter error", e);
      }
      try {
        hookLayoutMenus();
      } catch (e) {
        log("layout menu error", e);
      }
      this.todayPaneEverywhere(w);
      this.hideTodayPaneInChatOnce(w);
      styleContentPages();
      applySideState();
      w.setTimeout(applySideState, 400);
      w.setTimeout(applySideState, 1500);
      w.setTimeout(styleContentPages, 400);
      w.setTimeout(styleContentPages, 1500);
      const mode = w.document.getElementById("tabmail")?.currentTabInfo?.mode?.name;
      w.document.documentElement.toggleAttribute(
        "mc-mail",
        mode == "mail3PaneTab" || mode == "mailMessageTab"
      );
      w.document.documentElement.setAttribute("mc-tab", mode || "");
      markSearch();
      if (mode == "calendar") {
        w.document.getElementById("month-view")?.__mcMoreRefresh?.();
      }
      syncSearchForTab(mode);
      this.updateListHeader(w);
      syncSidebarWidth();
      w.setTimeout(syncSidebarWidth, 400); // Inhalte (Adressbuch …) evtl. später
      const current = w.document.getElementById("tabmail")?.currentTabInfo;
      hookSideDrag(current);
      w.setTimeout(() => hookSideDrag(current), 400);
      updateSideEdge();
      // Inhalt (Adressbuch, Einstellungen) ist evtl. erst später aufgebaut
      w.setTimeout(updateSideEdge, 300);
      w.setTimeout(updateSideEdge, 1200);
      // Tab-Leiste erscheint/verschwindet mit dem zweiten Tab → Kanten neu messen
      w.setTimeout(() => this.offsetUpdaters?.forEach(fn => fn()), 50);
    };
    // Esc in Einstellungen, Kalender, Adressbuch usw. schließt diesen Tab und
    // führt zurück zur vorherigen Ansicht (die Tab-Leiste ist ausgeblendet).
    const MAIL_MODES = new Set(["mail3PaneTab", "mailMessageTab"]);
    const onEscape = event => {
      if (event.key != "Escape" || event.defaultPrevented ||
          event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      const tabmail = w.document.getElementById("tabmail");
      const tab = tabmail?.currentTabInfo;
      if (!tab || MAIL_MODES.has(tab.mode?.name) || tabmail.tabInfo.length < 2) {
        return;
      }
      // Konto einrichten nicht versehentlich mit Esc verwerfen
      if (/^about:accountsetup/.test(tab.browser?.currentURI?.spec || "")) {
        return;
      }
      // Text in einem Eingabefeld: Esc leert zuerst nur das Feld
      const target = event.composedTarget || event.target;
      if (target && /^(input|textarea)$/i.test(target.localName) && target.value) {
        return;
      }
      // offenes Menü oder Dialog: Esc schließt zuerst diesen
      const doc = target?.ownerDocument;
      if (doc?.querySelector("menupopup[open], panel[open], dialog[open]") ||
          w.document.querySelector("menupopup[open], panel[open]")) {
        return;
      }
      event.preventDefault();
      tabmail.closeTab(tab);
    };
    const hooked = new WeakSet();
    const hookEscape = () => {
      const tabmail = w.document.getElementById("tabmail");
      const targets = [w];
      for (const tab of tabmail?.tabInfo || []) {
        const cw = (tab.browser || tab.chromeBrowser)?.contentWindow;
        if (cw) {
          targets.push(cw);
        }
      }
      for (const target of targets) {
        if (!hooked.has(target)) {
          hooked.add(target);
          target.addEventListener("keydown", onEscape);
          this.addWinRestorer(target == w ? null : target, () => target.removeEventListener("keydown", onEscape));
        }
      }
    };

    // Seitenleisten-Knopf wie Apple Mail: blendet nur die Ordnerliste aus/ein
    // (statt das Bereiche-Menü zu öffnen). Außerhalb der Mailansicht führt er
    // zurück zur Mail. Bereiche bleiben über ⌃1–⌃5 erreichbar.
    const toggleSidebar = () => {
      const tabmail = w.document.getElementById("tabmail");
      const tab = tabmail?.currentTabInfo;
      if (tab?.mode?.name == "mail3PaneTab") {
        const ab = tab.chromeBrowser?.contentWindow;
        const splitter = ab?.paneLayout?.folderPaneSplitter;
        if (splitter) {
          this.animateSidebar(ab, splitter, () => {
            sidebarTip?.();
            placeSideGrip();
          });
        }
      } else {
        // in allen anderen Bereichen deren Seitenleiste ein-/ausblenden
        toggleSpaceSidebar();
      }
    };
    const hookSidebarButton = () => {
      const button = w.document.getElementById("spacesPinnedButton");
      if (!button || button.dataset.mcSidebar) {
        return;
      }
      button.dataset.mcSidebar = "1";
      const popup = button.querySelector("menupopup");
      const blockPopup = event => event.preventDefault();
      const onPress = event => {
        if (event.type == "mousedown" && event.button != 0) {
          return;
        }
        if (event.type == "keydown" && event.key != "Enter" && event.key != " ") {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        toggleSidebar();
      };
      popup?.addEventListener("popupshowing", blockPopup);
      button.addEventListener("mousedown", onPress, true);
      button.addEventListener("keydown", onPress, true);
      // Tooltip je nach Zustand: „Hide Sidebar“ bzw. „Show Sidebar“
      const oldTooltip = button.getAttribute("tooltiptext");
      const updateTip = () => {
        const tab = w.document.getElementById("tabmail")?.currentTabInfo;
        let text;
        if (tab?.mode?.name == "mail3PaneTab") {
          const collapsed = tab.chromeBrowser?.contentWindow?.paneLayout?.folderPaneSplitter?.isCollapsed;
          text = collapsed
            ? (tr("Show Sidebar"))
            : (tr("Hide Sidebar"));
        } else {
          text = sideHidden()
            ? (tr("Show Sidebar"))
            : (tr("Hide Sidebar"));
        }
        button.setAttribute("tooltiptext", text);
      };
      updateTip();
      sidebarTip = updateTip; // nach der Animation erneut aufrufen
      button.addEventListener("mouseenter", updateTip);
      this.restorers.push(() => {
        popup?.removeEventListener("popupshowing", blockPopup);
        button.removeEventListener("mousedown", onPress, true);
        button.removeEventListener("keydown", onPress, true);
        button.removeEventListener("mouseenter", updateTip);
        delete button.dataset.mcSidebar;
        sidebarTip = null;
        if (oldTooltip) {
          button.setAttribute("tooltiptext", oldTooltip);
        } else {
          button.removeAttribute("tooltiptext");
        }
      });
    };

    // Bereiche-Leiste ein-/ausblenden: eigener kleiner Knopf unten links
    // (statt Thunderbirds Knopf in der Leiste), mit derselben Animation wie
    // die Ordnerliste. Funktioniert unabhängig davon, ob die Ordner sichtbar sind.
    const hookSpacesToggle = () => {
      const d = w.document;
      const bar = d.getElementById("spacesToolbar");
      if (!bar || !w.gSpacesToolbar || d.getElementById("mcSpacesToggle")) {
        return;
      }
      const btn = d.createElementNS("http://www.w3.org/1999/xhtml", "button");
      btn.id = "mcSpacesToggle";
      btn.type = "button";
      // Tooltip je nach Zustand: „Hide Spaces“ bzw. „Show Spaces“
      const updateTip = () => {
        const label = w.gSpacesToolbar.isHidden
          ? (tr("Show Spaces"))
          : (tr("Hide Spaces"));
        btn.title = label;
        btn.setAttribute("aria-label", label);
      };
      updateTip();
      btn.addEventListener("mouseenter", updateTip);
      btn.addEventListener("click", () => this.animateSpaces(w, updateTip));
      bar.after(btn);
      // Pfeil nach dem Zustand (data-mc-hidden): beim Klick wechselt er sofort
      // (animateSpaces), auch wenn Thunderbird die Leiste anders ein-/ausblendet
      const syncArrow = () => {
        if (!w.__mcSpacesAnimating) {
          btn.toggleAttribute("data-mc-hidden", !!w.gSpacesToolbar.isHidden);
        }
      };
      syncArrow();
      const arrowMo = new w.MutationObserver(syncArrow);
      arrowMo.observe(bar, { attributes: true, attributeFilter: ["hidden"] });
      this.restorers.push(() => {
        arrowMo.disconnect();
        btn.remove();
      });
      // „Anpassen…“ der Bereiche-Leiste ausblenden: Thunderbirds Panel hängt am
      // ausgeblendeten Knopf #collapseButton – es öffnet nicht und sperrt danach
      // das Ein-/Ausblenden der Leiste (isCustomizing bleibt gesetzt); die
      // Farben gibt ohnehin halo.spaces vor
      const custItems = ["spacesToolbarContextCustomize", "settingsContextOpenCustomizeItem"]
        .map(id => d.getElementById(id)).filter(Boolean);
      const custSep = d.getElementById("settingsContextOpenCustomizeItem")?.previousElementSibling;
      const custHide = [...custItems, ...(custSep?.localName == "menuseparator" ? [custSep] : [])];
      custHide.forEach(el => (el.hidden = true));
      // das Kontextmenü der leeren Leiste hat dann keinen Eintrag mehr – nicht
      // als leere Fläche öffnen
      const spacesMenu = d.getElementById("spacesToolbarContextMenu");
      const noEmpty = e => {
        if (e.target == spacesMenu && ![...spacesMenu.children].some(c => !c.hidden)) {
          e.preventDefault();
        }
      };
      spacesMenu?.addEventListener("popupshowing", noEmpty);
      this.restorers.push(() => {
        custHide.forEach(el => (el.hidden = false));
        spacesMenu?.removeEventListener("popupshowing", noEmpty);
      });
      // Tooltips der Bereiche nur mit Namen („Mail“ statt „Mail (⌃ 1)“):
      // Thunderbird setzt sie per Fluent aus Titel und Kurzbefehl, auch
      // später noch (Übersetzung läuft verzögert) – also jedes Mal den
      // Titel aus den Fluent-Argumenten übernehmen
      const plainTitle = space => {
        if (space.hasAttribute("mc-fifth-icon")) {
          return; // fünfter Bereich: Titel der Erweiterung bzw. Webseite
        }
        let name;
        try {
          name = JSON.parse(space.getAttribute("data-l10n-args") || "{}").title;
        } catch {}
        if (name && space.title != name) {
          space.title = name;
        }
      };
      // (alle Knöpfe beobachten – beim ersten Aufruf fehlen die Argumente evtl. noch)
      const spaces = [...bar.querySelectorAll("#mailButton, #addressBookButton, #calendarButton, #tasksButton, #chatButton")];
      spaces.forEach(plainTitle);
      const tipMo = new w.MutationObserver(records => records.forEach(r => plainTitle(r.target)));
      spaces.forEach(space => tipMo.observe(space, { attributes: true, attributeFilter: ["title", "data-l10n-args"] }));
      this.restorers.push(() => {
        tipMo.disconnect();
        spaces.forEach(space => w.document.l10n?.translateElements([space]));
      });
    };

    // Today-Pane ein-/ausblenden: Knopf unten rechts (Gegenstück zum
    // Bereiche-Knopf unten links) statt des ✕ oben in der Today-Pane
    const hookTodayToggle = () => {
      const d = w.document;
      const panel = d.getElementById("today-pane-panel");
      const command = d.getElementById("calendar_toggle_todaypane_command");
      if (!command || d.getElementById("mcTodayToggle")) {
        return;
      }
      const btn = d.createElementNS("http://www.w3.org/1999/xhtml", "button");
      btn.id = "mcTodayToggle";
      btn.type = "button";
      // Tageszahl im Kalender-Symbol: übernommen von Thunderbirds Knopf in der
      // Statusleiste (dessen Kalender-Code aktualisiert sie um Mitternacht);
      // fehlt der, selbst aus dem heutigen Datum
      const day = d.createElementNS("http://www.w3.org/1999/xhtml", "span");
      day.className = "mc-today-day";
      day.setAttribute("aria-hidden", "true");
      btn.append(day);
      const source = () => d.querySelector("#calendar-status-todaypane-button .toolbarbutton-day-text");
      const setDay = () => {
        const tb = source();
        day.textContent = tb?.value || tb?.textContent || String(new Date().getDate());
      };
      setDay();
      const tbDay = source();
      const dayMo = tbDay ? new w.MutationObserver(setDay) : null;
      dayMo?.observe(tbDay, { attributes: true, childList: true, characterData: true, subtree: true });
      const dayTimer = tbDay ? null : w.setInterval(setDay, 60 * 1000);
      this.restorers.push(() => {
        dayMo?.disconnect();
        dayTimer && w.clearInterval(dayTimer);
      });
      const updateTip = () => {
        const shown = !!w.TodayPane?.isVisible;
        const label = shown
          ? (tr("Hide Today Pane"))
          : (tr("Show Today Pane"));
        btn.title = label;
        btn.setAttribute("aria-label", label);
        btn.toggleAttribute("data-shown", shown);
      };
      updateTip();
      btn.addEventListener("mouseenter", updateTip);
      btn.addEventListener("click", () => this.animateTodayPane(w, command, updateTip));
      const mo = panel ? new w.MutationObserver(() => {
        updateTip();
        w.__mcTodayTopSync?.();
        placeTodayGrip?.();
      }) : null;
      // (current: Bereich gewechselt)
      mo?.observe(panel, { attributes: true, attributeFilter: ["collapsed", "hidden", "collapsedinmodes", "current"] });
      let placeTodayGrip = null;
      // Breite der Today-Pane fest (CSS). Ziehen an der Trennlinie wie bei den
      // Seitenleisten (dragPane, gespiegelt): 12 px nach rechts blendet sie
      // sofort aus, ohne Animation, das „+“ gleich mit; im selben Zug zurück
      // nach links ist sie wieder da. Ausgeblendet bleibt am rechten Rand eine
      // schmale Greifzone (#mcTodayGrip), an der man sie wieder herauszieht
      const TODAY_SNAP = 12;
      const todaySplitter = d.getElementById("today-splitter");
      const row0 = d.getElementById("unifiedToolbarContainer");
      const grip = d.createElementNS("http://www.w3.org/1999/xhtml", "div");
      grip.id = "mcTodayGrip";
      grip.setAttribute("aria-hidden", "true");
      grip.style.cssText = "position: fixed; z-index: 10; width: 5px; cursor: w-resize; display: none;";
      d.documentElement.append(grip);
      // Greifzone nur, wo die Today-Pane erscheinen kann (Kalender aktiv, Bereich mit Today-Pane)
      const placeGrip = () => {
        const modes = (panel?.getAttribute("mode") || "").split(",");
        const box = d.getElementById("tabmail-container")?.getBoundingClientRect();
        const show = panel && !w.TodayPane?.isVisible && !d.documentElement.hasAttribute("calendar-deactivated") &&
          modes.includes(w.gCurrentMode) && box?.height;
        grip.style.display = show ? "block" : "none";
        if (show) {
          grip.style.left = `${Math.round(box.right - 5)}px`;
          grip.style.top = `${Math.round(box.top)}px`;
          grip.style.height = `${Math.round(box.height)}px`;
        }
      };
      const onTodayDown = event => {
        if (event.button != 0 || panel?.__mcAnimating) {
          return;
        }
        dragPane(event, {
          side: "right",
          hidden: () => !w.TodayPane?.isVisible,
          width: () => panel.getBoundingClientRect().width,
          threshold: (startHidden, startWidth) => (startHidden ? TODAY_SNAP : startWidth - TODAY_SNAP),
          setHidden: hidden => {
            if (hidden == !w.TodayPane?.isVisible) {
              return;
            }
            if (hidden) {
              row0?.removeAttribute("data-mc-tp-open");
            }
            command.doCommand();
            updateTip();
            w.__mcTodayTopSync?.();
            placeGrip();
          },
          done: () => {
            placeGrip();
            this.offsetUpdaters?.forEach(fn => fn());
          },
        });
      };
      for (const el of [todaySplitter, grip]) {
        el?.addEventListener("pointerdown", onTodayDown);
        el?.addEventListener("mousedown", blockNativeSplitter, true);
      }
      placeGrip();
      const gripMo = new w.MutationObserver(placeGrip);
      gripMo.observe(d.documentElement, { attributes: true, attributeFilter: ["calendar-deactivated", "mc-tab"] });
      // (Fenstergröße, Bereiche-Leiste)
      const gripRo = new w.ResizeObserver(placeGrip);
      const gripBox = d.getElementById("tabmail-container");
      gripBox && gripRo.observe(gripBox);
      this.restorers.push(() => {
        todaySplitter?.removeEventListener("pointerdown", onTodayDown);
        todaySplitter?.removeEventListener("mousedown", blockNativeSplitter, true);
        gripMo.disconnect();
        gripRo.disconnect();
        grip.remove();
      });
      placeTodayGrip = placeGrip;
      // in die Toolbar-Zeile; darüber reicht die Today-Pane bis ganz oben
      // (#mcTodayTop in ihrer Breite) – wie die Seitenleiste links
      const row = d.getElementById("unifiedToolbarContainer");
      const top = d.createElementNS("http://www.w3.org/1999/xhtml", "div");
      top.id = "mcTodayTop";
      // Überschrift „Today Pane“ oben in der Toolbar-Zeile, neben dem Knopf
      const title = d.createElementNS("http://www.w3.org/1999/xhtml", "span");
      title.id = "mcTodayTitle";
      title.textContent = tr("Today Pane");
      top.append(title);
      row?.prepend(top);
      // Wetter statt der festen Sonne (Option, Standard aus)
      Weather.attach(w, title);
      (row || d.body).append(btn);
      // „+“ oben rechts in der Today-Pane, gleiche Größe und Höhe wie der
      // Today-Knopf – fragt nach Termin oder Aufgabe (statt unten unter der Liste)
      const plus = d.createElementNS("http://www.w3.org/1999/xhtml", "button");
      plus.id = "mcTodayNew";
      plus.type = "button";
      plus.title = tr("New Event") + " / " + tr("New Task");
      plus.setAttribute("aria-label", plus.title);
      plus.addEventListener("click", event => {
        event.stopPropagation();
        newPopup?.below(plus);
      });
      btn.after(plus);
      this.restorers.push(() => {
        plus.remove();
        row?.removeAttribute("data-mc-tp-open");
        row?.removeAttribute("data-mc-tp-none");
      });
      // Verlauf am Kartenboden nur, solange unten noch Termine verborgen sind
      const agenda = d.getElementById("agenda");
      if (agenda) {
        const fade = () => {
          if (panel?.__mcAnimating) {
            return; // nach der Animation misst sync() ohnehin neu
          }
          agenda.toggleAttribute("data-mc-more", agenda.scrollTop + agenda.clientHeight < agenda.scrollHeight - 2);
        };
        const fadeRo = new w.ResizeObserver(fade);
        const fadeMo = new w.MutationObserver(fade);
        agenda.addEventListener("scroll", fade, { passive: true });
        fadeRo.observe(agenda);
        fadeMo.observe(agenda, { childList: true });
        fade();
        this.restorers.push(() => {
          agenda.removeEventListener("scroll", fade);
          fadeRo.disconnect();
          fadeMo.disconnect();
          agenda.removeAttribute("data-mc-more");
        });
      }
      // Breite der Today-Pane (0, wenn aus) an die Toolbar-Zeile – Suchfeld,
      // Fläche und Knopf richten sich danach, auch während der Animation
      // während der Animation übergibt sie die Breite (animWidth) – dann nur
      // diese setzen, ohne Fensterknöpfe/Titel neu zu vermessen (das kostet
      // pro Bild zwei Layout-Durchläufe und ließ die Animation ruckeln)
      const sync = animWidth => {
        if (!row) {
          return;
        }
        if (typeof animWidth == "number") {
          setVar(row, "--mc-tp-w", `${Math.round(animWidth)}px`);
          row.toggleAttribute("data-mc-tp-none", Math.round(animWidth) <= 0);
          return;
        }
        if (panel?.__mcAnimating) {
          return; // Größen-Beobachter während der Animation: nichts vermessen
        }
        const width = panel && w.TodayPane?.isVisible ? Math.round(panel.getBoundingClientRect().width) : 0;
        const caption = captionWidth(d);
        setVar(row, "--mc-tp-w", `${width}px`);
        setVar(row, "--mc-tp-room", `${width}px`);
        row.toggleAttribute("data-mc-tp-open", width > 0);
        // ohne Today-Pane auch keine Fläche oben (ihr Innenabstand ließe
        // sonst rechts neben dem Knopf einen grauen Streifen stehen)
        row.toggleAttribute("data-mc-tp-none", width <= 0);
        setVar(row, "--mc-caption-w", `${caption}px`);
        const tail = rowTail(d);
        setVar(row, "--mc-row-tail", `${tail}px`);
        // neben Knopf und Fensterknöpfen zu wenig Platz: nur die Sonne
        // links Today-Knopf (12 + 40 + 8), rechts „+“ (8 + 40 + 12) und ggf. ≡/Fensterknöpfe
        title.toggleAttribute("data-narrow", width - 60 - (60 + Math.max(caption, tail)) < 110);
      };
      w.__mcTodayTopSync = sync;
      const ro = panel ? new w.ResizeObserver(sync) : null;
      ro?.observe(panel);
      sync();
      this.restorers.push(() => {
        mo?.disconnect();
        ro?.disconnect();
        btn.remove();
        top.remove();
        row?.style.removeProperty("--mc-tp-w");
        delete w.__mcTodayTopSync;
      });
    };

    // Markieren-Knopf der Symbolleiste als geteilter Stern-Knopf: ein Klick
    // auf den Stern (die ersten 40 px) setzt bzw. entfernt den Stern
    // („Starred“) der gewählten Mail(s) wie Apple Mails Markierung, der Pfeil
    // rechts öffnet weiter Thunderbirds Menü. Mit der Tastatur bleibt es beim
    // Menü. Der Knopf zeigt den Stern der gewählten Mail gefüllt (mc-starred)
    // und hebt beim Überfahren nur die Hälfte unter der Maus hervor (mc-hot)
    const STAR_PART = 40;
    const hookStarButton = () => {
      if (w.__mcStarHook === HOOK_OWNER) {
        return;
      }
      w.__mcStarHook = HOOK_OWNER;
      const markButton = target => target?.closest?.('#unifiedToolbarContent > li[item-id="mark-as"] button');
      const onStar = (btn, event) => {
        const r = btn.getBoundingClientRect();
        const x = w.getComputedStyle(btn).direction == "rtl" ? r.right - event.clientX : event.clientX - r.left;
        return x < STAR_PART;
      };
      const onClick = event => {
        const btn = markButton(event.target);
        if (!btn || btn.disabled || event.button != 0 || !event.detail || !onStar(btn, event)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        w.goDoCommand("cmd_markAsFlagged");
        this.updateStarButton(w);
      };
      const onMove = event => {
        const btn = markButton(event.target);
        const li = w.document.querySelector('#unifiedToolbarContent > li[item-id="mark-as"]');
        if (!li) {
          return;
        }
        if (!btn) {
          li.removeAttribute("mc-hot");
          return;
        }
        const part = onStar(btn, event) ? "star" : "menu";
        if (li.getAttribute("mc-hot") != part) {
          li.setAttribute("mc-hot", part);
        }
      };
      // Stern an anderer Stelle geändert (Mailliste, Taste S, Kontextmenü)
      const listener = {
        onFolderPropertyFlagChanged: (hdr, property, oldFlag, newFlag) => {
          if (property == "Flagged") {
            this.updateStarButton(w);
          }
        },
      };
      // Tabwechsel und neu geladene Mail (Nachrichten-Tab: Weiterblättern,
      // nächste Mail nach dem Löschen) – „MsgLoaded“ steigt aus about:message auf
      const refresh = event => {
        w.setTimeout(() => this.updateStarButton(w), 0);
        if (event?.type == "MsgLoaded") {
          fitWideMessage(event.target);
        }
      };
      const tabs = w.document.getElementById("tabmail")?.tabContainer;
      w.addEventListener("click", onClick, true);
      w.addEventListener("mousemove", onMove, true);
      w.addEventListener("MsgLoaded", refresh, true);
      tabs?.addEventListener("TabSelect", refresh);
      MailServices.mailSession.AddFolderListener(listener, Ci.nsIFolderListener.propertyFlagChanged);
      const remove = () => MailServices.mailSession.RemoveFolderListener(listener);
      w.addEventListener("unload", remove, { once: true });
      this.restorers.push(() => {
        w.removeEventListener("click", onClick, true);
        w.removeEventListener("mousemove", onMove, true);
        w.removeEventListener("MsgLoaded", refresh, true);
        tabs?.removeEventListener("TabSelect", refresh);
        remove();
        for (const li of w.document.querySelectorAll('#unifiedToolbarContent > li[item-id="mark-as"]')) {
          li.removeAttribute("mc-starred");
          li.removeAttribute("mc-hot");
        }
        delete w.__mcStarHook;
      });
    };

    // Titel und Anzahl über der Mailliste in der Toolbar-Zeile, rechts davon
    // Filter und „…“ in einer Kapsel – wie Apple Mail. Thunderbirds eigene
    // Kopfzeile in der Liste wird per CSS ausgeblendet. Der Filter zeigt nur
    // ungelesene Mails (setUnreadFilter); Thunderbirds Schnellfilter-Leiste
    // gibt es nicht mehr, ihre Menüeinträge (Ansicht → Symbolleisten,
    // App-Menü) entfallen.
    const hookListHeader = () => {
      const d = w.document;
      const row = d.getElementById("unifiedToolbarContainer");
      if (!row || d.getElementById("mcListHeader")) {
        return;
      }
      const X = "http://www.w3.org/1999/xhtml";
      const el = (tag, cls) => {
        const e = d.createElementNS(X, tag);
        if (cls) e.className = cls;
        return e;
      };
      const box = el("div");
      box.id = "mcListHeader";
      const text = el("div", "mc-lh-text");
      const title = el("div", "mc-lh-title");
      const count = el("div", "mc-lh-count");
      text.append(title, count);
      const tools = el("div", "mc-lh-tools");
      const filter = el("button", "mc-lh-filter");
      filter.title = tr("Show Only Unread Messages");
      filter.setAttribute("aria-pressed", "false");
      const more = el("button", "mc-lh-more");
      more.title = tr("Message List Display Options");
      tools.append(filter, more);
      box.append(text, tools);
      const ab = () => d.getElementById("tabmail")?.currentAbout3Pane;
      const taskPopup = (button, kind) => {
        const popup = d.getElementById("mcTaskFilterPopup");
        if (!popup) {
          return false;
        }
        popup.dataset.kind = kind;
        const r = button.getBoundingClientRect();
        popup.openPopupAtScreen(w.mozInnerScreenX + r.left, w.mozInnerScreenY + r.bottom + 4, false);
        return true;
      };
      const inTasks = () => d.getElementById("tabmail")?.currentTabInfo?.mode?.name == "tasks";
      filter.addEventListener("click", () => {
        if (inTasks()) {
          taskPopup(filter, "filter");
          return;
        }
        const a3 = ab();
        if (a3) {
          this.setUnreadFilter(a3, !this.unreadFilterOn(a3));
        }
      });
      more.addEventListener("click", () => {
        if (inTasks() && taskPopup(more, "view")) {
          return;
        }
        const cw = abWindow();
        const popup = cw
          ? cw.document.getElementById("sortContext")
          : ab()?.document.getElementById("threadPaneDisplayContext");
        const r = more.getBoundingClientRect();
        popup?.openPopupAtScreen(w.mozInnerScreenX + r.left, w.mozInnerScreenY + r.bottom + 4, false);
      });
      row.append(box);
      this.restorers.push(() => box.remove());
      for (const id of ["view_toolbars_popup_quickFilterBar", "appmenu_quickFilterBar"]) {
        const item = d.getElementById(id);
        if (item && !item.hidden) {
          item.hidden = true;
          this.restorers.push(() => (item.hidden = false));
        }
      }
      this.updateListHeader(w);
    };

    // Terminspalte rechts im Stil von Fastmail, in unserem Design:
    // Minikalender oben, darunter Monatstitel und Agenda mit Wochentag und
    // großer Tageszahl links, Termine als Farbblöcke rechts.
    // Monatsansicht wie Apple Kalender: passen nicht alle Termine in einen
    // Tag, steht unten „+N weitere“ – ein Klick öffnet den Tag in der
    // Tagesansicht. Dazu Zoom per Trackpad (Pinch) oder ⌘/Ctrl + Mausrad:
    // höhere Wochenzeilen, die Monatsansicht wird dann scrollbar.
    const ZOOM_PREF = "extensions.mailcards.monthZoom";
    const hookMonthView = () => {
      const d = w.document;
      const mv = d.getElementById("month-view");
      if (!mv || mv.__mcMore) {
        return;
      }
      mv.__mcMore = true;
      // Höhe der Monatstabelle in Pixeln: sichtbare Höhe × Zoom (eine
      // Prozentangabe greift in der scrollbaren Ansicht nicht mehr)
      const applyHeight = () => {
        const table = mv.querySelector("table.monthtable");
        const z = parseFloat(mv.style.getPropertyValue("--mc-month-zoom")) || 1;
        if (!table) {
          return;
        }
        if (z <= 1.01) {
          table.style.removeProperty("height");
          return;
        }
        const visible = mv.clientHeight - (table.getBoundingClientRect().top - mv.getBoundingClientRect().top - mv.scrollTop);
        table.style.setProperty("height", `${Math.round(Math.max(200, visible) * z)}px`, "important");
      };
      const setZoom = z => {
        const zoom = Math.max(1, Math.min(3, Math.round(z * 100) / 100));
        mv.style.setProperty("--mc-month-zoom", zoom);
        mv.toggleAttribute("mc-zoomed", zoom > 1.01);
        applyHeight();
        Services.prefs.setStringPref(ZOOM_PREF, String(zoom));
        return zoom;
      };
      let zoom = setZoom(parseFloat(Services.prefs.getStringPref(ZOOM_PREF, "1")) || 1);
      let pending = false;
      const update = () => {
        pending = false;
        for (const box of mv.querySelectorAll("calendar-month-day-box")) {
          const list = box.querySelector(".calendar-month-day-box-list");
          let more = box.querySelector(":scope > .mc-more");
          if (!list) {
            continue;
          }
          // ab Thunderbird 159 steckt die Liste in einem eigenen Rollbereich
          // (.calendar-month-day-box-scroll) und ist selbst so hoch wie alle
          // Termine – gemessen wird am sichtbaren Bereich
          const lr = (list.closest(".calendar-month-day-box-scroll") || list).getBoundingClientRect();
          const items = [...list.children];
          // Platz für die Zeile „+N weitere“ freihalten, sobald etwas fehlt
          for (const i of items) {
            i.removeAttribute("data-mc-cut");
          }
          let cut = [];
          if (items.some(i => i.getBoundingClientRect().bottom > lr.bottom + 1)) {
            cut = items.filter(i => i.getBoundingClientRect().bottom > lr.bottom - 18);
          }
          const hidden = cut.length;
          for (const i of cut) {
            i.setAttribute("data-mc-cut", "true");
          }
          if (!hidden) {
            more?.remove();
            box.removeAttribute("mc-has-more");
            continue;
          }
          if (!more) {
            more = d.createElementNS("http://www.w3.org/1999/xhtml", "button");
            more.className = "mc-more";
            more.addEventListener("click", event => {
              event.stopPropagation();
              const date = box.date;
              if (date) {
                w.switchToView?.("day");
                w.currentView?.()?.goToDay?.(date);
              }
            });
            more.addEventListener("dblclick", event => event.stopPropagation());
            box.appendChild(more);
          }
          box.setAttribute("mc-has-more", "true");
          // nur bei neuem Text setzen – sonst ersetzt Gecko den Textknoten, der
          // Beobachter unten meldet das, und update() liefe in jedem Bild erneut
          const label = tr("+{n} more", { n: hidden });
          if (more.textContent != label) {
            more.textContent = label;
          }
        }
      };
      // nur messen, wenn der Kalender vorne ist – sonst liefe das bei jeder
      // Größenänderung (z. B. Ein-/Ausblend-Animation in der Mail) mit
      let dirty = false;
      const visible = () => w.document.getElementById("tabmail")?.currentTabInfo?.mode?.name == "calendar";
      const schedule = () => {
        if (!visible() || w.__mcSpacesAnimating) {
          dirty = true;
          return;
        }
        if (!pending) {
          pending = true;
          w.requestAnimationFrame(update);
        }
      };
      mv.__mcMoreRefresh = () => {
        if (dirty) {
          dirty = false;
          schedule();
        }
      };
      const mo = new w.MutationObserver(records => {
        // eigene Änderungen (die „+N“-Knöpfe) lösen keine neue Runde aus
        if (records.some(r => !r.target.closest?.(".mc-more") &&
            (![...r.addedNodes, ...r.removedNodes].every(n => n.classList?.contains("mc-more")) || r.type == "attributes"))) {
          schedule();
        }
      });
      mo.observe(mv, { childList: true, subtree: true });
      const ro = new w.ResizeObserver(() => {
        schedule();
      });
      ro.observe(mv);
      const table = mv.querySelector("table.monthtable");
      if (table) {
        ro.observe(table);
      }
      // Fenstergröße geändert: Tabellenhöhe neu berechnen
      const outer = new w.ResizeObserver(() => applyHeight());
      outer.observe(mv.parentElement || mv);
      // Zoom: Pinch-Geste auf dem Trackpad und ⌘/Ctrl + Mausrad
      const onGesture = event => {
        zoom = setZoom(zoom * (1 + (event.delta || 0) / 100));
        event.preventDefault();
        schedule();
      };
      const onWheel = event => {
        if (!(event.ctrlKey || event.metaKey)) {
          return;
        }
        event.preventDefault();
        zoom = setZoom(zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08));
        schedule();
      };
      // Mausrad blättert immer den Monat – Thunderbird gibt es sonst an einen
      // Tag weiter, dessen Einträge nicht ganz hineinpassen (der scrollt dann
      // unsichtbar in sich, und das Blättern scheint zu hängen); verborgene
      // Einträge zeigt „+N weitere“
      let pixels = 0;
      let lastWheel = -Infinity;
      let lastDir = 0;
      const onMonthWheel = event => {
        if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || mv.hasAttribute("mc-zoomed") ||
            !Services.prefs.getBoolPref("calendar.view.mousescroll", true)) {
          return;
        }
        event.stopPropagation();
        event.preventDefault();
        // Jede Raste blättert sofort einen Monat (macOS liefert eine Raste als
        // weiche Folge kleiner Schritte, zusammen ~100 px – Thunderbirds
        // Schwelle von 150 px verschluckte sie). Innerhalb einer Folge
        // (Abstand < 150 ms) erst nach weiteren 200 px den nächsten Monat –
        // schnelles Drehen und das Trackpad blättern so weiter.
        let delta = 0;
        if (!event.deltaY) {
          return;
        }
        const now = event.timeStamp;
        const dir = Math.sign(event.deltaY);
        if (event.deltaMode != event.DOM_DELTA_PIXEL) {
          delta = dir;
        } else if (now - lastWheel > 150 || dir != lastDir) {
          delta = dir;
          pixels = 0;
        } else {
          pixels += event.deltaY;
          if (Math.abs(pixels) >= 200) {
            delta = dir;
            pixels = 0;
          }
        }
        lastWheel = now;
        lastDir = dir;
        if (delta) {
          mv.moveView(delta);
        }
      };
      mv.addEventListener("wheel", onMonthWheel, { capture: true, passive: false });
      this.restorers.push(() => mv.removeEventListener("wheel", onMonthWheel, { capture: true }));
      mv.addEventListener("MozMagnifyGestureUpdate", onGesture);
      mv.addEventListener("MozMagnifyGesture", onGesture);
      mv.addEventListener("wheel", onWheel, { passive: false });
      this.restorers.push(() => {
        mo.disconnect();
        ro.disconnect();
        outer.disconnect();
        mv.querySelector("table.monthtable")?.style.removeProperty("height");
        mv.removeEventListener("MozMagnifyGestureUpdate", onGesture);
        mv.removeEventListener("MozMagnifyGesture", onGesture);
        mv.removeEventListener("wheel", onWheel);
        for (const el of mv.querySelectorAll(".mc-more")) {
          el.remove();
        }
        mv.style.removeProperty("--mc-month-zoom");
        mv.removeAttribute("mc-zoomed");
        delete mv.__mcMore;
      });
      schedule();
    };

    const decorateAgenda = () => {
      const d = w.document;
      const agenda = d.getElementById("agenda");
      if (!agenda || agenda.__mcAgenda) {
        return;
      }
      agenda.__mcAgenda = true;
      // einmalig: Minikalender statt Mini-Tagesanzeige in allen Bereichen und
      // eine breitere Spalte (beides über ▾-Menü bzw. Ziehen änderbar)
      const ONCE = "extensions.mailcards.todayPaneLayout";
      if (!Services.prefs.getBoolPref(ONCE, false)) {
        try {
          const panel = d.getElementById("today-pane-panel");
          const modes = (panel.getAttribute("mode") || "").split(",").filter(Boolean);
          const all = modes.join(",");
          d.getElementById("today-minimonth-box")?.setAttribute("collapsedinmodes", "");
          d.getElementById("mini-day-box")?.setAttribute("collapsedinmodes", all);
          d.getElementById("today-none-box")?.setAttribute("collapsedinmodes", all);
          panel.setAttribute("modewidths", modes.map(() => "280").join(","));
          panel.style.width = "280px";
          for (const id of ["today-minimonth-box", "mini-day-box", "today-none-box", "today-pane-panel"]) {
            const el = d.getElementById(id);
            for (const attr of ["collapsedinmodes", "modewidths"]) {
              if (el?.hasAttribute(attr)) {
                Services.xulStore.setValue(d.documentURI, id, attr, el.getAttribute(attr));
              }
            }
          }
          w.TodayPane?.displayMiniSection("minimonth");
          Services.prefs.setBoolPref(ONCE, true);
        } catch (e) {
          log("today pane layout error", String(e).slice(0, 160));
        }
      }
      const locale = Services.locale.appLocaleAsBCP47;
      const wdFmt = new Intl.DateTimeFormat(locale, { weekday: "short" });
      const monthFmt = new Intl.DateTimeFormat(locale, { month: "long" });
      const X = "http://www.w3.org/1999/xhtml";
      const title = d.createElementNS(X, "div");
      title.id = "mcAgendaTitle";
      // ‹  Monat Jahr  › – blättert monatsweise; die Liste zeigt die Termine
      // des gezeigten Monats (im aktuellen Monat ab heute)
      const mkChevron = (cls, label, dir) => {
        const b = d.createElementNS(X, "button");
        b.className = `mc-agenda-nav ${cls}`;
        b.type = "button";
        b.title = label;
        b.setAttribute("aria-label", label);
        b.addEventListener("click", () => this.shiftAgendaMonth(w, dir));
        return b;
      };
      const label = d.createElementNS(X, "span");
      label.className = "mc-agenda-month";
      title.append(
        mkChevron("mc-prev", tr("Previous Month"), -1),
        label,
        mkChevron("mc-next", tr("Next Month"), 1)
      );
      agenda.before(title);
      this.hookAgendaMonthRange(w);
      const apply = () => {
        const today = new Date();
        const todayKey = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
        let firstDate = null;
        for (const li of agenda.querySelectorAll(":scope > li.agenda-listitem")) {
          const key = li.dateString || "";
          if (key.length >= 8) {
            const date = new Date(+key.slice(0, 4), +key.slice(4, 6) - 1, +key.slice(6, 8));
            firstDate ??= date;
            const header = li.querySelector(".agenda-date-header");
            if (header) {
              header.dataset.mcWd = wdFmt.format(date).replace(/\.$/, "");
              header.dataset.mcDay = String(date.getDate());
              header.toggleAttribute("data-mc-today", key.slice(0, 8) == todayKey);
            }
          }
          // bald beginnend (in den nächsten 3 Stunden): Zusatz „in 2 hr“ zeigen
          try {
            const start = li.item?.startDate;
            const begins = start && !start.isDate ? start.nativeTime / 1000 - Date.now() : Infinity;
            li.toggleAttribute("data-mc-soon", begins > 0 && begins <= 3 * 3600 * 1000);
          } catch {}
          // Kalenderfarbe für den Farbblock
          const dot = li.querySelector(".agenda-listitem-calendar");
          const details = li.querySelector(".agenda-listitem-details");
          let color = dot ? w.getComputedStyle(dot).backgroundColor : "";
          if ((!color || color == "rgba(0, 0, 0, 0)") && details) {
            color = details.style.backgroundColor || w.getComputedStyle(details).backgroundColor;
          }
          if (color && color != "rgba(0, 0, 0, 0)") {
            li.style.setProperty("--mc-c", color);
          }
        }
        // Monat der Liste (Starttag der Today-Pane), sonst des ersten Termins
        let date = firstDate || today;
        try {
          const start = w.TodayPane?.start;
          if (start) {
            date = new Date(start.year, start.month, start.day);
          }
        } catch {}
        const month = monthFmt.format(date);
        label.replaceChildren(
          Object.assign(d.createElementNS(X, "b"), { textContent: month }),
          d.createTextNode(` ${date.getFullYear()}`)
        );
      };
      let pending = false;
      const mo = new w.MutationObserver(() => {
        if (!pending) {
          pending = true;
          w.requestAnimationFrame(() => {
            pending = false;
            apply();
          });
        }
      });
      mo.observe(agenda, { childList: true, subtree: true, characterData: true });
      apply();
      this.restorers.push(() => {
        mo.disconnect();
        title.remove();
        delete agenda.__mcAgenda;
      });
    };

    // Emoji vor Termintiteln (Monat, Woche, Tag, ganztägig, Today-Pane):
    // Attribut am Titel, gezeichnet von spaces.css – der Termin bleibt unverändert
    const EMOJI_LABELS = ".event-name-label, .agenda-listitem-title";
    const annotateEmoji = root => {
      const on = Services.prefs.getBoolPref(EMOJI_PREF, true);
      for (const label of root.querySelectorAll(EMOJI_LABELS)) {
        const emoji = on ? emojiFor(label.textContent) : "";
        if (emoji) {
          if (label.getAttribute("data-mc-emoji") != emoji) {
            label.setAttribute("data-mc-emoji", emoji);
          }
        } else if (label.hasAttribute("data-mc-emoji")) {
          label.removeAttribute("data-mc-emoji");
        }
      }
    };
    // Mehrtägige ganztägige Termine in Monat/Mehrwochen als durchgehender
    // Balken wie in Apple Kalender: jedes Tagesstück weiß, ob es links/rechts
    // weitergeht (innerhalb einer Wochenzeile); der Titel läuft über alle
    // Stücke weiter: Folgestücke rücken ihn um ihren Abstand zum ersten
    // Stück derselben Zeile ein (--mc-span-x, data-mc-span)
    const annotateSpans = root => {
      const joined = [];
      for (const el of root.querySelectorAll("calendar-month-day-box-item")) {
        let left = false;
        let right = false;
        try {
          const occ = el.occurrence;
          const day = el.parentBox?.date;
          const start = occ?.startDate;
          const end = occ?.endDate;
          if (el.hasAttribute("allday") && day && start && end) {
            const next = day.clone();
            next.day += 1;
            const cell = el.closest("td");
            const row = cell?.parentElement;
            const col = cell ? [...row.children].indexOf(cell) : -1;
            left = day.compare(start) > 0 && col > 0;
            right = next.compare(end) < 0 && col >= 0 && col < row.children.length - 1;
          }
        } catch {}
        el.toggleAttribute("data-mc-join-l", left);
        el.toggleAttribute("data-mc-join-r", right);
        if (left) {
          joined.push(el);
        } else if (el.hasAttribute("data-mc-span")) {
          el.removeAttribute("data-mc-span");
          el.style.removeProperty("--mc-span-x");
        }
      }
      for (const el of joined) {
        let dx = null;
        try {
          const id = el.occurrence?.hashId;
          const row = el.closest("tr");
          const first = id && row && [...row.querySelectorAll("calendar-month-day-box-item[allday]:not([data-mc-join-l])")]
            .find(x => x.occurrence?.hashId == id);
          const a = el.querySelector(".event-name-label")?.getBoundingClientRect();
          const b = first?.querySelector(".event-name-label")?.getBoundingClientRect();
          // ohne Layout (verdeckte Ansicht) den letzten Einzug behalten; nie
          // gemessene Folgestücke zeigen keinen Titel
          if (a?.width && b?.width) {
            dx = Math.round((a.left - b.left) * 10) / 10;
          }
        } catch {}
        if (dx !== null) {
          if (el.style.getPropertyValue("--mc-span-x") != `${dx}px`) {
            el.style.setProperty("--mc-span-x", `${dx}px`);
          }
          el.setAttribute("data-mc-span", "");
        }
      }
    };
    const hookCalendarEmoji = () => {
      for (const id of ["view-box", "agenda"]) {
        const root = w.document.getElementById(id);
        if (!root || root.__mcEmoji) {
          continue;
        }
        root.__mcEmoji = true;
        let pending = false;
        const run = () => {
          pending = false;
          annotateEmoji(root);
          if (id == "view-box") {
            annotateSpans(root);
          }
        };
        const mo = new w.MutationObserver(() => {
          if (!pending) {
            pending = true;
            // Zeitgeber statt requestAnimationFrame: läuft auch, wenn das Fenster verdeckt ist
            w.setTimeout(run, 16);
          }
        });
        mo.observe(root, { childList: true, subtree: true, characterData: true });
        // Spaltenbreiten ändern sich mit dem Fenster – Einzug der Balkentitel neu messen
        let ro = null;
        if (id == "view-box" && w.ResizeObserver) {
          ro = new w.ResizeObserver(() => {
            if (!pending) {
              pending = true;
              w.setTimeout(run, 16);
            }
          });
          // auch die Ansichten selbst: beim Wechsel zu Monat/Mehrwochen bekommen sie erst dann eine Größe
          for (const v of [root, ...root.querySelectorAll(":scope > *")]) {
            ro.observe(v);
          }
        }
        const prefObs = { observe: () => { resetEmojiRules(); annotateEmoji(root); } };
        Services.prefs.addObserver(EMOJI_PREF, prefObs);
        Services.prefs.addObserver(EMOJI_CUSTOM_PREF, prefObs);
        run();
        this.restorers.push(() => {
          mo.disconnect();
          ro?.disconnect();
          Services.prefs.removeObserver(EMOJI_PREF, prefObs);
          Services.prefs.removeObserver(EMOJI_CUSTOM_PREF, prefObs);
          for (const label of root.querySelectorAll("[data-mc-emoji]")) {
            label.removeAttribute("data-mc-emoji");
          }
          for (const el of root.querySelectorAll("[data-mc-join-l], [data-mc-join-r], [data-mc-span]")) {
            el.removeAttribute("data-mc-join-l");
            el.removeAttribute("data-mc-join-r");
            el.removeAttribute("data-mc-span");
            el.style.removeProperty("--mc-span-x");
          }
          delete root.__mcEmoji;
        });
      }
    };

    // Aufgaben ohne Einträge: mittig Symbol, Titel und kurzer Text statt
    // leerer Fläche (wie Apple Erinnerungen) – ohne Aufgabenkalender mit
    // Hinweis, wo man einen auswählt
    const hookTasksEmpty = () => {
      const d = w.document;
      const tree = d.getElementById("calendar-task-tree");
      const field = d.getElementById("view-task-edit-field");
      const filter = d.getElementById("task-text-filter-field");
      const group = d.getElementById("task-tree-filtergroup");
      if (!tree?.mTreeView || d.getElementById("mcTasksEmpty")) {
        return;
      }
      const HTML = "http://www.w3.org/1999/xhtml";
      const box = d.createElementNS(HTML, "div");
      box.id = "mcTasksEmpty";
      box.hidden = true;
      const icon = d.createElementNS(HTML, "div");
      icon.className = "mc-te-icon";
      const title = d.createElementNS(HTML, "div");
      title.className = "mc-te-title";
      const text = d.createElementNS(HTML, "div");
      text.className = "mc-te-text";
      box.append(icon, title, text);
      tree.after(box);
      const update = () => {
        const empty = !tree.mTreeView || tree.mTreeView.rowCount == 0;
        // ohne Aufgabenkalender ist das Eingabefeld schreibgeschützt (Hinweis als Wert)
        const noList = !!field && (field.readOnly || field.getAttribute("aria-disabled") == "true");
        // Suchfeld oben gefüllt: es gibt Aufgaben, nur passt keine zur Suche
        const searching = !!filter?.value.trim();
        // Filter „Überfällig“/„Erledigt“: neue Aufgaben erscheinen dort gerade
        // nicht – dann nicht „Neue Aufgaben erscheinen hier“ versprechen
        const shown = tree.getAttribute("filterValue") || group?.value || "all";
        const narrowed = ["overdue", "completed"].includes(shown);
        title.textContent = searching ? tr("No Results") : noList ? tr("No Task List Selected") : tr("No Tasks");
        text.textContent = searching ? tr("No tasks match your search.")
          : noList ? tr("Choose a calendar that supports tasks in the sidebar.")
          : narrowed ? tr("No tasks in this view.") : tr("Tasks you add appear here.");
        box.hidden = !empty;
      };
      let pending = false;
      const later = () => {
        if (!pending) {
          pending = true;
          w.setTimeout(() => {
            pending = false;
            update();
          }, 50);
        }
      };
      const view = tree.mTreeView;
      const wrapped = ["addItems", "removeItems", "modifyItems", "clear"].map(name => {
        const orig = view[name];
        view[name] = function (...args) {
          const result = orig.apply(this, args);
          later();
          return result;
        };
        return [name, orig];
      });
      tree.addEventListener("refresh", later);
      for (const type of ["input", "command"]) {
        filter?.addEventListener(type, later);
      }
      const mo = field ? new w.MutationObserver(later) : null;
      mo?.observe(field, { attributes: true, attributeFilter: ["readonly", "aria-disabled"] });
      // Filterwechsel (Seitenleiste oder Menü „Ansicht → Aufgaben“) setzt filterValue am Baum
      const moFilter = new w.MutationObserver(later);
      moFilter.observe(tree, { attributes: true, attributeFilter: ["filterValue"] });
      update();
      this.restorers.push(() => {
        for (const [name, orig] of wrapped) {
          view[name] = orig;
        }
        tree.removeEventListener("refresh", later);
        for (const type of ["input", "command"]) {
          filter?.removeEventListener(type, later);
        }
        mo?.disconnect();
        moFilter.disconnect();
        box.remove();
      });
    };

    // iCloud legt in umgestellte Erinnerungslisten Platzhalter-Aufgaben an
    // („Wo sind meine Erinnerungen?“, „Der Ersteller dieser Liste hat diese
    // Erinnerungen aktualisiert.“) – mit Verweis auf Apples Hilfeseite
    // HT210220. Sie sind keine echten Aufgaben: in allen Aufgabenlisten
    // ausblenden (an den Daten in iCloud ändert sich nichts).
    const hookTaskPlaceholders = () => {
      const proto = w.calFilter?.prototype;
      if (!proto || proto.__mcPlaceholders) {
        return;
      }
      const orig = proto.isItemInFilters;
      proto.isItemInFilters = function (item) {
        try {
          if (item?.isTodo?.() && /support\.apple\.com\/(?:[a-z-]+\/)?HT210220/i.test(item.getProperty("DESCRIPTION") || "")) {
            return false;
          }
        } catch {}
        return orig.call(this, item);
      };
      proto.__mcPlaceholders = true;
      // schon angezeigte Listen neu füllen (refreshFromCalendar statt
      // refresh() – das meldet die Beobachter jedes Mal neu an)
      const refresh = () => {
        let cals = [];
        try {
          const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
          cals = cal.view.getCompositeCalendar(w).getCalendars() || [];
        } catch {}
        for (const tree of w.document.querySelectorAll(".calendar-task-tree")) {
          if (!tree.mTreeView || typeof tree.refreshFromCalendar != "function") {
            continue;
          }
          for (const calendar of cals.filter(c => !c.getProperty("disabled"))) {
            try {
              tree.refreshFromCalendar(calendar);
            } catch {}
          }
        }
      };
      refresh();
      this.restorers.push(() => {
        proto.isItemInFilters = orig;
        delete proto.__mcPlaceholders;
        refresh();
      });
    };

    // Doppelklick auf freie Zeit (Woche/Tag), die Ganztägig-Zeile oder einen
    // Tag im Monat: unser Schnellfenster an der Mausposition statt Thunderbirds
    // großem Dialog. Ziehen über einen Zeitraum legt weiter direkt an.
    const hookCalendarDoubleClick = () => {
      const ctrl = w.calendarViewController;
      const box = w.document.getElementById("view-box");
      if (!ctrl || !box || ctrl.__mcQuick) {
        return;
      }
      ctrl.__mcQuick = true;
      const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
      let lastClick = null;
      const onDbl = event => {
        lastClick = { x: event.screenX, y: event.screenY, time: Date.now() };
        // angeklickter Tag (Monat, Ganztägig-Zeile) bzw. Tagesspalte (Woche/Tag)
        // in Bildschirmkoordinaten – das Schnellfenster erscheint daneben
        const cell = event.target?.closest?.("calendar-month-day-box, calendar-header-container, calendar-event-column");
        const r = cell?.getBoundingClientRect();
        if (r?.width) {
          const column = cell.localName == "calendar-event-column";
          lastClick.rect = {
            left: r.left + w.mozInnerScreenX,
            width: r.width,
            // in der Spalte zählt nur die angeklickte Uhrzeit, nicht der ganze Tag
            top: column ? event.screenY : r.top + w.mozInnerScreenY,
            height: column ? 0 : r.height,
          };
        }
      };
      box.addEventListener("dblclick", onDbl, true);
      const orig = ctrl.createNewEvent;
      const self = this;
      ctrl.createNewEvent = function (calendar, startTime, endTime, forceAllday) {
        const fromDoubleClick = lastClick && Date.now() - lastClick.time < 1000;
        // gezogener Zeitraum oder Aufruf ohne Doppelklick (Menü, Tastatur): wie bisher
        if (!fromDoubleClick || (startTime && endTime && !startTime.isDate && !endTime.isDate)) {
          return orig.call(this, calendar, startTime, endTime, forceAllday);
        }
        const at = lastClick;
        lastClick = null;
        try {
          let start = null;
          let allDay = !!forceAllday;
          if (startTime) {
            start = cal.dtz.dateTimeToJsDate(startTime.isDate ? startTime : startTime.getInTimezone(cal.dtz.defaultTimezone));
            allDay ||= startTime.isDate;
          } else {
            // Monat: der angeklickte Tag, wie bei Apple ein ganztägiger Termin
            const day = w.currentView?.()?.selectedDay;
            if (day) {
              start = new Date(day.year, day.month, day.day);
              allDay = true;
            }
          }
          if (start && startTime && !startTime.isDate) {
            // auf die Viertelstunde abrunden
            start.setMinutes(Math.floor(start.getMinutes() / 15) * 15, 0, 0);
          }
          self.openQuickCreate(w, "event", null, { start, allDay, at, calendar });
        } catch (e) {
          log("quick double-click error", e);
          return orig.call(this, calendar, startTime, endTime, forceAllday);
        }
        return undefined;
      };
      this.restorers.push(() => {
        ctrl.createNewEvent = orig;
        box.removeEventListener("dblclick", onDbl, true);
        delete ctrl.__mcQuick;
      });
    };

    // Tooltip mit Erklärung an Kalendern, die iCloud mit ⚠️ markiert
    const hookCalendarNotes = () => {
      const list = w.document.getElementById("calendar-list");
      if (!list || list.__mcNotes) {
        return;
      }
      list.__mcNotes = true;
      const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
      const annotate = () => {
        for (const li of list.querySelectorAll("li[calendar-id]")) {
          // Kästchen wie Apple Kalender: Farbe und passende Hakenfarbe (Thunderbird
          // rechnet je Kalender Schwarz/Weiß aus) – heller Kalender, dunkler Haken
          const box = li.querySelector(".calendar-color");
          if (box && !box.style.getPropertyValue("--mc-cal-back")) {
            const key = cal.view.formatStringForCSSRule(li.getAttribute("calendar-id"));
            box.style.setProperty("--mc-cal-back", `var(--calendar-${key}-backcolor)`);
            box.style.setProperty("--mc-cal-fore", `var(--calendar-${key}-forecolor, white)`);
          }
          const note = calendarNote(cal.manager.getCalendarById(li.getAttribute("calendar-id")));
          const name = li.querySelector(".calendar-name");
          if (note && name?.getAttribute("title") != note) {
            name.setAttribute("title", note);
          } else if (!note && name?.hasAttribute("title")) {
            name.removeAttribute("title");
          }
        }
      };
      const mo = new w.MutationObserver(annotate);
      mo.observe(list, { childList: true, subtree: true, characterData: true });
      annotate();
      this.restorers.push(() => {
        mo.disconnect();
        delete list.__mcNotes;
        for (const name of list.querySelectorAll(".calendar-name[title]")) {
          name.removeAttribute("title");
        }
        for (const box of list.querySelectorAll(".calendar-color")) {
          box.style.removeProperty("--mc-cal-back");
          box.style.removeProperty("--mc-cal-fore");
        }
      });
    };

    // Thunderbird schreibt „Hier klicken, um eine neue Aufgabe hinzuzufügen“
    // als Wert ins Feld (nicht als Platzhalter) – markieren, damit er grau
    // wie ein Platzhalter erscheint
    const hookTaskHint = () => {
      for (const id of ["view-task-edit-field", "unifinder-task-edit-field"]) {
        const field = w.document.getElementById(id);
        if (!field || field.__mcHint) {
          continue;
        }
        field.__mcHint = true;
        const sync = () => w.setTimeout(() => field.toggleAttribute("mc-hint", !!field.showsInstructions), 0);
        for (const type of ["focus", "blur", "input"]) {
          field.addEventListener(type, sync);
        }
        sync();
        this.restorers.push(() => {
          for (const type of ["focus", "blur", "input"]) {
            field.removeEventListener(type, sync);
          }
          field.removeAttribute("mc-hint");
          delete field.__mcHint;
        });
      }
      // Thunderbird setzt den Hinweis auch ohne focus/blur (Wechsel des
      // Standardkalenders, Fensterstart) – dann über setupTaskField abgleichen;
      // showsInstructions setzt onBlur erst danach, daher setTimeout 0
      const te = w.taskEdit;
      if (te?.setupTaskField && !te.__mcHintWrapped) {
        const orig = te.setupTaskField;
        te.setupTaskField = function (target, ...rest) {
          const r = orig.call(this, target, ...rest);
          if (target?.__mcHint) {
            w.setTimeout(() => target.toggleAttribute("mc-hint", !!target.showsInstructions), 0);
          }
          return r;
        };
        te.__mcHintWrapped = true;
        this.restorers.push(() => {
          te.setupTaskField = orig;
          delete te.__mcHintWrapped;
        });
      }
    };

    // Beschreibung im Detailbereich der Aufgaben: eigenes Inhaltsdokument
    // (about:blank), das theme.css nicht erreicht – dunkel stand sie schwarz
    // auf dunkler Fläche, hell in der Inhaltsschrift mit 8 px Rand. Benutzer-
    // Stylesheet einmal je Dokument (Thunderbird tauscht nur den Inhalt aus)
    const hookTaskDescription = () => {
      const d = w.document;
      const frame = d.getElementById("calendar-task-details-description");
      if (!frame || frame.__mcDescHooked) {
        return;
      }
      frame.__mcDescHooked = true;
      const uri = `resource://mailcards/taskdesc.css?v=${extensionVersion}`;
      const apply = () => {
        const cw = frame.contentWindow;
        if (!cw || cw.__mcDesc == uri || !Services.prefs.getBoolPref("extensions.mailcards.bundledTheme", true)) {
          return;
        }
        try {
          cw.windowUtils.loadSheetUsingURIString(uri, cw.windowUtils.USER_SHEET);
          cw.__mcDesc = uri;
        } catch (e) {
          log("task description sheet error", String(e).slice(0, 120));
        }
      };
      const tree = d.getElementById("calendar-task-tree");
      frame.addEventListener("load", apply, true);
      tree?.addEventListener("select", apply);
      apply();
      this.restorers.push(() => {
        frame.removeEventListener("load", apply, true);
        tree?.removeEventListener("select", apply);
        const cw = frame.contentWindow;
        if (cw?.__mcDesc) {
          try {
            cw.windowUtils.removeSheetUsingURIString(cw.__mcDesc, cw.windowUtils.USER_SHEET);
          } catch {}
          delete cw.__mcDesc;
        }
        delete frame.__mcDescHooked;
      });
    };

    // Kalender und Aufgaben: ein „+“ wie in Apple Kalender – öffnet gleich das
    // Schnellfenster (der zweite Knopf ist per CSS ausgeblendet)
    const hookNewButton = () => {
      const d = w.document;
      const bar = d.querySelector("unified-toolbar");
      if (!bar || bar.__mcNewHooked) {
        return;
      }
      bar.__mcNewHooked = true;
      let lastAnchor = null;
      // Popover wie in Apple Kalender: zwei runde Symbole mit Beschriftung
      const popup = d.createXULElement("panel");
      popup.id = "mcNewPopup";
      popup.setAttribute("type", "arrow");
      popup.setAttribute("noautofocus", "true");
      // am Bildschirmrand einschieben statt umklappen: beim Umklappen dreht
      // Gecko auch den Versatz um (28 px), das Popover rutschte dann ganz neben
      // das „+“ und der Pfeil zeigte daneben (maximiertes Fenster)
      popup.setAttribute("flip", "slide");
      const NS = "http://www.w3.org/1999/xhtml";
      const box = d.createElementNS(NS, "div");
      box.className = "mc-pop";
      const ICONS = {
        // Kalenderblatt mit Uhr
        event: '<rect x="3.5" y="5" width="15" height="13.5" rx="2.4"/><path d="M3.5 9.2h15M7.6 3.2v3.2M14.4 3.2v3.2"/><circle cx="17.6" cy="17.6" r="4.4" fill="var(--mc-pop-icon-bg)"/><path d="M17.6 15.6v2.2l1.4 0.9"/>',
        // Liste mit abgehaktem und offenem Punkt
        task: '<circle cx="6" cy="7.5" r="2.4"/><path d="M4.9 7.5l0.8 0.8 1.4-1.6"/><circle cx="6" cy="16.5" r="2.4"/><path d="M11 7.5h9M11 16.5h9"/>',
      };
      for (const [id, label, icon, command] of [
        ["mcNewEvent", tr("New Event"), "event", "calendar_new_event_command"],
        ["mcNewTask", tr("New Task"), "task", "calendar_new_todo_command"],
      ]) {
        const btn = d.createElementNS(NS, "button");
        btn.id = id;
        btn.className = "mc-pop-item";
        const circle = d.createElementNS(NS, "span");
        circle.className = "mc-pop-icon";
        // festes, eingebautes Symbol – per DOMParser statt innerHTML
        const svg = new w.DOMParser().parseFromString(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[icon]}</svg>`,
          "image/svg+xml"
        ).documentElement;
        circle.append(d.importNode(svg, true));
        const text = d.createElementNS(NS, "span");
        text.className = "mc-pop-label";
        text.textContent = label;
        btn.append(circle, text);
        btn.addEventListener("click", () => {
          popup.hidePopup();
          this.openQuickCreate(w, command == "calendar_new_todo_command" ? "task" : "event", lastAnchor);
        });
        box.append(btn);
      }
      popup.append(box);
      (d.getElementById("mainPopupSet") || d.documentElement).append(popup);
      const onClick = event => {
        const li = event.target.closest?.('li[item-id="new-event"]');
        const mode = d.getElementById("tabmail")?.currentTabInfo?.mode?.name;
        if (!li || (mode != "calendar" && mode != "tasks")) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        // im Kalender gleich ein neuer Termin, in den Aufgaben gleich eine
        // neue Aufgabe (die Auswahl gibt es über das „+“ der Today-Pane)
        this.openQuickCreate(w, mode == "tasks" ? "task" : "event", li);
      };
      bar.addEventListener("click", onClick, true);
      // dasselbe Popover über einem Knopf unten (Today-Pane): nach oben, mittig
      const above = anchor => {
        if (popup.state == "open" || popup.state == "showing") {
          popup.hidePopup();
          return;
        }
        popup.classList.add("mc-up");
        lastAnchor = anchor;
        const width = 294; // Breite des Popovers samt Rand für den Schatten
        popup.openPopup(anchor, "before_start", Math.round(anchor.getBoundingClientRect().width / 2 - width / 2), 12);
      };
      // Pfeil über die Mitte des Knopfs – nach dem Öffnen gemessen, so stimmt
      // er auch, wenn Gecko das Popover am Bildschirmrand verschiebt (höchstens
      // bis 20 px vor die runden Ecken)
      // (in Bildschirmkoordinaten: unter Windows hat der Inhalt des Popovers
      // eigene Koordinaten, der Vergleich mit dem Knopf lag 300 px daneben)
      const aimArrow = anchor => {
        const a = anchor.getBoundingClientRect();
        const b = box.getBoundingClientRect();
        if (!a.width || !b.width) {
          return;
        }
        const mid = w.mozInnerScreenX + a.left + a.width / 2;
        const p = popup.getBoundingClientRect(), outer = popup.getOuterScreenRect();
        const left = outer.left + (b.left - p.left), right = left + b.width;
        const x = w.getComputedStyle(box).direction == "rtl" ? right - mid - 7 : mid - left - 7;
        box.style.setProperty("--mc-arrow-x", `${Math.round(Math.min(Math.max(x, 20), b.width - 34))}px`);
      };
      // dasselbe Popover unter dem „+“ oben rechts in der Today-Pane:
      // rechtsbündig, um 28 px nach rechts versetzt – sonst läge die Mitte des
      // Knopfs in der runden Ecke und der Pfeil zeigte 240 px daneben
      const below = anchor => {
        if (popup.state == "open" || popup.state == "showing") {
          popup.hidePopup();
          return;
        }
        popup.classList.remove("mc-up");
        lastAnchor = anchor;
        popup.addEventListener("popupshown", () => aimArrow(anchor), { once: true });
        // am Bildschirmrand schiebt Gecko das Popover ein (flip="slide"), der
        // Pfeil wird danach in aimArrow nachgemessen
        popup.openPopup(anchor, "after_end", 28, 6);
      };
      newPopup = { above, below };
      const onHidden = () => {
        popup.classList.remove("mc-up");
        box.style.removeProperty("--mc-arrow-x");
      };
      popup.addEventListener("popuphidden", onHidden);
      this.restorers.push(() => {
        bar.removeEventListener("click", onClick, true);
        popup.removeEventListener("popuphidden", onHidden);
        popup.remove();
        delete bar.__mcNewHooked;
        newPopup = null;
      });
    };

    // Today-Pane: Titel „Today Pane“ (statt „Termine“/„Aufgaben“) und der Knopf
    // „Neuer Termin“ gleich rechts daneben in der Kopfzeile
    const hookTodayPaneHeader = () => {
      const d = w.document;
      const header = d.getElementById("today-pane-header");
      const button = d.getElementById("todaypane-new-event-button");
      if (!header || header.dataset.mcTitle) {
        return;
      }
      header.dataset.mcTitle = tr("Today Pane");
      const home = button?.parentElement;
      const next = button?.nextSibling;
      // ganz unten in der Today-Pane, unter den Einträgen: ein „+“ wie im
      // Kalender, das nach Termin oder Aufgabe fragt
      const panel = d.getElementById("today-pane-panel");
      const savedCommand = button?.getAttribute("command");
      const onPlus = event => {
        event.preventDefault();
        event.stopPropagation();
        newPopup?.above(button);
      };
      if (button && panel) {
        panel.append(button);
        button.removeAttribute("command");
        button.addEventListener("click", onPlus);
      }
      this.restorers.push(() => {
        delete header.dataset.mcTitle;
        if (button && home) {
          button.removeEventListener("click", onPlus);
          if (savedCommand) {
            button.setAttribute("command", savedCommand);
          }
          home.insertBefore(button, next);
        }
      });
    };

    // „Heute“ in der Sprache der Oberfläche (Thunderbird hat dafür nur einen Tooltip)
    const labelToday = () => {
      const btn = w.document.getElementById("todayViewButton");
      if (!btn || btn.dataset.mcLabel) {
        return;
      }
      let text = "Today";
      try {
        text = new Intl.RelativeTimeFormat(Services.locale.appLocaleAsBCP47, { numeric: "auto" }).format(0, "day");
        text = text.charAt(0).toLocaleUpperCase(Services.locale.appLocaleAsBCP47) + text.slice(1);
      } catch {}
      btn.dataset.mcLabel = text;
    };

    // Kalender-Titel wie in Apple Kalender: Monat fett, Jahreszahl dünn
    const hookTitle = () => {
      const el = w.document.getElementById("intervalDescription");
      if (!el || el.__mcTitle) {
        return;
      }
      el.__mcTitle = true;
      const split = () => {
        if (el.querySelector(".mc-year")) {
          return;
        }
        const m = el.textContent.match(/^(.*\S)(\s+)(\d{4})\s*$/s);
        if (!m) {
          return;
        }
        const year = w.document.createElement("span");
        year.className = "mc-year";
        year.textContent = m[3];
        el.replaceChildren(m[1] + m[2], year);
      };
      const mo = new w.MutationObserver(split);
      mo.observe(el, { childList: true, characterData: true, subtree: true });
      split();
      this.restorers.push(() => {
        mo.disconnect();
        el.textContent = el.textContent;
        delete el.__mcTitle;
      });
    };

    // Tag und Woche: Cmd + Mausrad (oder Zwei-Finger-Zoom) ändert wie
    // Cmd+Plus/Minus den Stundenabstand
    const hookMultidayZoom = () => {
      for (const id of ["day-view", "week-view"]) {
        const view = w.document.getElementById(id);
        if (!view || view.__mcZoom || typeof view.zoomIn != "function") {
          continue;
        }
        view.__mcZoom = true;
        let acc = 0;
        const STEP = 40; // Pixel Mausrad pro Zoomstufe
        const zoom = delta => {
          acc += delta;
          while (Math.abs(acc) >= STEP) {
            // wie Cmd+Plus/Minus: nach oben = größer (weniger Stunden sichtbar)
            if (acc < 0) {
              view.zoomOut();
              acc += STEP;
            } else {
              view.zoomIn();
              acc -= STEP;
            }
          }
        };
        const onWheel = event => {
          if (!event.metaKey && !event.ctrlKey) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          const px = event.deltaMode == 1 ? event.deltaY * 16 : event.deltaMode == 2 ? event.deltaY * 400 : event.deltaY;
          zoom(px);
        };
        const onGesture = event => {
          event.preventDefault();
          zoom(-event.delta * 2);
        };
        view.addEventListener("wheel", onWheel, { passive: false, capture: true });
        view.addEventListener("MozMagnifyGestureUpdate", onGesture);
        this.restorers.push(() => {
          view.removeEventListener("wheel", onWheel, { capture: true });
          view.removeEventListener("MozMagnifyGestureUpdate", onGesture);
          delete view.__mcZoom;
        });
      }
    };

    const scan = () => {
      this.styleSearch(w); // vor markTab, damit der Platzhalter des Bereichs gleich gilt
      markTab();
      decorateAgenda();
      hookMonthView();
      hookMultidayZoom();
      hookNewButton();
      hookCalendarNotes();
      hookCalendarEmoji();
      hookTaskPlaceholders();
      hookTasksEmpty();
      hookCalendarDoubleClick();
      hookTaskHint();
      hookTaskDescription();
      hookTitle();
      labelToday();
      hookTodayPaneHeader();
      hookEscape();
      hookSidebarButton();
      hookSpacesToggle();
      FifthSpace.attach(w, this.restorers);
      hookTodayToggle();
      hookSplitterReset(w.document);
      hookListHeader();
      this.updateListHeader(w);
      hookStarButton();
      this.updateStarButton(w);
      const tabmail = w.document.getElementById("tabmail");
      for (const tab of tabmail?.tabInfo || []) {
        const cw = tab.chromeBrowser?.contentWindow;
        if (cw && cw.location?.href == "about:3pane") {
          hookSplitterReset(cw.document);
          this.patch(cw, 0);
        }
      }
    };
    scan();
    let runs = 0;
    const interval = w.setInterval(() => {
      scan();
      if (++runs >= 30) {
        w.clearInterval(interval);
      }
    }, 1000);
    const monitor = {
      monitorName: "mail-cards",
      onTabOpened: () => w.setTimeout(scan, 300),
      onTabSwitched: () => {
        scan(); // ruft markTab() selbst auf
        w.setTimeout(hookEscape, 800); // Inhalt des neuen Tabs ist evtl. erst jetzt geladen
      },
      onTabTitleChanged() {},
      onTabClosing() {},
      onTabPersist() {},
      onTabRestored() {},
    };
    const attach = () => {
      const tabmail = w.document.getElementById("tabmail");
      if (tabmail?.registerTabMonitor) {
        tabmail.registerTabMonitor(monitor);
        this.restorers.push(() => tabmail.unregisterTabMonitor(monitor));
      } else {
        w.setTimeout(attach, 500);
      }
    };
    attach();
    w.addEventListener("unload", () => this.mainWindows.delete(w), { once: true });
    this.restorers.push(() => w.document.documentElement.removeAttribute("mc-mail"));
    this.restorers.push(() => w.document.documentElement.removeAttribute("mc-tab"));
    this.restorers.push(() => w.clearInterval(interval));
  }

  // Suchfeld wie Apple Mail: Lupe links, Platzhalter nur „Search“/„Suchen“
  // (ohne „…“ und ohne ⌘+K-Hinweis). Liegt im Shadow-DOM, daher hier statt CSS.
  styleSearch(w) {
    const bar = w.document.querySelector("global-search-bar");
    if (!bar?.shadowRoot || bar.shadowRoot.getElementById("mail-cards-search")) {
      return;
    }
    // eigener Text nur in Sprachen mit eigener Übersetzung (und Englisch) –
    // sonst bleibt Thunderbirds übersetzter Platzhalter
    const own = uiLanguage() != "en" || Services.locale.appLocaleAsBCP47.startsWith("en");
    // langer eigener Platzhalter („Alle Postfächer durchsuchen“) endet bei
    // schmalem Feld mit „…“ statt mitten im Wort
    const ellipsis = own
      ? `::slotted([slot="placeholder"]) { display: block !important; overflow: hidden !important; text-overflow: ellipsis !important; }`
      : "";
    const style = w.document.createElementNS("http://www.w3.org/1999/xhtml", "style");
    style.id = "mail-cards-search";
    style.textContent = `
      .button { inset-inline-start: 4px !important; inset-inline-end: auto !important; }
      input { padding-inline: 30px 10px !important; }
      div { inset-inline-start: 30px !important; inset-inline-end: 10px !important; }
      ${ellipsis}
    `;
    bar.shadowRoot.appendChild(style);

    const placeholder = bar.querySelector('[slot="placeholder"]');
    const l10nId = placeholder?.getAttribute("data-l10n-id");
    if (placeholder && own) {
      placeholder.removeAttribute("data-l10n-id");
      placeholder.textContent = tr("Search");
    }
    this.restorers.push(() => {
      style.remove();
      if (placeholder && l10nId) {
        placeholder.setAttribute("data-l10n-id", l10nId);
        w.document.l10n?.translateElements([placeholder]);
      }
    });
  }

  // Ordnerliste ein-/ausblenden wie in Apple Mail: die Ordnerliste bleibt
  // stehen, Mailliste und Mail schieben sich mit ihrer linken Kante nach links
  // darüber und decken sie zu (beim Einblenden umgekehrt). Dauer und Kurve sind die macOS-Standardwerte für
  // Seitenleisten: 0,25 s, cubic-bezier(0.25, 0.1, 0.25, 1).
  // Thunderbird steuert die Breite über --folderPaneSplitter-width am Raster.
  animateSidebar(ab, splitter, onDone) {
    if (ab.__mcAnimating) {
      return;
    }
    const pane = ab.document.getElementById("folderPane");
    const grid = splitter.parentNode;
    const prop = "--folderPaneSplitter-width";
    const DURATION = motionMs(250);
    const curve = cubicBezier(0.25, 0.1, 0.25, 1);
    const collapsing = !splitter.isCollapsed;
    // Leseansicht vor jeder Änderung messen (beim Einblenden klappt Thunderbird
    // die Ordnerliste gleich auf und nimmt ihr die Breite)
    const msgBefore = ab.document.getElementById("messagePane")?.getBoundingClientRect().width || 0;
    let full;
    if (collapsing) {
      full = pane.getBoundingClientRect().width;
      // (gilt nur, solange Fenster und gespeicherte Breite gleich bleiben)
      pane.__mcShown = { full, grid: grid.getBoundingClientRect().width, saved: splitter.width };
    } else {
      splitter.isCollapsed = false;
      // Zielbreite: so breit wie vor dem Ausblenden (in engen Fenstern schmaler
      // als die gespeicherte des Teilers – sonst sprang sie im letzten Bild),
      // sonst die gespeicherte – gemessen wäre sie hier noch zu schmal (die
      // Leseansicht hält im Raster noch ihre volle Breite)
      const shownBefore = pane.__mcShown;
      const same = shownBefore && Math.abs(shownBefore.grid - grid.getBoundingClientRect().width) < 2 && shownBefore.saved == splitter.width;
      full = same ? shownBefore.full : Math.max(splitter.width || 0, pane.getBoundingClientRect().width);
      delete pane.__mcShown;
    }
    if (!full) {
      return;
    }
    const saved = grid.style.getPropertyValue(prop);
    // Vertikales Layout: die Mailliste ist die flexible Spalte – sie würde jedes
    // Bild breiter/schmaler und neu umbrochen (Karten), das ruckelt. Stattdessen
    // nimmt die Leseansicht die Breite auf, die Liste bleibt stehen
    const msgSplitter = ab.paneLayout?.messagePaneSplitter;
    const msgPane = ab.document.getElementById("messagePane");
    const vertical = Services.prefs.getIntPref("mail.pane_config.dynamic", 0) == 2 && msgSplitter && msgPane &&
      !msgSplitter.isCollapsed && msgBefore > 0;
    // Ausgangsbreite der Leseansicht vor dem Aufklappen – sonst schrumpfte sie beim
    // Einblenden währenddessen weiter und spränge am Ende zurück
    const msgStart = vertical ? msgBefore : 0;
    const msgProp = "--messagePaneSplitter-width";
    const msgSaved = vertical ? grid.style.getPropertyValue(msgProp) : "";
    // die Leseansicht ist etwas breiter als ihre Rastervariable (Rand/Teiler,
    // unter Windows samt Bildlaufleiste gut 12 px) – abziehen
    const msgVar = vertical ? parseFloat(ab.getComputedStyle(grid).getPropertyValue(msgProp)) : NaN;
    const msgExtra = Number.isFinite(msgVar) && Math.abs(msgBefore - msgVar) < 24 ? msgBefore - msgVar : 0;
    const inner = [...pane.children];
    // Inhalt der Ordnerliste behält seine volle Breite und bleibt stehen –
    // er wird nur von rechts her zugedeckt
    inner.forEach(el => (el.style.minWidth = `${full}px`));
    pane.style.overflow = "hidden";
    pane.style.minWidth = "0px"; // Thunderbirds Mindestbreite (100 px) würde die Animation stoppen
    pane.classList.add("mc-side-anim"); // (auch unsere 160 px)
    // Der Teiler fixiert die Ordnerliste beim Ändern der Fenstergröße mit
    // „width: …px !important“ – das hält sonst das Raster fest
    // (beim Ausblenden merken: das Einblenden stellt sie wieder her – ohne sie
    // legte Windows die Ordnerliste 11 px schmaler an als vorher)
    const lockedWidth = pane.style.getPropertyValue("width") || (collapsing ? "" : pane.__mcLockedWidth || "");
    if (collapsing) {
      pane.__mcLockedWidth = lockedWidth;
    } else {
      delete pane.__mcLockedWidth;
    }
    pane.style.removeProperty("width");
    // Endzustand vorab herstellen und messen (im selben Schritt, nichts wird
    // gezeichnet): danach greifen noch „Mailliste behält ihre Breite“ und die
    // Mindestbreite der Leseansicht – die Animation läuft genau dorthin, statt
    // im letzten Bild zu springen
    let endFolder = collapsing ? 0 : full;
    let endMsg = vertical ? (collapsing ? msgStart + full : msgStart - full) : 0;
    let endMsgProp = "";
    if (vertical) {
      const startProp = grid.style.getPropertyValue(prop);
      const startMsgProp = grid.style.getPropertyValue(msgProp);
      grid.style.setProperty(prop, collapsing ? "0px" : saved || `${full}px`);
      grid.style.setProperty(msgProp, `${Math.max(0, Math.round(endMsg - msgExtra))}px`);
      if (!collapsing) {
        // eingeblendet gelten wieder Mindestbreite und Sperre der Ordnerliste
        pane.style.minWidth = "";
        pane.classList.remove("mc-side-anim");
        if (lockedWidth) {
          pane.style.setProperty("width", `${full}px`, "important");
        }
      }
      this.offsetUpdaters?.forEach(fn => fn());
      endFolder = collapsing ? 0 : pane.getBoundingClientRect().width;
      endMsg = msgPane.getBoundingClientRect().width;
      endMsgProp = grid.style.getPropertyValue(msgProp) || ab.getComputedStyle(grid).getPropertyValue(msgProp);
      pane.style.minWidth = "0px";
      pane.classList.add("mc-side-anim");
      pane.style.removeProperty("width");
      grid.style.setProperty(prop, startProp || `${collapsing ? full : 0}px`);
      if (startMsgProp) {
        grid.style.setProperty(msgProp, startMsgProp);
      } else {
        grid.style.removeProperty(msgProp);
      }
    }
    let relocked = false;
    ab.__mcAnimating = true;
    // Die Uhr läuft erst ab dem ersten gezeichneten Bild: beim Einblenden baut
    // Thunderbird die Ordnerliste zuerst neu auf, das würde sonst den Anfang
    // der Bewegung verschlucken und sie ruckartig starten lassen
    let start = null;
    const step = now => {
      if (start === null) {
        start = now;
      }
      const k = Math.min(1, (now - start) / DURATION);
      // setzt Thunderbird währenddessen eine neue Sperre, gilt sie dem
      // Zwischenstand – entfernen und am Ende durch die volle Breite ersetzen
      if (pane.style.getPropertyPriority("width") == "important") {
        relocked = true;
        pane.style.removeProperty("width");
      }
      const shown = collapsing ? 1 - curve(k) : curve(k); // sichtbarer Anteil 1 → 0 bzw. 0 → 1
      const width = vertical ? (collapsing ? endFolder + (full - endFolder) * shown : endFolder * shown) : full * shown;
      grid.style.setProperty(prop, `${width}px`);
      // Mindestbreite = aktuelle Breite: die Spalte verhält sich wie am Ende (in
      // engen Fenstern hielt das Raster sie sonst bei 150 px fest, und sie
      // sprang im letzten Bild auf ihre Mindestbreite von 160 px)
      pane.style.minWidth = `${width}px`;
      if (vertical) {
        // Leseansicht gleichmäßig von ihrer Ausgangs- zur gemessenen Endbreite – als
        // Rastervariable, damit das letzte Bild genau dem Endwert entspricht (unter
        // Windows ändert sich unterwegs der Zuschlag für die Bildlaufleiste)
        const from = msgStart - msgExtra;
        const to = parseFloat(endMsgProp);
        const msg = Number.isFinite(to) ? from + (to - from) * curve(k) : msgStart + (endMsg - msgStart) * curve(k) - msgExtra;
        grid.style.setProperty(msgProp, `${Math.max(0, msg)}px`);
      }
      this.offsetUpdaters?.forEach(fn => fn());
      if (k < 1) {
        ab.requestAnimationFrame(step);
        return;
      }
      inner.forEach(el => (el.style.minWidth = ""));
      pane.style.overflow = "";
      pane.style.minWidth = "";
      pane.classList.remove("mc-side-anim");
      if ((lockedWidth || relocked) && !collapsing) {
        pane.style.setProperty("width", `${full}px`, "important");
      }
      if (vertical) {
        // Endbreite der Leseansicht wie beim Ziehen am Teiler übernehmen (Thunderbird speichert sie)
        // Endbreite direkt als Rastervariable (wie Thunderbirds Teiler es tut) – über
        // msgSplitter.width rechnet Thunderbird selbst um, die Liste sprang dann ein Bild lang
        const msg = Math.round(endMsg - msgExtra);
        if (endMsgProp) {
          grid.style.setProperty(msgProp, endMsgProp);
        } else if (msg > 0) {
          grid.style.setProperty(msgProp, `${msg}px`);
        } else if (msgSaved) {
          grid.style.setProperty(msgProp, msgSaved);
        } else {
          grid.style.removeProperty(msgProp);
        }
      }
      if (collapsing) {
        splitter.isCollapsed = true; // setzt die Variable selbst auf 0px
      } else if (saved) {
        grid.style.setProperty(prop, saved);
      } else {
        grid.style.removeProperty(prop);
      }
      ab.__mcAnimating = false;
      onDone?.();
      ab.setTimeout(() => this.offsetUpdaters?.forEach(fn => fn()), 30);
    };
    // erstes Bild sofort setzen, damit nichts aufblitzt (auch nach der Vorab-
    // Messung des Endzustands, die Thunderbirds Teiler mit verstellt)
    grid.style.setProperty(prop, `${collapsing ? full : 0}px`);
    pane.style.minWidth = `${collapsing ? full : 0}px`;
    if (vertical) {
      grid.style.setProperty(msgProp, `${msgStart - msgExtra}px`);
    }
    pane.getBoundingClientRect(); // Aufbau der Ordnerliste jetzt erzwingen, nicht im ersten Bild
    ab.requestAnimationFrame(() => ab.requestAnimationFrame(step));
  }

  // Titel und Anzahl der Kopfzeile aus dem aktuellen Mail-Tab übernehmen
  // Stern-Knopf der Symbolleiste: gefüllt, wenn die (erste) gewählte Mail
  // im vorderen Tab einen Stern hat
  updateStarButton(w) {
    const li = w?.document?.querySelector('#unifiedToolbarContent > li[item-id="mark-as"]');
    if (!li) {
      return;
    }
    let starred = false;
    try {
      starred = !!w.document.getElementById("tabmail")?.currentTabInfo?.message?.isFlagged;
    } catch {}
    li.toggleAttribute("mc-starred", starred);
  }

  updateListHeader(w) {
    const d = w.document;
    const box = d.getElementById("mcListHeader");
    const tab = d.getElementById("tabmail")?.currentTabInfo;
    if (box && tab?.mode?.name == "addressBookTab") {
      this.updateAbHeader(box, tab.browser?.contentWindow);
      return;
    }
    if (box && tab?.mode?.name == "tasks") {
      this.updateTaskHeader(w, box);
      return;
    }
    const ab = d.getElementById("tabmail")?.currentAbout3Pane;
    this.syncQuickFilterToggle(w);
    if (!box || !ab?.document) {
      return;
    }
    const filter = box.querySelector(".mc-lh-filter");
    if (filter) {
      const on = this.unreadFilterOn(ab);
      filter.setAttribute("aria-pressed", String(on));
      filter.title = tr(on ? "Show All Messages" : "Show Only Unread Messages");
    }
    const more = box.querySelector(".mc-lh-more");
    if (more) {
      more.title = tr("Message List Display Options"); // (Aufgaben setzen einen eigenen Titel)
    }
    const title = box.querySelector(".mc-lh-title");
    const count = box.querySelector(".mc-lh-count");
    try {
      const folder = ab.gFolder;
      if (this.isSearchFolder(folder)) {
        // Suche: „Suche“ und „Alle Postfächer, 12 Treffer“ wie Apple Mail
        const n = ab.gDBView?.numMsgsInView || 0;
        title.textContent = tr("Searching");
        const base = this.searchBase(ab);
        count.textContent = (this.isUnifiedFolder(base) ? tr("All Mailboxes") : appleFolderName(base)) + ", " +
          tr(n == 1 ? "{n} result" : "{n} results", { n: n.toLocaleString(Services.locale.appLocaleAsBCP47) });
        return;
      }
      title.textContent = folder ? appleFolderTitle(folder) : ab.document.title || "";
      const n = folder?.getTotalMessages(false) || ab.gDBView?.numMsgsInView || 0;
      count.textContent = folder || ab.gDBView
        ? tr(n == 1 ? "{n} message" : "{n} messages", { n: n.toLocaleString(Services.locale.appLocaleAsBCP47) })
        : "";
    } catch (e) {
      log("list header error", e);
    }
  }

  // Kopfzeile über der Aufgabenliste: gewählter Filter („Current Tasks“ …) und
  // Anzahl der Aufgaben; Filter-Knopf getönt, wenn nicht der Standardfilter gilt
  updateTaskHeader(w, box) {
    const d = w.document;
    const group = d.getElementById("task-tree-filtergroup");
    const tree = d.getElementById("calendar-task-tree");
    const radio = group && ([...group.querySelectorAll("radio")].find(r => r.selected || r.value == group.value));
    box.querySelector(".mc-lh-title").textContent = radio?.label || radio?.getAttribute("label") || tr("Tasks");
    const n = tree?.mTaskArray?.length || 0;
    let count = tr(n == 1 ? "{n} task" : "{n} tasks", { n: n.toLocaleString(Services.locale.appLocaleAsBCP47) });
    // Hinweis „bitte einen beschreibbaren Kalender wählen“ unter dem Titel (wie Apple
    // Erinnerungen) statt neben dem „+“ – dort stehen jetzt die Aktionen
    const field = d.getElementById("view-task-edit-field");
    if (field?.readOnly && field.value) {
      count += " · " + field.value;
    }
    box.querySelector(".mc-lh-count").textContent = count;
    const filter = box.querySelector(".mc-lh-filter");
    const on = (group?.value || "throughcurrent") != "throughcurrent";
    filter?.setAttribute("aria-pressed", String(on));
    if (filter) {
      filter.title = tr("Filter Tasks");
    }
    const more = box.querySelector(".mc-lh-more");
    if (more) {
      more.title = tr("Task List Display Options");
    }
  }

  // Kopfzeile über der Kontaktliste: gewähltes Adressbuch und Anzahl der
  // (sichtbaren) Kontakte; aktualisiert sich bei Auswahl und Suche.
  updateAbHeader(box, cw) {
    const title = box.querySelector(".mc-lh-title");
    const count = box.querySelector(".mc-lh-count");
    const books = cw?.booksList;
    const list = cw?.cardsPane?.cardsList;
    if (!books || !list) {
      return;
    }
    if (!cw.__mcHeaderHook) {
      cw.__mcHeaderHook = true;
      // nur solange das Adressbuch vorne ist: die Kopfzeile steht auch über der
      // Mailliste, und die Kontaktliste ändert sich im Hintergrund (gesammelte
      // Adressen, CardDAV). Beim Zurückwechseln füllt updateListHeader sie neu.
      const update = () => cw.setTimeout(() => {
        const tab = box.ownerDocument.getElementById("tabmail")?.currentTabInfo;
        if (tab?.browser?.contentWindow == cw) {
          this.updateAbHeader(box, cw);
        }
      }, 0);
      const search = cw.cardsPane.searchInput;
      books.addEventListener("select", update);
      search?.addEventListener("autocomplete", update);
      const mo = new cw.MutationObserver(update);
      mo.observe(list, { childList: true, subtree: true });
      this.addWinRestorer(cw, () => {
        books.removeEventListener("select", update);
        search?.removeEventListener("autocomplete", update);
        mo.disconnect();
        delete cw.__mcHeaderHook;
      });
    }
    try {
      const row = books.getRowAtIndex?.(books.selectedIndex) || books.selectedRow;
      const name = row?.querySelector(".bookRow-name, .listRow-name, span")?.textContent || row?.textContent || "";
      title.textContent = name.trim();
      const n = list.view?.rowCount ?? 0;
      count.textContent = tr(n == 1 ? "{n} contact" : "{n} contacts", { n: n.toLocaleString(Services.locale.appLocaleAsBCP47) });
    } catch (e) {
      log("ab header error", e);
    }
  }

  // Bereiche-Leiste wie die Ordnerliste animieren: Breite 0 ↔ 67 px über
  // --mc-spaces-w (userChrome.css leitet --spaces-total-width davon ab), die
  // Leiste schiebt sich dabei von links herein bzw. hinaus.
  animateSpaces(w, onDone) {
    const spaces = w.gSpacesToolbar;
    const root = w.document.documentElement;
    if (!spaces || w.__mcSpacesAnimating) {
      return;
    }
    const FULL = 67;
    const DURATION = motionMs(250);
    const curve = cubicBezier(0.25, 0.1, 0.25, 1);
    const showing = spaces.isHidden;
    // Die Breite nicht als Variable am Wurzelelement ändern – das ließe
    // Thunderbird pro Bild alle ~5000 Elemente des Fensters neu durchrechnen
    // (~20 ms, die Animation ruckelt). Stattdessen direkt an den fünf
    // Elementen, die sich bewegen; am Ende wieder entfernen.
    const d = w.document;
    const bar = d.getElementById("spacesToolbar");
    const body = d.getElementById("messengerBody");
    const title = d.getElementById("titlebar");
    const row = d.getElementById("unifiedToolbarContainer");
    const toggle = d.getElementById("mcSpacesToggle");
    // der Knopf bleibt stehen und zeigt gleich die neue Richtung
    toggle?.toggleAttribute("data-mc-hidden", !showing);
    const set = v => {
      const px = `${v}px`;
      bar?.style.setProperty("--spaces-total-width", px);
      if (body) {
        body.style.marginInlineStart = px;
      }
      if (title) {
        title.style.marginInlineStart = px;
      }
      if (row) {
        row.style.inlineSize = `calc(100vw - ${px})`;
      }
    };
    const clear = () => {
      bar?.style.removeProperty("--spaces-total-width");
      body?.style.removeProperty("margin-inline-start");
      title?.style.removeProperty("margin-inline-start");
      row?.style.removeProperty("inline-size");
    };
    w.__mcSpacesAnimating = true;
    if (showing) {
      set(0);
      spaces.toggleToolbar(false);
      root.getBoundingClientRect(); // Aufbau jetzt erzwingen, nicht im ersten Bild
    }
    let start = null;
    const step = now => {
      if (start === null) {
        start = now;
      }
      const k = Math.min(1, (now - start) / DURATION);
      set(FULL * (showing ? curve(k) : 1 - curve(k)));
      if (k < 1) {
        w.requestAnimationFrame(step);
        return;
      }
      if (!showing) {
        spaces.toggleToolbar(true);
      }
      clear();
      root.style.removeProperty("--mc-spaces-w");
      w.__mcSpacesAnimating = false;
      toggle?.toggleAttribute("data-mc-hidden", !!spaces.isHidden);
      onDone?.();
      const realign = () => {
        this.offsetUpdaters?.forEach(fn => fn());
        this.sideEdgeUpdaters?.forEach(fn => fn());
      };
      realign();
      w.setTimeout(realign, 30);
    };
    w.requestAnimationFrame(() => w.requestAnimationFrame(step));
  }

  // ---------------------------------------------------------------------------
  // Schnellfenster „Neuer Termin / Neue Aufgabe“ wie in Apple Kalender: ein
  // Popover am „+“ mit den wichtigsten Feldern; „Mehr Optionen …“ öffnet
  // Thunderbirds großes Fenster mit allen Eingaben. Gespeichert wird über
  // Thunderbirds eigene Transaktion (damit „Rückgängig“ funktioniert).
  // ---------------------------------------------------------------------------
  // preset (Doppelklick im Kalender): { start: Date, allDay, at: {x, y} (Bildschirm), calendar }
  openQuickCreate(w, mode = "event", anchor = null, preset = null) {
    const d = w.document;
    const X = "http://www.w3.org/1999/xhtml";
    const locale = Services.locale.appLocaleAsBCP47;
    let cal, CalEvent, CalTodo, CalAlarm, CalRecurrenceInfo;
    try {
      ({ cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs"));
      ({ CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs"));
      ({ CalTodo } = ChromeUtils.importESModule("resource:///modules/CalTodo.sys.mjs"));
      ({ CalAlarm } = ChromeUtils.importESModule("resource:///modules/CalAlarm.sys.mjs"));
      ({ CalRecurrenceInfo } = ChromeUtils.importESModule("resource:///modules/CalRecurrenceInfo.sys.mjs"));
    } catch (e) {
      log("quick create import error", String(e).slice(0, 160));
      w.goDoCommand(mode == "task" ? "calendar_new_todo_command" : "calendar_new_event_command");
      return;
    }
    const el = (tag, props = {}, ...kids) => {
      const node = d.createElementNS(X, tag);
      for (const [k, v] of Object.entries(props)) {
        if (k == "class") {
          node.className = v;
        } else if (k in node && typeof v != "string") {
          node[k] = v;
        } else {
          node.setAttribute(k, v);
        }
      }
      node.append(...kids);
      return node;
    };
    const pad = n => String(n).padStart(2, "0");
    const dateValue = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    const timeValue = dt => `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
    const parse = (dateStr, timeStr) => {
      const [y, m, day] = (dateStr || "").split("-").map(Number);
      const [hh, mm] = (timeStr || "00:00").split(":").map(Number);
      return y ? laterHour(new Date(y, m - 1, day, hh || 0, mm || 0)) : null;
    };
    // Uhrzeit in der doppelten Stunde (Ende der Sommerzeit): die zweite, wie der
    // Kalender selbst sie speichert (Wanduhrzeit mit Zeitzone) – sonst wäre der
    // angelegte Termin eine Stunde kürzer als im Schnellfenster angezeigt
    function laterHour(dt) {
      const next = new Date(dt.getTime() + 3600000);
      return next.getHours() == dt.getHours() && next.getMinutes() == dt.getMinutes() ? next : dt;
    }
    // Dauer als echte Dauer rechnen (wie Apple Kalender): „2 Stunden“ bleiben auch über
    // die Zeitumstellung zwei echte Stunden. Weil die
    // Felder nur Wanduhrzeit zeigen, merkt sich jedes Feldpaar den genauen Zeitpunkt
    // (die doppelte Stunde wäre sonst mehrdeutig) und nutzt ihn, solange die Felder passen
    const plusMinutes = (dt, min) => new Date(dt.getTime() + min * 60000);
    const setWhen = (di, ti, dt) => {
      di.value = dateValue(dt);
      ti.value = timeValue(dt);
      di.__mcExact = dt;
    };
    const when = (di, ti, time = ti.value) => {
      const x = di.__mcExact;
      return x && dateValue(x) == di.value && timeValue(x) == time ? x : parse(di.value, time);
    };
    const fmtDate = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
    const fmtTime = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" });
    const toCal = (js, dateOnly) => {
      const dt = cal.dtz.jsDateToDateTime(js, cal.dtz.defaultTimezone);
      if (dateOnly) {
        dt.isDate = true;
      }
      return dt;
    };

    let panel = d.getElementById("mcQuickPanel");
    if (!panel) {
      panel = d.createXULElement("panel");
      panel.id = "mcQuickPanel";
      panel.setAttribute("type", "arrow");
      const f = {};
      f.segEvent = el("button", { type: "button", "data-mode": "event" }, tr("Event"));
      f.segTask = el("button", { type: "button", "data-mode": "task" }, tr("Task"));
      f.title = el("input", { class: "mc-qc-title", type: "text" });
      f.line1 = el("div", { class: "mc-qc-line1" });
      f.line2 = el("div", { class: "mc-qc-line2" });
      f.summary = el("div", { class: "mc-qc-summary", tabindex: "0" }, f.line1, f.line2);
      f.allDay = el("input", { type: "checkbox" });
      f.startDate = el("input", { type: "date" });
      f.startTime = el("input", { type: "time" });
      f.endDate = el("input", { type: "date" });
      f.endTime = el("input", { type: "time" });
      f.hasDue = el("input", { type: "checkbox" });
      f.dueDate = el("input", { type: "date" });
      f.dueTime = el("input", { type: "time" });
      const options = (pairs) => pairs.map(([v, label]) => el("option", { value: v }, label));
      f.repeat = el("select", {}, ...options([
        ["", tr("Never")], ["DAILY", tr("Every Day")], ["WEEKLY", tr("Every Week")],
        ["MONTHLY", tr("Every Month")], ["YEARLY", tr("Every Year")],
      ]));
      f.alert = el("select", {}, ...options([
        ["", tr("None")], ["PT0M", tr("At time of event")], ["PT5M", tr("5 minutes before")],
        ["PT15M", tr("15 minutes before")], ["PT30M", tr("30 minutes before")],
        ["PT1H", tr("1 hour before")], ["P1D", tr("1 day before")],
      ]));
      f.showAs = el("select", {}, ...options([["OPAQUE", tr("Busy")], ["TRANSPARENT", tr("Free")]]));
      const row = (label, cls, ...ctrls) => el("div", { class: `mc-qc-row ${cls || ""}` }, el("label", {}, label), el("div", { class: "mc-qc-ctrl" }, ...ctrls));
      f.details = el("div", { class: "mc-qc-details" },
        row(tr("All Day"), "mc-ev", f.allDay),
        row(tr("Starts"), "mc-ev", f.startDate, f.startTime),
        row(tr("Ends"), "mc-ev", f.endDate, f.endTime),
        row(tr("Due"), "mc-td", f.hasDue, f.dueDate, f.dueTime),
        row(tr("Repeat"), "mc-ev", f.repeat),
        row(tr("Alert"), "", f.alert),
        row(tr("Show As"), "mc-ev", f.showAs),
      );
      f.time = el("div", { class: "mc-qc-time mc-qc-card" }, f.summary, f.details);
      f.main = el("div", { class: "mc-qc-main" }, el("div", { class: "mc-qc-card mc-qc-titlecard" }, f.title), f.time);
      f.location = el("input", { class: "mc-qc-card mc-qc-field mc-ev-only", type: "text", placeholder: tr("Add Location") });
      f.invitees = el("button", { type: "button", class: "mc-qc-card mc-qc-field mc-qc-placeholder mc-ev-only" }, tr("Add Invitees…"));
      f.calendar = el("select", { class: "mc-qc-calsel" });
      f.calCard = el("div", { class: "mc-qc-card mc-qc-field mc-qc-calcard" }, f.calendar);
      f.notes = el("textarea", { class: "mc-qc-card mc-qc-field", rows: "2", placeholder: tr("Add Notes or URL") });
      f.more = el("button", { type: "button", class: "mc-qc-link" }, tr("More Options…"));
      f.cancel = el("button", { type: "button", class: "mc-qc-btn" }, tr("Cancel"));
      f.add = el("button", { type: "button", class: "mc-qc-btn mc-qc-primary" }, tr("Add"));
      const root = el("div", { class: "mc-qc" },
        el("div", { class: "mc-qc-seg" }, f.segEvent, f.segTask),
        f.main, f.location, f.invitees, f.calCard, f.notes,
        el("div", { class: "mc-qc-footer" }, f.more, el("span", { class: "mc-qc-spacer" }), f.cancel, f.add),
      );
      panel.append(root);
      (d.getElementById("mainPopupSet") || d.documentElement).append(panel);
      panel.__mc = f;
      this.restorers.push(() => panel.remove());

      // --- Verhalten ---
      const state = { mode: "event" };
      panel.__mcState = state;
      const writable = c => {
        try {
          return cal.acl.isCalendarWritable(c) && cal.acl.userCanAddItemsToCalendar(c);
        } catch {
          return !c.readOnly;
        }
      };
      const calendars = () => cal.manager.getCalendars().filter(c =>
        writable(c) && !c.getProperty("disabled") &&
        (state.mode == "task" ? c.getProperty("capabilities.tasks.supported") !== false
          : c.getProperty("capabilities.events.supported") !== false));
      const color = c => c?.getProperty("color") || "#8E8E93";
      const fillCalendars = () => {
        const list = calendars();
        const current = f.calendar.value;
        f.calendar.replaceChildren(...list.map(c => el("option", { value: c.id }, c.name)));
        let def = null;
        try {
          def = w.getSelectedCalendar?.();
        } catch {}
        f.calendar.value = list.some(c => c.id == current) ? current : (list.some(c => c.id == def?.id) ? def.id : list[0]?.id || "");
        // kein passender Kalender (z. B. keiner kann Aufgaben): sagen statt still nichts tun
        if (!list.length) {
          f.calendar.replaceChildren(el("option", { value: "" },
            state.mode == "task" ? tr("No calendar for tasks") : tr("No writable calendar")));
        }
        f.add.disabled = !list.length;
        f.more.disabled = !list.length;
        updateColor();
      };
      const selectedCalendar = () => cal.manager.getCalendarById(f.calendar.value);
      const updateColor = () => root.style.setProperty("--mc-qc-color", color(selectedCalendar()));
      const updateSummary = () => {
        if (state.mode == "task") {
          // Erinnerung braucht eine Fälligkeit (sonst ginge sie beim Anlegen verloren)
          if (f.alert.value && !f.hasDue.checked) {
            f.hasDue.checked = true;
            root.toggleAttribute("data-due", true);
          }
          const due = f.hasDue.checked ? parse(f.dueDate.value, f.dueTime.value) : null;
          f.line1.textContent = due ? `${tr("Due")} ${fmtDate.format(due)} ${fmtTime.format(due)}` : tr("No Due Date");
          f.line2.textContent = f.alert.value ? chosen(f.alert) : tr("Add Due Date or Alert");
          return;
        }
        const s = parse(f.startDate.value, f.startTime.value);
        const e = parse(f.endDate.value, f.endTime.value);
        if (!s) {
          f.line1.textContent = "";
        } else if (f.allDay.checked) {
          const sameDay = !e || f.startDate.value == f.endDate.value;
          f.line1.textContent = sameDay ? `${fmtDate.format(s)}  ${tr("all-day")}` : `${fmtDate.format(s)} – ${fmtDate.format(e)}`;
        } else {
          const sameDay = e && f.startDate.value == f.endDate.value;
          f.line1.textContent = sameDay
            ? `${fmtDate.format(s)}  ${fmtTime.format(s)} – ${fmtTime.format(e)}`
            : `${fmtDate.format(s)} ${fmtTime.format(s)} – ${e ? `${fmtDate.format(e)} ${fmtTime.format(e)}` : ""}`;
        }
        const set = [f.repeat, f.alert].filter(x => x.value).map(chosen);
        f.line2.textContent = set.length ? set.join(" · ") : tr("Add Alert or Repeat");
      };
      // gewählte Wiederholung/Erinnerung als Text („Wöchentlich · 15 Minuten vorher“)
      function chosen(select) {
        const label = select.selectedOptions[0]?.textContent || "";
        return select == f.alert ? `${tr("Alert")}: ${label}` : label;
      }
      for (const input of [f.repeat, f.alert]) {
        input.addEventListener("change", () => updateSummary());
      }
      const setMode = m => {
        state.mode = m;
        root.dataset.mode = m;
        f.segEvent.toggleAttribute("selected", m == "event");
        f.segTask.toggleAttribute("selected", m == "task");
        f.title.placeholder = m == "task" ? tr("New Task") : tr("New Event");
        fillCalendars();
        updateSummary();
        panel.__mcApplyNatural?.();
      };
      panel.__mcSetMode = setMode;
      panel.__mcUpdate = updateSummary;
      panel.__mcFillCalendars = fillCalendars;
      f.segEvent.addEventListener("click", () => setMode("event"));
      f.segTask.addEventListener("click", () => setMode("task"));
      const expand = () => {
        root.toggleAttribute("data-expanded", true);
      };
      f.summary.addEventListener("click", expand);
      f.summary.addEventListener("keydown", e => (e.key == "Enter" || e.key == " ") && expand());
      f.allDay.addEventListener("change", () => {
        root.toggleAttribute("data-allday", f.allDay.checked);
        updateSummary();
      });
      // Beginn verschoben → Ende mitschieben (gleiche Dauer)
      let lastStart = null;
      const onStart = () => {
        const s = when(f.startDate, f.startTime);
        const e = when(f.endDate, f.endTime);
        if (s && e && lastStart) {
          setWhen(f.endDate, f.endTime, new Date(e.getTime() + (s - lastStart)));
        }
        lastStart = s;
        updateSummary();
      };
      panel.__mcSetLastStart = v => (lastStart = v);
      for (const input of [f.startDate, f.startTime]) {
        input.addEventListener("change", onStart);
      }
      for (const input of [f.endDate, f.endTime, f.dueDate, f.dueTime]) {
        input.addEventListener("change", updateSummary);
      }
      f.hasDue.addEventListener("change", () => {
        root.toggleAttribute("data-due", f.hasDue.checked);
        if (!f.hasDue.checked) {
          f.alert.value = "";
        }
        updateSummary();
      });
      f.calendar.addEventListener("change", updateColor);

      // Natürliche Eingabe: Datum/Uhrzeit aus dem Titel übernehmen, solange
      // sie nicht von Hand geändert wurden; der Titel wird ohne sie angelegt
      for (const input of [f.allDay, f.startDate, f.startTime, f.endDate, f.endTime, f.hasDue, f.dueDate, f.dueTime]) {
        input.addEventListener("change", event => {
          if (event.isTrusted) {
            panel.__mcManualTime = true;
          }
        });
      }
      const applyNatural = () => {
        if (panel.__mcManualTime) {
          return;
        }
        const r = parseNatural(f.title.value);
        const def = panel.__mcDefaults;
        panel.__mcParsed = r.start ? r : null;
        let start = r.start || def.start;
        let end = r.end || (r.allDay ? start : plusMinutes(start, 60));
        // nur Tag und Dauer erkannt: Uhrzeit wie vorbelegt, Ende nach der Dauer
        if (r.start && !r.allDay && !r.end && r.duration != null) {
          start = laterHour(new Date(r.start.getFullYear(), r.start.getMonth(), r.start.getDate(), def.start.getHours(), def.start.getMinutes()));
          end = plusMinutes(start, r.duration);
        } else if (r.start && !r.allDay && r.duration != null) {
          start = laterHour(r.start);
          end = plusMinutes(start, r.duration);
        }
        const allDay = r.start ? !!r.allDay : def.allDay;
        if (state.mode == "task") {
          f.hasDue.checked = !!r.start || def.hasDue;
          root.toggleAttribute("data-due", f.hasDue.checked);
          f.dueDate.value = dateValue(start);
          if (!r.allDay) {
            f.dueTime.value = timeValue(start);
          }
        } else {
          f.allDay.checked = allDay;
          root.toggleAttribute("data-allday", allDay);
          const timed = r.start && !r.allDay;
          setWhen(f.startDate, f.startTime, timed || !r.start ? start : laterHour(new Date(start.getFullYear(), start.getMonth(), start.getDate(), def.start.getHours(), def.start.getMinutes())));
          setWhen(f.endDate, f.endTime, timed ? end : allDay ? new Date(start.getFullYear(), start.getMonth(), start.getDate(), def.end.getHours(), def.end.getMinutes()) : def.end);
          panel.__mcSetLastStart(when(f.startDate, f.startTime));
        }
        updateSummary();
      };
      panel.__mcApplyNatural = applyNatural;
      f.title.addEventListener("input", applyNatural);

      // Eigenes Menü statt der Auswahlliste von macOS: dort gibt es keine
      // Farben pro Eintrag – hier steht vor jedem Kalender sein Farbpunkt
      const dot = c => `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="6" fill="${color(c)}"/></svg>`)}`;
      const calMenu = d.createXULElement("menupopup");
      calMenu.id = "mcQuickCalMenu";
      panel.append(calMenu);
      const openCalMenu = () => {
        if (!calendars().length) {
          return;
        }
        const current = f.calendar.value;
        calMenu.replaceChildren(...calendars().map(c => {
          const item = d.createXULElement("menuitem");
          item.className = "menuitem-iconic";
          item.setAttribute("label", c.name);
          item.setAttribute("image", dot(c));
          const note = calendarNote(c);
          if (note) {
            item.setAttribute("tooltiptext", note);
          }
          if (c.id == current) {
            item.setAttribute("mc-current", "true");
          }
          item.addEventListener("command", () => {
            f.calendar.value = c.id;
            f.calendar.dispatchEvent(new w.Event("change", { bubbles: true }));
          });
          return item;
        }));
        calMenu.style.minWidth = `${Math.round(f.calCard.getBoundingClientRect().width)}px`;
        calMenu.openPopup(f.calCard, "after_start", 0, 2);
      };
      f.calendar.addEventListener("mousedown", event => {
        if (event.button == 0) {
          event.preventDefault();
          openCalMenu();
        }
      });
      f.calendar.addEventListener("keydown", event => {
        if ([" ", "Enter", "ArrowDown", "ArrowUp"].includes(event.key)) {
          event.preventDefault();
          openCalMenu();
        }
      });

      const buildItem = () => {
        const calendar = selectedCalendar();
        let item;
        if (state.mode == "task") {
          item = new CalTodo();
          item.title = (panel.__mcParsed?.title || f.title.value).trim() || tr("New Task");
          if (f.hasDue.checked) {
            const due = parse(f.dueDate.value, f.dueTime.value);
            if (due) {
              item.dueDate = toCal(due, false);
            }
          }
        } else {
          item = new CalEvent();
          item.title = (panel.__mcParsed?.title || f.title.value).trim() || tr("New Event");
          let s = when(f.startDate, f.startTime, f.allDay.checked ? "00:00" : f.startTime.value) || new Date();
          let e = when(f.endDate, f.endTime, f.allDay.checked ? "00:00" : f.endTime.value);
          if (f.allDay.checked) {
            // Ende vor dem Beginn: ein Tag am Beginn
            const last = e && e >= s ? e : s;
            e = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
          } else if (!e || e <= s) {
            e = plusMinutes(s, 60);
          }
          item.startDate = toCal(s, f.allDay.checked);
          item.endDate = toCal(e, f.allDay.checked);
          const loc = f.location.value.trim();
          if (loc) {
            item.setProperty("LOCATION", loc);
          }
          item.setProperty("TRANSP", f.showAs.value);
          if (f.repeat.value) {
            const info = new CalRecurrenceInfo(item);
            const rule = cal.createRecurrenceRule();
            rule.type = f.repeat.value;
            rule.interval = 1;
            info.appendRecurrenceItem(rule);
            item.recurrenceInfo = info;
          }
        }
        const notes = f.notes.value.trim();
        if (notes) {
          item.setProperty("DESCRIPTION", notes);
        }
        if (f.alert.value && (state.mode == "event" || item.dueDate)) {
          const alarm = new CalAlarm();
          alarm.related = state.mode == "task" ? Ci.calIAlarm.ALARM_RELATED_END : Ci.calIAlarm.ALARM_RELATED_START;
          const offset = cal.createDuration(f.alert.value);
          offset.isNegative = f.alert.value != "PT0M";
          alarm.offset = offset;
          alarm.action = "DISPLAY";
          item.addAlarm(alarm);
        }
        item.calendar = calendar;
        return { item, calendar };
      };
      const add = async () => {
        const { item, calendar } = buildItem();
        if (!calendar) {
          return;
        }
        panel.hidePopup();
        try {
          await w.doTransaction("add", item, calendar, null, null);
        } catch (e) {
          log("quick create add error", String(e).slice(0, 160));
        }
      };
      const more = () => {
        const { item, calendar } = buildItem();
        panel.hidePopup();
        try {
          if (state.mode == "task") {
            w.createTodoWithDialog(calendar, null, null, item);
          } else {
            w.createEventWithDialog(calendar, null, null, null, item);
          }
        } catch (e) {
          log("quick create dialog error", String(e).slice(0, 160));
        }
      };
      f.add.addEventListener("click", add);
      f.more.addEventListener("click", more);
      f.invitees.addEventListener("click", more);
      f.cancel.addEventListener("click", () => panel.hidePopup());
      root.addEventListener("keydown", e => {
        if (e.key == "Enter" && !e.isComposing && e.target.localName == "input" && e.target.type == "text") {
          e.preventDefault();
          add();
        }
      });
    }

    // --- Vorbelegen und öffnen ---
    const f = panel.__mc;
    const root = panel.firstElementChild;
    root.removeAttribute("data-expanded");
    root.removeAttribute("data-allday");
    root.removeAttribute("data-due");
    f.title.value = "";
    f.location.value = "";
    f.notes.value = "";
    f.allDay.checked = false;
    f.hasDue.checked = false;
    f.repeat.value = "";
    f.alert.value = "";
    f.showAs.value = "OPAQUE";
    // Tag: in der Today-Pane der dort gewählte Tag, sonst heute; Beginn zur
    // nächsten vollen Stunde, eine Stunde lang
    const now = new Date();
    let day = now;
    try {
      const ts = w.TodayPane?.start;
      if (anchor?.id == "todaypane-new-event-button" && ts) {
        day = new Date(ts.year, ts.month, ts.day, now.getHours(), now.getMinutes());
      }
    } catch {}
    // ein anderer Tag als heute bleibt auch nach 23 Uhr dieser Tag (23:00 statt
    // 0:00 am Folgetag); heute – auch per „+“ der Today-Pane – wie bisher 0:00 am
    // Folgetag statt eines Beginns in der Vergangenheit (Datum vergleichen, die
    // Today-Pane liefert ein eigenes Date-Objekt)
    const nextHour = Math.min(now.getHours() + 1, 23);
    const isToday = day.getFullYear() == now.getFullYear() && day.getMonth() == now.getMonth() && day.getDate() == now.getDate();
    let start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), isToday ? now.getHours() + 1 : nextHour, 0);
    if (preset?.start) {
      start = preset.allDay
        ? new Date(preset.start.getFullYear(), preset.start.getMonth(), preset.start.getDate(), nextHour, 0)
        : new Date(preset.start);
    }
    start = laterHour(start);
    const end = plusMinutes(start, 60);
    if (preset?.allDay) {
      f.allDay.checked = true;
      root.toggleAttribute("data-allday", true);
    }
    setWhen(f.startDate, f.startTime, start);
    setWhen(f.endDate, f.endTime, end);
    f.dueDate.value = dateValue(start);
    f.dueTime.value = timeValue(start);
    panel.__mcSetLastStart(start);
    // Ausgangswerte für die natürliche Eingabe (zurück, wenn „morgen“ wieder gelöscht wird)
    panel.__mcDefaults = { start, end, allDay: !!preset?.allDay, hasDue: false };
    panel.__mcParsed = null;
    panel.__mcManualTime = false;
    panel.__mcSetMode(mode);
    // Kalender, in den doppelgeklickt wurde (sonst der ausgewählte)
    if (preset?.calendar?.id && [...f.calendar.options].some(o => o.value == preset.calendar.id)) {
      f.calendar.value = preset.calendar.id;
      f.calendar.dispatchEvent(new w.Event("change", { bubbles: true }));
    }
    // Das Fenster ist 380 px breit. Thunderbird schiebt es am Bildschirmrand
    // nicht zurück, sondern drückt es zusammen (rechts abgeschnitten) – daher
    // selbst so weit nach links rücken, dass es ganz ins Fenster und auf den
    // Bildschirm passt (z. B. unter dem „+“ ganz rechts in der Today-Pane)
    const PANEL_W = 380;
    const screenRight = w.screen.availLeft + w.screen.availWidth;
    panel.__mcPlaced = null;
    panel.removeEventListener("popupshown", panel.__mcReplace);
    if (preset?.at?.rect) {
      // neben dem angeklickten Tag wie in Apple Kalender: auf der Seite zur
      // Fenstermitte hin (Tag rechts → links daneben), senkrecht mittig zur
      // Zelle bzw. Uhrzeit, dann ins Fenster und auf den Bildschirm geschoben
      // sehr breite Zelle (Tagesansicht: eine Spalte fast so breit wie das
      // Fenster): neben der Klickstelle statt neben der ganzen Spalte, sonst
      // landete das Fenster weit weg am Fensterrand
      const cell = preset.at.rect.width > 2 * PANEL_W ? { ...preset.at.rect, left: preset.at.x, width: 0 } : preset.at.rect;
      const fit = (v, size, lo, hi) => (hi - lo >= size ? Math.max(lo, Math.min(v, hi - size)) : lo);
      const place = height => {
        const winL = w.mozInnerScreenX;
        const winT = w.mozInnerScreenY;
        const scrL = w.screen.availLeft;
        const scrT = w.screen.availTop;
        const left = Math.max(winL, scrL) + 8;
        const right = Math.min(winL + w.innerWidth, scrL + w.screen.availWidth) - 8;
        const top = Math.max(winT, scrT) + 8;
        const bottom = Math.min(winT + w.innerHeight, scrT + w.screen.availHeight) - 8;
        const toRight = cell.left + cell.width / 2 < winL + w.innerWidth / 2;
        const x = toRight ? cell.left + cell.width + 6 : cell.left - 6 - PANEL_W;
        const y = cell.top + cell.height / 2 - height / 2;
        return {
          x: Math.round(right - left >= PANEL_W ? fit(x, PANEL_W, left, right) : fit(x, PANEL_W, scrL + 8, scrL + w.screen.availWidth - 8)),
          y: Math.round(bottom - top >= height ? fit(y, height, top, bottom) : fit(y, height, scrT + 8, scrT + w.screen.availHeight - 8)),
          side: toRight ? "right" : "left",
        };
      };
      // Höhe erst nach dem Öffnen bekannt: mit einer Schätzung öffnen und einmal nachrücken
      let at = place(360);
      panel.__mcPlaced = at;
      panel.__mcReplace = () => {
        panel.removeEventListener("popupshown", panel.__mcReplace);
        const height = panel.getOuterScreenRect().height;
        const again = height ? place(height) : at;
        if (again.x != at.x || again.y != at.y) {
          at = again;
          panel.__mcPlaced = at;
          panel.moveTo(at.x, at.y);
        }
      };
      panel.addEventListener("popupshown", panel.__mcReplace);
      panel.openPopupAtScreen(at.x, at.y, false);
    } else if (preset?.at) {
      // an der Mausposition, etwas nach rechts unten versetzt
      const x = Math.max(w.screen.availLeft + 8, Math.min(preset.at.x + 8, screenRight - PANEL_W - 8));
      panel.openPopupAtScreen(x, preset.at.y + 8, false);
    } else if (anchor) {
      const r = anchor.getBoundingClientRect();
      const below = r.top < w.innerHeight / 2;
      const right = Math.min(w.innerWidth, screenRight - w.mozInnerScreenX) - 8;
      const left = Math.max(8, Math.min(r.left + r.width / 2 - PANEL_W / 2, right - PANEL_W));
      panel.openPopup(anchor, below ? "after_start" : "before_start", Math.round(left - r.left), below ? 4 : -4);
    } else {
      panel.openPopup(null, "", Math.round(w.innerWidth / 2 - 190), 80, false, false);
    }
    w.setTimeout(() => f.title.focus(), 50);
  }

  // Terminliste der Today-Pane: vom Starttag bis zum Monatsende (statt einer
  // festen Anzahl Tage) – passt zum Monat im Titel
  hookAgendaMonthRange(w) {
    const agenda = w.TodayPane?.agenda;
    if (!agenda || agenda.__mcMonthRange) {
      return;
    }
    agenda.__mcMonthRange = true;
    Object.defineProperty(agenda, "numberOfDays", {
      configurable: true,
      get() {
        try {
          const start = this.startDate || w.TodayPane.start;
          const last = new Date(start.year, start.month + 1, 0).getDate();
          return Math.max(1, last - start.day + 1);
        } catch {
          return 14;
        }
      },
    });
    // Thunderbird zeigt für andere Tage als heute nur diesen einen Tag –
    // hier immer vom Starttag bis zum Monatsende
    agenda.update = async function (date) {
      date ||= this.startDate || w.TodayPane.start;
      if (!date) {
        return;
      }
      this.startDate = date.clone();
      this.startDate.isDate = true;
      this.endDate = this.startDate.clone();
      this.endDate.day += this.numberOfDays;
      this.itemType = Ci.calICalendar.ITEM_FILTER_TYPE_EVENT;
      if (this.isActive) {
        await this.refreshItems();
      } else {
        await this.ensureInitialized();
      }
      this.selectedIndex = 0;
    };
    try {
      w.TodayPane.updatePeriod();
    } catch {}
    this.restorers.push(() => {
      delete agenda.update;
      Object.defineProperty(agenda, "numberOfDays", {
        configurable: true,
        get: () => Services.prefs.getIntPref("calendar.agenda.days", 14),
      });
      delete agenda.__mcMonthRange;
      try {
        w.TodayPane.updatePeriod();
      } catch {}
    });
  }

  // Monat der Today-Pane wechseln: aktueller Monat ab heute, sonst ab dem 1.
  shiftAgendaMonth(w, dir) {
    try {
      const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
      const start = w.TodayPane.start;
      const target = new Date(start.year, start.month + dir, 1);
      const now = new Date();
      const day = target.getFullYear() == now.getFullYear() && target.getMonth() == now.getMonth()
        ? now : target;
      const dt = cal.dtz.jsDateToDateTime(new Date(day.getFullYear(), day.getMonth(), day.getDate()), cal.dtz.defaultTimezone);
      dt.isDate = true;
      w.TodayPane.setDay(dt);
    } catch (e) {
      log("agenda month error", String(e).slice(0, 160));
    }
  }

  // Today-Pane weich ein-/ausblenden wie die Seitenleisten: die Breite
  // gleitet zwischen 0 und voller Breite, der Inhalt behält seine Breite und
  // wird nur zugedeckt. Während der Animation liegt sie über dem Mailbereich
  // (position: absolute) – schob sie ihn pro Bild zur Seite, musste
  // Thunderbird Mailliste und geöffnete Mail jedes Mal neu anordnen (20–35 ms
  // pro Bild, sichtbares Ruckeln). So ändert sich der Mailbereich nur einmal:
  // beim Ausblenden am Anfang, beim Einblenden am Ende, jeweils unter der Pane.
  animateTodayPane(w, command, onDone) {
    const d = w.document;
    const panel = d.getElementById("today-pane-panel");
    if (!panel || panel.__mcAnimating) {
      return;
    }
    const showing = !w.TodayPane?.isVisible;
    if (showing) {
      command.doCommand();
    }
    const full = panel.getBoundingClientRect().width;
    if (!full) {
      if (!showing) {
        command.doCommand();
      }
      onDone?.();
      return;
    }
    panel.__mcAnimating = true;
    panel.setAttribute("data-mc-anim", "true"); // Mindestbreite (CSS) solange aussetzen
    // „+“ beim Ausblenden gleich zu Beginn weg – sonst gleitet der Today-Knopf darüber
    if (!showing) {
      d.getElementById("unifiedToolbarContainer")?.removeAttribute("data-mc-tp-open");
    }
    // Platz für die Today-Pane in der Toolbar beim Einblenden gleich am Anfang
    // (beim Ausblenden erst am Ende, über todayTopSync) – nicht mittendrin
    if (showing) {
      d.getElementById("unifiedToolbarContainer")?.style.setProperty("--mc-tp-room", `${Math.round(full)}px`);
    }
    const DURATION = motionMs(250);
    const curve = cubicBezier(0.25, 0.1, 0.25, 1);
    const PROPS = ["overflow", "min-width", "width", "max-width", "position", "inset-block", "inset-inline-end", "z-index"];
    const saved = PROPS.map(p => [p, panel.style.getPropertyValue(p), panel.style.getPropertyPriority(p)]);
    const box = panel.parentElement;
    const savedBox = box.style.getPropertyValue("position");
    const kids = [...panel.children];
    kids.forEach(k => k.style.setProperty("min-width", `${full}px`));
    box.style.setProperty("position", "relative");
    panel.style.setProperty("position", "absolute", "important");
    panel.style.setProperty("inset-block", "0", "important");
    panel.style.setProperty("inset-inline-end", "0", "important");
    panel.style.setProperty("z-index", "2", "important");
    panel.style.setProperty("overflow", "hidden", "important");
    panel.style.setProperty("min-width", "0px", "important");
    const setW = v => {
      panel.style.setProperty("width", `${v}px`, "important");
      panel.style.setProperty("max-width", `${v}px`, "important");
    };
    if (showing) {
      setW(0);
    }
    let start = null;
    const step = now => {
      if (start === null) {
        start = now;
      }
      const k = Math.min(1, (now - start) / DURATION);
      const value = full * (showing ? curve(k) : 1 - curve(k));
      setW(value);
      w.__mcTodayTopSync?.(value);
      if (k < 1) {
        w.requestAnimationFrame(step);
        return;
      }
      for (const [prop, value, prio] of saved) {
        if (value) {
          panel.style.setProperty(prop, value, prio);
        } else {
          panel.style.removeProperty(prop);
        }
      }
      kids.forEach(k2 => k2.style.removeProperty("min-width"));
      if (savedBox) {
        box.style.setProperty("position", savedBox);
      } else {
        box.style.removeProperty("position");
      }
      if (!showing) {
        command.doCommand();
      }
      panel.__mcAnimating = false;
      panel.removeAttribute("data-mc-anim");
      w.__mcTodayTopSync?.();
      // Toolbar einmal neu anordnen (während der Animation ausgesetzt)
      for (const f of this.offsetUpdaters || []) {
        try {
          f();
        } catch {}
      }
      d.getElementById("agenda")?.dispatchEvent(new w.Event("scroll"));
      onDone?.();
    };
    w.requestAnimationFrame(() => w.requestAnimationFrame(step));
  }

  applyToolbarOnce() {
    if (Services.prefs.getBoolPref(TOOLBAR_PREF, false)) {
      return; // spätere eigene Änderungen an der Toolbar bleiben erhalten
    }
    try {
      const { getState, storeState } = ChromeUtils.importESModule(
        "resource:///modules/CustomizationState.mjs"
      );
      // nur, wenn die Mail-Toolbar noch auf Thunderbirds Standard steht –
      // eigene Anordnungen und Knöpfe anderer Add-ons bleiben erhalten
      const state = getState();
      if (!state.mail) {
        storeState({ ...state, mail: APPLE_TOOLBAR });
        Services.prefs.setIntPref("toolbar.unifiedtoolbar.buttonstyle", 2); // nur Symbole
      }
      Services.prefs.setBoolPref(TOOLBAR_PREF, true);
    } catch (e) {
      log("toolbar error", e);
    }
  }

  // Einmalig die übrigen Bereiche belegen – nur Bereiche, die noch auf
  // Thunderbirds Standard stehen; eigene Anpassungen bleiben erhalten.
  applySpaceToolbarsOnce() {
    if (Services.prefs.getBoolPref(SPACE_TOOLBAR_PREF, false)) {
      return;
    }
    try {
      const { getState, storeState } = ChromeUtils.importESModule(
        "resource:///modules/CustomizationState.mjs"
      );
      const state = { ...getState() };
      for (const [space, items] of Object.entries(SPACE_TOOLBARS)) {
        if (!state[space]) {
          state[space] = items;
        }
      }
      storeState(state);
      Services.prefs.setBoolPref(SPACE_TOOLBAR_PREF, true);
    } catch (e) {
      log("space toolbar error", e);
    }
  }

  // Die Toolbar-Knöpfe sollen – wie in Apple Mail – genau über der linken
  // Kante der geöffneten Mail beginnen. Die Breite der Spalten davor wird
  // als CSS-Variable ans Hauptfenster gegeben (userChrome.css nutzt sie).
  trackToolbarOffset(win) {
    const top = win.browsingContext?.topChromeWindow;
    const threadPane = win.document.getElementById("threadPane");
    if (!top || !threadPane) {
      return;
    }
    // Thunderbird sperrt die Ordnerliste zeitweise mit „width: …px !important“
    // (Teiler „resize-lock-ids“). Wird diese Sperre in einem ungünstigen Moment
    // gesetzt (z. B. mitten in einer Animation), bleibt die Liste schmaler als
    // ihre Spalte und rechts davon entsteht eine weiße Lücke. Dann die Sperre
    // auf die echte Spaltenbreite korrigieren.
    const fixFolderLock = () => {
      const splitter = win.paneLayout?.folderPaneSplitter;
      const pane = win.document.getElementById("folderPane");
      if (!splitter || !pane || splitter.isCollapsed || win.__mcAnimating) {
        return;
      }
      if (pane.style.getPropertyPriority("width") != "important") {
        return;
      }
      const column = parseFloat(win.getComputedStyle(splitter.parentNode).gridTemplateColumns);
      const locked = parseFloat(pane.style.getPropertyValue("width"));
      if (Number.isFinite(column) && column > 0 && Math.abs(column - locked) > 1) {
        log("folder lock fixed", { locked, column });
        pane.style.setProperty("width", `${column}px`, "important");
      }
    };
    // Die Mailliste lässt sich nur so weit nach rechts ziehen, dass Knöpfe
    // und Suchfeld rechts davon Platz haben (wie in Apple Mail) – Thunderbirds
    // Teiler kennt kein Maximum, daher hier die kleinste Breite der Nachricht
    const minMessageWidth = () => {
      const pane = win.document.getElementById("messagePane");
      const browserEl = win.browsingContext.embedderElement;
      const row = top.document.getElementById("unifiedToolbarContainer");
      if (!pane || !browserEl || !row || !win.document.body.classList.contains("layout-vertical")) {
        return 0;
      }
      const msgRight = rectOf(browserEl).left + rectOf(pane).right;
      const want = toolbarNeed(top.document, true) - (rectOf(row).right - msgRight);
      // die Liste selbst nie schmaler als ihre Mindestbreite (CSS) machen
      const list = rectOf(threadPane);
      const listMin = parseFloat(win.getComputedStyle(threadPane).minWidth) || 240;
      const room = rectOf(pane).right - list.left - listMin;
      return Math.max(0, Math.min(want, room));
    };
    const msgSplitter = win.document.getElementById("messagePaneSplitter");
    if (msgSplitter && typeof msgSplitter._updateSize == "function" && !msgSplitter.__mcClamp) {
      msgSplitter.__mcClamp = true;
      const origUpdate = msgSplitter._updateSize;
      msgSplitter._updateSize = function (size) {
        return origUpdate.call(this, typeof size == "number" ? Math.max(size, minMessageWidth()) : size);
      };
      this.restorers.push(() => {
        msgSplitter._updateSize = origUpdate;
        delete msgSplitter.__mcClamp;
      });
    }
    // Mailliste in ihrer gemerkten Breite halten: ändert sich die Fensterbreite
    // (oder Today-Pane/Ordnerliste), bekommt die Nachricht die Differenz
    const keepListWidth = () => {
      if (!msgSplitter || msgSplitter.isCollapsed || win.__mcAnimating || top.__mcSpacesAnimating ||
          msgSplitter.resizeElement?.id != "messagePane" || !win.document.body.classList.contains("layout-vertical") ||
          msgSplitter.__mcDragging) {
        return;
      }
      const pane = win.document.getElementById("messagePane");
      const list = threadPane.getBoundingClientRect();
      const msg = pane.getBoundingClientRect();
      if (!list.width || !msg.width) {
        return;
      }
      const want = Services.prefs.getIntPref(LIST_WIDTH_PREF, LIST_WIDTH_DEFAULT);
      // was die Liste zu breit ist, bekommt die Nachricht dazu (und umgekehrt)
      const msgWant = Math.round(msg.width + list.width - want);
      if (msgWant > 0 && Math.abs(msgWant - msg.width) >= 1) {
        msgSplitter.width = Math.max(msgWant, minMessageWidth());
      }
    };
    // gezogen: neue Listenbreite merken
    if (msgSplitter && !msgSplitter.__mcListWatch) {
      msgSplitter.__mcListWatch = true;
      const onResizing = () => (msgSplitter.__mcDragging = true);
      const onResized = () => {
        if (!msgSplitter.__mcDragging) {
          return;
        }
        msgSplitter.__mcDragging = false;
        const width = Math.round(threadPane.getBoundingClientRect().width);
        if (width >= 200) {
          Services.prefs.setIntPref(LIST_WIDTH_PREF, width);
        }
      };
      msgSplitter.addEventListener("splitter-resizing", onResizing);
      msgSplitter.addEventListener("splitter-resized", onResized);
      this.restorers.push(() => {
        msgSplitter.removeEventListener("splitter-resizing", onResizing);
        msgSplitter.removeEventListener("splitter-resized", onResized);
        delete msgSplitter.__mcListWatch;
        delete msgSplitter.__mcDragging;
      });
    }
    const enforceMessageWidth = () => {
      if (!msgSplitter || msgSplitter.isCollapsed || win.__mcAnimating || top.__mcSpacesAnimating ||
          msgSplitter.resizeElement?.id != "messagePane") {
        return;
      }
      const min = minMessageWidth();
      const pane = win.document.getElementById("messagePane");
      if (min && pane.getBoundingClientRect().width < min - 1) {
        msgSplitter.width = Math.ceil(min);
      }
    };
    const update = () => {
      const content = top.document.getElementById("unifiedToolbarContent");
      const browserEl = win.browsingContext.embedderElement;
      if (!content || !browserEl || win.closed || top.__mcSpacesAnimating) {
        return;
      }
      keepListWidth();
      enforceMessageWidth();
      // nur der Mail-Tab, der gerade vorne ist, richtet die Toolbar aus –
      // sonst überschreibt ein zweiter Mail-Tab im Hintergrund die Kanten
      // (auch nicht, solange ein anderer Bereich vorne ist)
      const current = top.document.getElementById("tabmail")?.currentTabInfo;
      if (current?.chromeBrowser != browserEl) {
        return;
      }
      fixFolderLock();
      // im Adressbuch neu gezogene Listenbreite übernehmen
      if (this.mcListPending && msgSplitter && !msgSplitter.isCollapsed && msgSplitter.resizeElement?.id == "messagePane") {
        const listNow = rectOf(threadPane).width;
        const pane = win.document.getElementById("messagePane");
        if (listNow > 1 && this.mcButtonsLeft) {
          this.mcListPending = false;
          // rechte Listenkante auf die im Adressbuch gezogene Stelle
          const browserLeft = rectOf(win.browsingContext.embedderElement).left;
          const diff = browserLeft + rectOf(threadPane).right - (this.mcButtonsLeft - 6);
          if (Math.abs(diff) >= 1) {
            Services.prefs.setIntPref(LIST_WIDTH_PREF, Math.max(200, Math.round(listNow - diff)));
            msgSplitter.width = Math.max(minMessageWidth(), Math.round(rectOf(pane).width + diff));
          }
        }
      }
      // Ohne sichtbare Mailliste (z. B. Kontoübersicht) bleiben die Knöpfe
      // dort, wo sie in der Mailansicht zuletzt standen.
      const listRect = rectOf(threadPane);
      const folderRect = rectOf(win.document.getElementById("folderPane"));
      let listRight;
      if (listRect.width > 1) {
        listRight = listRect.right;
        this.lastListRight = listRight - (folderRect?.right || 0); // Breite der Mailliste merken
      } else {
        listRight = (folderRect?.right || 0) + (this.lastListRight ?? 0);
      }
      const paneRight = rectOf(browserEl).left + listRight;
      // für die übrigen Bereiche merken: dort beginnen die Knöpfe an derselben
      // Stelle, und die Kontaktliste im Adressbuch ist so breit wie die Mailliste
      this.mcButtonsLeft = paneRight + 6;
      if (listRect.width > 1) {
        this.mcListWidth = Math.round(listRect.width);
      }
      // Bezug ist der Anfang des ersten Abstandhalters (die Toolbar hat
      // eigenen Innenabstand); +6 px wie der Einzug in Apple Mail.
      const start = rectOf((content.querySelector(':scope > li[item-id="spacer"]') || content)).left;
      let offset = Math.max(0, Math.round(paneRight - start + 6));
      // nie links vom Seitenleisten-Knopf beginnen
      const toggle = top.document.getElementById("spacesPinnedButton");
      const tb = rectOf(toggle);
      if (tb && tb.width) {
        offset = Math.max(offset, Math.round(tb.right - start + 12));
      }
      setBarVar(top.document, "--mc-toolbar-offset", `${offset}px`);
      setVar(top.document.getElementById("unifiedToolbarContainer"), "--mc-row-tail", `${rowTail(top.document)}px`);
      // auch während die Today-Pane ein-/ausgleitet: sonst blendet das
      // Nachmessen mitten in der Animation Knöpfe um (ein 45-ms-Hänger)
      const animating = top.__mcSpacesAnimating || win.__mcAnimating ||
        top.document.getElementById("today-pane-panel")?.__mcAnimating;
      if (!animating) {
        const firstSpacer = content.querySelector(':scope > li[item-id="spacer"]');
        // passt, wenn die Knöpfe an der Listenkante beginnen und das Suchfeld
        // noch mindestens 160 px breit ist (sonst lieber Knöpfe ausblenden)
        const search = content.querySelector(':scope > li[item-id="search-bar"]');
        squeezeToolbar(top.document, () => (!firstSpacer || rectOf(firstSpacer).right >= start + offset - 2) &&
          (!search || rectOf(search).width >= 159));
      }
      // Suchfeld in jedem Bereich gleich breit (333 px wie Apple Mail): fehlt
      // dafür Platz, wird zuerst der Abstand nach „Verfassen“ kleiner (69 → 12 px)
      const write = content.querySelector(':scope > li[item-id="write-message"]');
      const search = content.querySelector(':scope > li[item-id="search-bar"]');
      // (nicht während einer Ein-/Ausblend-Animation – das kostet pro Bild ein
      // komplettes Neuberechnen; am Ende wird einmal gemessen)
      if (!animating && write && search && rectOf(write).width) {
        const spacer = search.previousElementSibling;
        const gap = parseFloat(top.getComputedStyle(write).marginInlineEnd) || 0;
        const spare = (spacer?.getAttribute("item-id") == "spacer" ? rectOf(spacer).width : 0) -
          (333 - rectOf(search).width);
        const next = Math.max(12, Math.min(69, Math.round(gap + spare)));
        if (Math.abs(next - gap) >= 1) {
          setBarVar(top.document, "--mc-write-gap", `${next}px`);
        }
      }
      // Rechte Kante der Ordnerliste relativ zur Toolbar-Zeile: damit färbt
      // userChrome.css die Seitenleiste bis ganz nach oben grau wie in Apple Mail.
      const folderPane = win.document.getElementById("folderPane");
      const row = top.document.getElementById("unifiedToolbarContainer");
      if (folderPane && row) {
        const fr = rectOf(folderPane);
        const right = fr.width
          ? rectOf(browserEl).left + fr.right - rectOf(row).left
          : 0;
        setBarVar(top.document, "--mc-sidebar-right", `${Math.max(0, Math.round(right))}px`
        );
        // rechte Kante der Mailliste für die Trennlinie in der Toolbar-Zeile
        // Ist das Fenster für alle Knöpfe zu schmal, schrumpft der Einzug davor –
        // die Kopfzeile über der Liste endet dann vor dem ersten Knopf
        const firstSpacer = content.querySelector(':scope > li[item-id="spacer"]');
        const buttonsStart = firstSpacer ? rectOf(firstSpacer).right : paneRight;
        const rowLeft = rectOf(row).left;
        // Trennlinie an der echten Kante der Mailliste; reicht der Platz nicht
        // und die Knöpfe beginnen schon links davon, entfällt sie in der
        // Toolbar-Zeile (statt versetzt quer durch die Knöpfe zu laufen)
        const listRight = buttonsStart >= paneRight - 2 ? paneRight - rowLeft : -10;
        setBarVar(top.document, "--mc-lh-right", `${Math.round(Math.min(paneRight, buttonsStart - 6) - rowLeft)}px`);
        // auf ganze Bildpunkte des Bildschirms (Retina: 0,5 px) – wie der
        // Rand der Mailliste, sonst steht die Linie oben um einen Punkt daneben
        const dpr = top.devicePixelRatio || 1;
        setBarVar(top.document, "--mc-list-right", `${Math.round(listRight * dpr) / dpr}px`
        );
        // Die Tab-Leiste kann weiter rechts beginnen (z. B. neben der
        // Bereiche-Leiste) – dort dieselben Kanten, um den Versatz korrigiert.
        const tabs = top.document.getElementById("tabs-toolbar");
        if (tabs) {
          const shift = rectOf(tabs).left - rectOf(row).left;
          setVar(tabs, "--mc-sidebar-right", `${Math.max(0, Math.round(right - shift))}px`);
          setVar(tabs, "--mc-list-right", `${Math.round((listRight - shift) * dpr) / dpr}px`);
        }
        // Statusleiste ebenso: Seitenleisten-Grau läuft unten bis zum Fensterrand
        const status = top.document.getElementById("status-bar");
        if (status) {
          const shift = rectOf(status).left - rectOf(row).left;
          setVar(status, "--mc-sidebar-right", `${Math.max(0, Math.round(right - shift))}px`);
        }
      }
    };
    this.offsetUpdaters ??= new Set();
    this.offsetUpdaters.add(update);
    const ro = new win.ResizeObserver(update);
    ro.observe(threadPane);
    const fp = win.document.getElementById("folderPane");
    if (fp) {
      ro.observe(fp);
    }
    // Ordnerliste ein-/ausgeklappt: sofort neu ausrichten (ein eingeklapptes
    // Element meldet der ResizeObserver nicht zuverlässig)
    const splitterEl = win.document.getElementById("folderPaneSplitter");
    const onSplitter = () => win.setTimeout(update, 0);
    for (const type of ["splitter-collapsed", "splitter-expanded", "splitter-resized"]) {
      splitterEl?.addEventListener(type, onSplitter);
    }
    this.restorers.push(() => {
      for (const type of ["splitter-collapsed", "splitter-expanded", "splitter-resized"]) {
        splitterEl?.removeEventListener(type, onSplitter);
      }
    });
    ro.observe(win.document.documentElement);
    update();
    this.restorers.push(() => {
      ro.disconnect();
      this.offsetUpdaters?.delete(update);
      const tabsBar = top.document.getElementById("tabs-toolbar");
      tabsBar?.style.removeProperty("--mc-sidebar-right");
      tabsBar?.style.removeProperty("--mc-list-right");
      top.document.getElementById("status-bar")?.style.removeProperty("--mc-sidebar-right");
      barTarget(top.document).style.removeProperty("--mc-toolbar-offset");
      barTarget(top.document).style.removeProperty("--mc-sidebar-right");
      barTarget(top.document).style.removeProperty("--mc-list-right");
      barTarget(top.document).style.removeProperty("--mc-lh-right");
    });
  }

  // Eigene Symbole statt Thunderbirds --icon-*-Grafiken. Die SVGs nutzen
  // context-stroke/-fill (Farbe vom Element) – das erlauben nur chrome:// und
  // resource://, deshalb resource://mailcards/ auf die Erweiterung zeigen lassen
  // und icon-vars.css als Benutzer-Stylesheet für alle Dokumente anmelden.
  registerIconVars() {
    if (!extensionRoot) {
      return;
    }
    const res = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
    res.setSubstitution("mailcards", extensionRoot);
    this.restorers.push(() => res.setSubstitution("mailcards", null));
    // Design in alle offenen Fenster (neue übernimmt der docObserver);
    // die Version in der Adresse umgeht Thunderbirds Stylesheet-Zwischenspeicher
    ThemeSheet.uri = `resource://mailcards/theme.css?v=${extensionVersion}`;
    ThemeSheet.init();
    for (const win of Services.wm.getEnumerator(null)) {
      ThemeSheet.applyTree(win);
    }
    this.restorers.push(() => ThemeSheet.removeAll());
    const sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(Ci.nsIStyleSheetService);
    // Scrollleisten überall ausblenden – global, damit auch Nachrichtentexte
    // und Dialoge ohne eigenes Design-Stylesheet erfasst sind
    const noScroll = Services.io.newURI(`resource://mailcards/noscroll.css?v=${extensionVersion}`);
    if (!sss.sheetRegistered(noScroll, sss.USER_SHEET)) {
      sss.loadAndRegisterSheet(noScroll, sss.USER_SHEET);
    }
    this.restorers.push(() => {
      if (sss.sheetRegistered(noScroll, sss.USER_SHEET)) {
        sss.unregisterSheet(noScroll, sss.USER_SHEET);
      }
    });
    // Textmails in der Systemschrift – schaltet sofort mit der Einstellung um
    const plain = Services.io.newURI(`resource://mailcards/plaintext.css?v=${extensionVersion}`);
    const applyPlain = () => {
      const on = Services.prefs.getBoolPref(PLAIN_TEXT_PREF, true) && Services.prefs.getBoolPref("extensions.mailcards.bundledTheme", true);
      const has = sss.sheetRegistered(plain, sss.USER_SHEET);
      if (on && !has) {
        sss.loadAndRegisterSheet(plain, sss.USER_SHEET);
      } else if (!on && has) {
        sss.unregisterSheet(plain, sss.USER_SHEET);
      }
    };
    const plainObs = { observe: applyPlain };
    Services.prefs.addObserver(PLAIN_TEXT_PREF, plainObs);
    applyPlain();
    this.restorers.push(() => {
      Services.prefs.removeObserver(PLAIN_TEXT_PREF, plainObs);
      if (sss.sheetRegistered(plain, sss.USER_SHEET)) {
        sss.unregisterSheet(plain, sss.USER_SHEET);
      }
    });
    // gedruckte Mail im Stil von Apple Mail (print.css) – gehört zum Design
    const print = Services.io.newURI(`resource://mailcards/print.css?v=${extensionVersion}`);
    if (Services.prefs.getBoolPref("extensions.mailcards.bundledTheme", true) && !sss.sheetRegistered(print, sss.USER_SHEET)) {
      sss.loadAndRegisterSheet(print, sss.USER_SHEET);
    }
    this.restorers.push(() => {
      if (sss.sheetRegistered(print, sss.USER_SHEET)) {
        sss.unregisterSheet(print, sss.USER_SHEET);
      }
    });
    // Ungelesene Mails leicht in Akzentfarbe (Option, Standard aus) – schaltet sofort um
    const tint = Services.io.newURI(`resource://mailcards/unread-tint.css?v=${extensionVersion}`);
    const applyTint = () => {
      const on = Services.prefs.getBoolPref(UNREAD_TINT_PREF, false);
      const has = sss.sheetRegistered(tint, sss.USER_SHEET);
      if (on && !has) {
        sss.loadAndRegisterSheet(tint, sss.USER_SHEET);
      } else if (!on && has) {
        sss.unregisterSheet(tint, sss.USER_SHEET);
      }
    };
    const tintObs = { observe: applyTint };
    Services.prefs.addObserver(UNREAD_TINT_PREF, tintObs);
    applyTint();
    this.restorers.push(() => {
      Services.prefs.removeObserver(UNREAD_TINT_PREF, tintObs);
      if (sss.sheetRegistered(tint, sss.USER_SHEET)) {
        sss.unregisterSheet(tint, sss.USER_SHEET);
      }
    });
    // ::part-Regeln gelten nur aus Author-Stylesheets (siehe parts.css)
    if (Services.prefs.getBoolPref("extensions.mailcards.bundledTheme", true)) {
      const parts = Services.io.newURI(`resource://mailcards/parts.css?v=${extensionVersion}`);
      if (!sss.sheetRegistered(parts, sss.AUTHOR_SHEET)) {
        sss.loadAndRegisterSheet(parts, sss.AUTHOR_SHEET);
      }
      this.restorers.push(() => {
        if (sss.sheetRegistered(parts, sss.AUTHOR_SHEET)) {
          sss.unregisterSheet(parts, sss.AUTHOR_SHEET);
        }
      });
      // Textfläche des Verfassen-Fensters (about:blank?compose) dunkel in der
      // Fläche des Fensters – theme.css gilt dort nicht (siehe compose-body.css)
      const body = Services.io.newURI(`resource://mailcards/compose-body.css?v=${extensionVersion}`);
      if (!sss.sheetRegistered(body, sss.USER_SHEET)) {
        sss.loadAndRegisterSheet(body, sss.USER_SHEET);
      }
      this.restorers.push(() => {
        if (sss.sheetRegistered(body, sss.USER_SHEET)) {
          sss.unregisterSheet(body, sss.USER_SHEET);
        }
      });
    }
    if (!Services.prefs.getBoolPref("extensions.mailcards.appleIcons", true)) {
      return;
    }
    const uri = Services.io.newURI(`resource://mailcards/icon-vars.css?v=${extensionVersion}`);
    if (!sss.sheetRegistered(uri, sss.USER_SHEET)) {
      sss.loadAndRegisterSheet(uri, sss.USER_SHEET);
    }
    this.restorers.push(() => {
      if (sss.sheetRegistered(uri, sss.USER_SHEET)) {
        sss.unregisterSheet(uri, sss.USER_SHEET);
      }
    });
  }

  // Kontextmenü der Nachrichten wie in Apple Mail: Archivieren, Löschen und
  // Spam als normale Zeilen (mit Text) nach „Als neue Nachricht bearbeiten“
  // statt einer Symbolleiste ganz oben. Antworten und Gelesen/Ungelesen gibt
  // es dort schon als eigene Einträge bzw. im Untermenü „Markieren“.
  hookMailContext(doc) {
    hookNewTabMenus(doc, { push: fn => this.addWinRestorer(doc.defaultView, fn) });
    const popup = doc.getElementById("mailContext");
    const group = doc.getElementById("mailContext-navigation");
    if (!popup || !group || popup.__mcList) {
      return;
    }
    popup.__mcList = true;
    group.classList.add("mc-nav-list");
    const sep = doc.getElementById("mailContext-sep-navigation");
    const anchor = doc.getElementById("mailContext-editAsNew")?.nextElementSibling;
    if (anchor?.localName == "menuseparator") {
      anchor.after(group);
      if (sep) {
        group.after(sep);
      }
    }
    // Den Text (Fluent setzt dort nur aria-label) zeigt userChrome.css an.
    // Zeilenmaße wie ein gewöhnlicher Eintrag desselben Menüs übernehmen – die
    // Abstände unterscheiden sich je System (Windows: 3 px statt Thunderbirds
    // --menu-item-padding, „Löschen“ war dort 2 px höher)
    const win = doc.defaultView;
    const match = event => {
      if (event.target != popup) {
        return;
      }
      // ein sichtbarer, gewöhnlicher Eintrag (welche es gibt, hängt von der Mail ab)
      const ref = [...popup.children].find(el => el.localName == "menuitem" && el.parentNode != group &&
        el.getClientRects().length && el.getBoundingClientRect().height > 0);
      if (!ref) {
        return;
      }
      // als Variablen (das Stylesheet hat Vorrang vor Werten am Element)
      const cs = win.getComputedStyle(ref);
      group.style.setProperty("--mc-nav-pad", cs.paddingTop);
      group.style.setProperty("--mc-nav-h", `${ref.getBoundingClientRect().height}px`);
    };
    popup.addEventListener("popupshown", match);
  }

  // Today-Pane in allen Bereichen außer dem Kalender (der zeigt den Tag selbst):
  // Thunderbird kennt sie nur in Mail, Aufgaben, Chat und Termin-Tabs –
  // Adressbuch, Einstellungen und übrige Tabs (Modus „special“) kommen dazu,
  // auch für ihre Teile (Minimonat, Termine, Aufgaben). Nach der
  // Erstinstallation einmal überall eingeblendet; danach gilt die eigene Wahl
  todayPaneEverywhere(w) {
    const d = w.document;
    const panel = d.getElementById("today-pane-panel");
    if (!panel || panel.__mcEverywhere) {
      return;
    }
    panel.__mcEverywhere = true;
    // (der Aufgabenteil unten bleibt außen vor: die Today-Pane zeigt überall nur
    // Minikalender und Termine, wie in der Mail)
    for (const box of [panel, ...panel.querySelectorAll("[mode]")].filter(b => b.id != "todo-tab-panel")) {
      const modes = box.getAttribute("mode").split(",");
      const widths = (box.getAttribute("modewidths") || "").split(",");
      const pairs = modes.map((m, i) => [m, widths[i] || "200"]).filter(([m]) => !(box == panel && m == "calendar"));
      if (modes.includes("mail") && !modes.includes("special")) {
        pairs.push(["special", widths[modes.indexOf("mail")] || "200"]);
      }
      box.setAttribute("mode", pairs.map(([m]) => m).join(","));
      if (box.hasAttribute("modewidths")) {
        box.setAttribute("modewidths", pairs.map(([, v]) => v).join(","));
      }
    }
    const PREF = "extensions.mailcards.todayPaneEverywhere";
    if (this.firstInstall && !Services.prefs.getBoolPref(PREF, false)) {
      panel.setAttribute("collapsedinmodes", ","); // (Thunderbirds Zeichen für „nirgends zu“)
      Services.xulStore.persist(panel, "collapsedinmodes");
      Services.prefs.setBoolPref(PREF, true);
    }
    // Ansicht für den aktuellen Bereich neu bestimmen (Thunderbird tut das sonst
    // erst beim nächsten Bereichswechsel)
    try {
      panel.setVisible(panel.isVisible(w.gCurrentMode), false, true);
    } catch (e) {
      log("today pane modes error", e);
    }
  }

  // Heute-Leiste (Aufgaben/Termine rechts) gehört nicht in den Chat – wie in
  // Apples Nachrichten-App. Einmalig für den Chat-Bereich ausblenden; danach
  // gilt wieder, was man selbst einstellt.
  hideTodayPaneInChatOnce(w) {
    const PREF = "extensions.mailcards.todayPaneChatHidden";
    if (Services.prefs.getBoolPref(PREF, false)) {
      return;
    }
    // neu installiert: Today-Pane überall außer im Kalender (todayPaneEverywhere)
    if (this.firstInstall) {
      Services.prefs.setBoolPref(PREF, true);
      return;
    }
    const pane = w.document.getElementById("today-pane-panel");
    if (!pane) {
      return;
    }
    const modes = new Set((pane.getAttribute("collapsedinmodes") || "").split(",").filter(Boolean));
    modes.add("chat");
    pane.setAttribute("collapsedinmodes", [...modes].join(","));
    Services.xulStore.persist(pane, "collapsedinmodes");
    if (w.gCurrentMode == "chat") {
      w.TodayPane?.setVisible?.(false);
    }
    Services.prefs.setBoolPref(PREF, true);
  }

  // Termin-Details: an den Inhalt anpassen (mindestens 480 px breit, höchstens
  // so groß wie der Bildschirm) und iClouds Platzhalter-Erinnerung ausblenden
  // (Apple legt für Standard-Erinnerungen eine feste vom 1. April 1976 an)
  tidyEventDialog(dlg, tries = 0) {
    try {
      if (dlg.__mcTidy) {
        return;
      }
      const frame = dlg.document.getElementById("calendar-item-panel-iframe")?.contentDocument;
      if ((!frame || frame.readyState != "complete" || !frame.querySelector("label")) && tries < 20) {
        dlg.setTimeout(() => this.tidyEventDialog(dlg, tries + 1), 250);
        return;
      }
      const strip = text => text.replace(/\s*:\s*$/, "").replace(/:\s+$/, "");
      // Fenstertitel „Neuer Termin:“ → „Neuer Termin“ (auch nach Änderungen)
      const fixTitle = () => {
        const t = dlg.document.title;
        const fixed = t.replace(/:\s*$/, "");
        if (fixed != t) {
          dlg.document.title = fixed;
        }
      };
      fixTitle();
      const titleEl = dlg.document.querySelector("title");
      if (titleEl) {
        new dlg.MutationObserver(fixTitle).observe(titleEl, { childList: true, characterData: true, subtree: true });
      }
      const idoc = dlg.document.getElementById("calendar-item-panel-iframe")?.contentDocument;
      if (!idoc) {
        return;
      }
      // Beschriftungen und Reiter ohne Doppelpunkt (Fluent setzt sie neu → beobachten)
      const fixLabels = () => {
        for (const el of idoc.querySelectorAll("label, tab")) {
          const v = el.getAttribute("value");
          if (v && /:\s*$/.test(v)) {
            el.setAttribute("value", strip(v));
          }
          const l = el.getAttribute("label");
          if (l && /:\s*$/.test(l)) {
            el.setAttribute("label", strip(l));
          }
          if (!v && !l && el.childElementCount == 0 && /:\s*$/.test(el.textContent)) {
            el.textContent = strip(el.textContent);
          }
        }
      };
      dlg.__mcTidy = true;
      fixLabels();
      new dlg.MutationObserver(() => dlg.setTimeout(fixLabels, 0)).observe(idoc.documentElement, {
        subtree: true, attributes: true, attributeFilter: ["value", "label"], childList: true, characterData: true,
      });
    } catch (e) {
      log("event dialog tidy error", String(e).slice(0, 120));
    }
  }

  // Beschreibung im Termin-Fenster: Systemschrift 13 px als Benutzer-
  // Stylesheet im Editor-Dokument – kein <style> und kein Inline-Stil, die
  // landeten sonst im gespeicherten Text der Beschreibung
  styleItemDescription(iw, tries = 0) {
    try {
      if (iw.closed || !Services.prefs.getBoolPref("extensions.mailcards.bundledTheme", true)) {
        return;
      }
      const cw = iw.document.getElementById("item-description")?.contentWindow;
      const doc = cw?.document;
      // gleich setzen (ab Thunderbird 160 hängt editorContent.css nicht mehr als
      // <link> im Dokument, auf das bisher gewartet wurde); noch 5 s nachsehen,
      // ob der Editor sein Dokument ersetzt hat, dann dort erneut
      if (doc?.body && !doc.__mcDescSheet) {
        cw.windowUtils.loadSheetUsingURIString(`resource://mailcards/event-description.css?v=${extensionVersion}`, cw.windowUtils.USER_SHEET);
        doc.__mcDescSheet = true;
      }
      if (tries < 20) {
        iw.setTimeout(() => this.styleItemDescription(iw, tries + 1), 250);
      }
    } catch (e) {
      log("item description sheet error", String(e).slice(0, 120));
    }
  }

  // Kalendersymbol wie das App-Symbol von Apple Kalender: Monat klein in Rot,
  // darunter groß der Tag des Termins (bzw. der Aufgabe oder Erinnerung)
  alarmDateIcon(dlg, item) {
    try {
      const doc = dlg.document;
      const ev = item.item, alarm = item.alarm;
      if (!ev) {
        return;
      }
      let date = ev.startDate || ev.entryDate || ev.dueDate || alarm?.alarmDate;
      if (!date) {
        return;
      }
      date = date.getInTimezone(dlg.cal?.dtz?.defaultTimezone || date.timezone);
      const key = `${date.year}-${date.month}-${date.day}`;
      let box = item.querySelector(".mc-alarm-date");
      if (box?.dataset.key == key) {
        return;
      }
      if (!box) {
        const X = "http://www.w3.org/1999/xhtml";
        box = doc.createElementNS(X, "div");
        box.className = "mc-alarm-date";
        box.append(doc.createElementNS(X, "span"), doc.createElementNS(X, "span"));
        box.firstChild.className = "mc-alarm-month";
        box.lastChild.className = "mc-alarm-day";
        const img = item.querySelector(".alarm-calendar-image");
        (img?.parentNode || item).insertBefore(box, img || item.firstChild);
      }
      const js = new Date(date.year, date.month, date.day);
      const locale = Services.locale.appLocaleAsBCP47;
      box.dataset.key = key;
      box.firstChild.textContent = new Intl.DateTimeFormat(locale, { month: "short" }).format(js).replace(/\.$/, "");
      box.lastChild.textContent = String(date.day);
    } catch (e) {
      log("alarm icon error", String(e).slice(0, 120));
    }
  }

  fitAlarmDialog(dlg) {
    try {
      const doc = dlg.document;
      const list = doc.getElementById("alarm-richlist");
      if (!list) {
        return;
      }
      const fit = () => {
        if (dlg.closed) {
          return;
        }
        const items = [...list.children].filter(i => i.getBoundingClientRect().height);
        // wie Apple Kalender: „Alle …“-Knöpfe nur bei mehreren Erinnerungen,
        // Datumssymbol (Monat/Tag) des Termins statt des Liniensymbols
        doc.documentElement.toggleAttribute("mc-alarm-multi", list.children.length > 1);
        for (const item of list.children) {
          this.alarmDateIcon(dlg, item);
        }
        if (!items.length) {
          return;
        }
        // höchstens vier Einträge ohne Scrollen, darüber scrollt die Liste
        const shown = items.slice(0, 4);
        const cs = dlg.getComputedStyle(list);
        let content = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
        for (const item of shown) {
          const ics = dlg.getComputedStyle(item);
          content += item.getBoundingClientRect().height + (parseFloat(ics.marginTop) || 0) + (parseFloat(ics.marginBottom) || 0);
        }
        // Fensterinhalt (Körper) statt Fensterhöhe: ohne Titelleiste ragt er sonst unten hinaus
        const rest = Math.max(doc.body.getBoundingClientRect().height, dlg.innerHeight) - list.getBoundingClientRect().height;
        const inner = Math.ceil(rest + content);
        if (Math.abs(inner - dlg.innerHeight) >= 2) {
          dlg.resizeTo(dlg.outerWidth, dlg.outerHeight - dlg.innerHeight + inner);
        }
      };
      // ohne sichtbare Titelleiste wie eine Mitteilung (macOS zeichnet die
      // Fensterknöpfe weiter; die Fläche oben bleibt zum Verschieben)
      if (Services.appinfo.OS == "Darwin") {
        doc.documentElement.setAttribute("customtitlebar", "true");
        doc.documentElement.setAttribute("chromemargin", "0,-1,-1,-1");
        doc.documentElement.setAttribute("mc-alarm-card", "");
      }
      fit();
      // Einträge kommen hinzu oder werden erledigt
      new dlg.MutationObserver(() => dlg.setTimeout(fit, 50)).observe(list, { childList: true });
      // Texte eines Eintrags kommen erst nach dem Einfügen (Höhe wächst) – nachmessen
      const ro = new dlg.ResizeObserver(() => dlg.setTimeout(fit, 0));
      new dlg.MutationObserver(() => [...list.children].forEach(i => ro.observe(i))).observe(list, { childList: true });
      [...list.children].forEach(i => ro.observe(i));
    } catch (e) {
      log("alarm size error", String(e).slice(0, 120));
    }
  }

  fitSummaryDialog(dlg) {
    try {
      const doc = dlg.document;
      const cell = doc.querySelector(".reminder-details");
      if (cell) {
        const year = /\b1976\b/;
        for (const node of [...cell.childNodes]) {
          if (node.nodeType == 3 && year.test(node.textContent)) {
            if (node.nextSibling?.localName == "br") {
              node.nextSibling.remove();
            }
            node.remove();
          }
        }
        if (cell.lastChild?.localName == "br") {
          cell.lastChild.remove();
        }
      }
      // Titel steht groß im Inhalt – nicht zusätzlich in der Fensterleiste
      if (doc.querySelector(".item-title")?.textContent.trim()) {
        doc.title = " ";
      }
      // Größe anpassen, mittig auf dem Bildschirm wie bei Thunderbird
      const maxW = dlg.screen.availWidth - 40;
      const maxH = dlg.screen.availHeight - 40;
      // Mindestbreite per CSS, damit sizeToContent die Höhe gleich für die
      // endgültige Breite rechnet (vorher ein zweiter Durchgang nach 50 ms)
      // Bildschirmmitte wie Thunderbird selbst (das eigene Fenster hat hier teils noch keine Größe)
      const sc = dlg.screen;
      const cx = sc.availLeft + sc.availWidth / 2, cy = sc.availTop + sc.availHeight / 2;
      doc.documentElement.style.minWidth = `${Math.min(maxW, 480) - (dlg.outerWidth - dlg.innerWidth)}px`;
      dlg.sizeToContent();
      if (dlg.outerWidth > maxW || dlg.outerHeight > maxH) {
        dlg.resizeTo(Math.min(maxW, dlg.outerWidth), Math.min(maxH, dlg.outerHeight));
      }
      dlg.moveTo(Math.round(cx - dlg.outerWidth / 2), Math.round(cy - dlg.outerHeight / 2));
      // danach nicht mehr nachführen: die Beschreibung lädt später, rollt aber in
      // ihrem eigenen Feld – ein Nachführen ließ das schon sichtbare Fenster springen
    } catch (e) {
      log("summary size error", String(e).slice(0, 120));
    }
  }

  // Feedback: neue Mail an die Feedback-Adresse, mit Versionen zum Nachvollziehen
  async sendFeedback() {
    let version = extensionVersion;
    try {
      const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
      version = (await AddonManager.getAddonByID("mail-cards@sebastian.local"))?.version || version;
    } catch {}
    const osVersion = Services.sysinfo.getProperty("version");
    const os = Services.appinfo.OS == "Darwin" ? `macOS (Darwin ${osVersion})`
      : Services.appinfo.OS == "WINNT" ? `Windows (${osVersion})` : `${Services.appinfo.OS} (${osVersion})`;
    const subject = `halo.spaces ${version} – Feedback`;
    const body = `${tr("Hi,")}\n\n\n\n—\n` +
      `halo.spaces ${version} · Thunderbird ${Services.appinfo.version} · ${os}`;
    const params = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(Ci.nsIMsgComposeParams);
    const fields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(Ci.nsIMsgCompFields);
    fields.to = FEEDBACK_ADDRESS;
    fields.subject = subject;
    fields.body = body;
    params.type = Ci.nsIMsgCompType.New;
    params.format = Ci.nsIMsgCompFormat.PlainText;
    params.composeFields = fields;
    MailServices.compose.OpenComposeWindowWithParams(null, params);
  }

  // Beim Start nach einem Update suchen und es gleich installieren – höchstens
  // alle 6 Stunden, und nur wenn automatische Updates erlaubt sind (eigener
  // Schalter, Thunderbirds Einstellung und die des Add-ons im Add-ons-Manager)
  async autoUpdate() {
    try {
      if (!Services.prefs.getBoolPref(AUTO_UPDATE_PREF, true)) {
        return;
      }
      const now = Math.floor(Date.now() / 1000);
      const last = Services.prefs.getIntPref(AUTO_UPDATE_LAST_PREF, 0);
      if (last && now - last < 6 * 3600 && now >= last) {
        return;
      }
      const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
      const addon = await AddonManager.getAddonByID("mail-cards@sebastian.local");
      if (!addon || !AddonManager.updateEnabled) {
        return;
      }
      const mode = addon.applyBackgroundUpdates;
      const allowed = mode == AddonManager.AUTOUPDATE_ENABLE ||
        (mode == AddonManager.AUTOUPDATE_DEFAULT && AddonManager.autoUpdateDefault);
      if (!allowed) {
        return;
      }
      Services.prefs.setIntPref(AUTO_UPDATE_LAST_PREF, now);
      const result = await this.findUpdate();
      if (result.available) {
        log("auto update", extensionVersion, "→", result.version);
        await result.install();
      }
    } catch (e) {
      log("auto update error", e);
    }
  }

  // Update auf Wunsch: dieselbe Prüfung wie Thunderbirds tägliche, nur sofort.
  // Ergebnis: { available, version, install() } | { error } | {} (aktuell)
  async findUpdate() {
    const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
    const addon = await AddonManager.getAddonByID("mail-cards@sebastian.local");
    if (!addon) {
      return { error: true };
    }
    return new Promise(resolve => {
      let found = null;
      addon.findUpdates({
        onUpdateAvailable: (_addon, install) => {
          found = { available: true, version: install.version, install: () => install.install() };
        },
        onUpdateFinished: (_addon, error) => resolve(found || (error ? { error: true } : {})),
      }, AddonManager.UPDATE_WHEN_USER_REQUESTED);
    });
  }

  // Info-Fenster „Halo Spaces“ (Help-Menü): Version, Updates, Feedback, Spenden
  async openHaloWindow(w, { platformNote = false, welcome = false, themeSwitched = false } = {}) {
    const open = [...Services.wm.getEnumerator(null)].find(win => win.location?.href.startsWith("resource://mailcards/about/halo.html"));
    if (open) {
      open.focus();
      return;
    }
    let version = extensionVersion;
    try {
      const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
      version = (await AddonManager.getAddonByID("mail-cards@sebastian.local"))?.version || version;
    } catch {}
    const api = {
      german: Services.locale.appLocaleAsBCP47.startsWith("de"),
      version,
      checkUpdate: () => this.findUpdate(),
      mac: Services.appinfo.OS == "Darwin",
      platformNote,
      welcome,
      themeSwitched,
      openSettings: () => openHaloSettings(w),
      sendFeedback: () => this.sendFeedback(),
      // Begrüßung: Wetter in der Today-Pane gleich einrichten (dieselben Prefs
      // wie die Einstellungsseite); Ergebnis als Zeile: Ort/Temperatur oder Hinweis
      setWeather: async (on, place = "") => {
        Services.prefs.setStringPref(WEATHER_PLACE_PREF, place);
        Services.prefs.setBoolPref(WEATHER_PREF, on);
        if (!on) {
          return { ok: true, text: "" };
        }
        await Weather.refresh(true);
        const st = Weather.state();
        return st.status == "ok"
          ? { ok: true, text: (st.place || tr("Current location")) + (st.temp != null ? ` · ${Math.round(st.temp)} °C` : "") }
          : { ok: false, status: st.status, text: st.status == "denied" ? tr("Location access is off. Allow it in System Settings or enter a city.")
            : st.status == "notfound" ? tr("City not found") : tr("Location unavailable. Enter a city.") };
      },
      // Begrüßung: Ortsvorschläge beim Tippen und gewählter Ort (mit Koordinaten)
      searchPlaces: text => Weather.search(w, text),
      choosePlace: async place => {
        await Weather.choose(place);
        Services.prefs.setBoolPref(WEATHER_PREF, true);
        await Weather.refresh(true);
        const st = Weather.state();
        return st.status == "ok"
          ? { ok: true, text: (st.place || "") + (st.temp != null ? ` · ${Math.round(st.temp)} °C` : "") }
          : { ok: false, text: tr("Location unavailable. Enter a city.") };
      },
      // Begrüßung: fünfter Bereich (dieselben Prefs wie die Einstellungsseite)
      fifthAddons: () => FifthSpace.addonSpaces(Services.wm.getMostRecentWindow("mail:3pane")),
      setFifthSpace: (mode, extra = "") => {
        if (mode == "web") {
          const url = FifthSpace.normalizeURL(extra);
          if (!url) {
            return false;
          }
          Services.prefs.setStringPref(FIFTH_URL_PREF, url);
        } else if (mode == "addon") {
          Services.prefs.setStringPref(FIFTH_ADDON_PREF, extra);
        }
        if (mode == "chat") {
          Services.prefs.clearUserPref(FIFTH_PREF);
        } else {
          Services.prefs.setStringPref(FIFTH_PREF, mode);
        }
        return true;
      },
      // Systemeinstellung der Ortung (macOS, Windows; Linux: kein einheitlicher Ort)
      locationSettingsURL: Services.appinfo.OS == "Darwin" ? "x-apple.systempreferences:com.apple.preference.security?Privacy_LocationServices"
        : Services.appinfo.OS == "WINNT" ? "ms-settings:privacy-location" : null,
      openURL: url => Cc["@mozilla.org/uriloader/external-protocol-service;1"].getService(Ci.nsIExternalProtocolService)
        .loadURI(Services.io.newURI(url), Services.scriptSecurityManager.getSystemPrincipal()),
      // im Standardbrowser öffnen (loadURI braucht seit Thunderbird 140 einen
      // Principal und tat ohne ihn nichts)
      donate: () => {
        const main = Services.wm.getMostRecentWindow("mail:3pane") || w;
        if (typeof main.openLinkExternally == "function") {
          main.openLinkExternally(DONATE_URL);
        } else {
          Cc["@mozilla.org/uriloader/external-protocol-service;1"]
            .getService(Ci.nsIExternalProtocolService)
            .loadURI(Services.io.newURI(DONATE_URL), Services.scriptSecurityManager.getSystemPrincipal());
        }
      },
    };
    const hw = w.openDialog("resource://mailcards/about/halo.html", "halo-spaces",
      `chrome,dialog=yes,centerscreen,resizable=no,width=360,height=${349 + (platformNote ? 64 : 0)}`);
    // erst lädt das Fenster about:blank, dann unsere Seite – darauf warten
    let tries = 0;
    const wire = () => {
      if (hw.closed || tries++ > 100) {
        return;
      }
      const doc = hw.document;
      if (doc?.documentURI?.startsWith("resource://mailcards/about/halo.html") && doc.readyState == "complete" && doc.getElementById("version")) {
        this.wireHaloWindow(hw, api);
      } else {
        w.setTimeout(wire, 30);
      }
    };
    w.setTimeout(wire, 30);
  }

  // Begrüßung, so wenig auf einmal wie möglich (KISS): je Frage erst Ja/Nein;
  // erst nach dem Klick gleiten die Einzelheiten ein, das Fenster wächst sanft
  // mit. Gemeinsamer Aufbau für Wetter und Chat
  welcomeStep(hw, { id, question, yes, no, chosen }) {
    const doc = hw.document;
    const el = (tag, cls, text) => {
      const e = doc.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };
    const box = el("section", "weather");
    box.id = id;
    const head = el("div", "ask");
    head.append(el("p", "q", question));
    const choices = el("div", "choices yesno");
    const yesBtn = el("button", "capsule", tr("Yes"));
    const noBtn = el("button", "capsule", tr("No"));
    choices.append(yesBtn, noBtn);
    head.append(choices);
    // aufklappbarer Teil (Höhe über das Raster, Fenster folgt Bild für Bild)
    const more = el("div", "more");
    const inner = el("div", "more-inner");
    more.append(inner);
    box.append(head, more);
    const fit = () => {
      const body = doc.body, style = hw.getComputedStyle(body);
      const need = Math.ceil([...body.children].filter(e => !e.hidden).reduce((h, e) => Math.max(h, e.getBoundingClientRect().bottom), 0)
        + parseFloat(style.paddingBottom));
      if (Math.abs(need - hw.innerHeight) >= 1) {
        hw.resizeBy(0, need - hw.innerHeight);
      }
    };
    const follow = () => {
      const end = Date.now() + 420;
      const step = () => {
        fit();
        if (Date.now() < end && !hw.closed) {
          hw.requestAnimationFrame(step);
        }
      };
      hw.requestAnimationFrame(step);
    };
    const pick = (group, button) => {
      for (const b of group.children) {
        b.classList.toggle("chosen", b == button);
      }
    };
    const open = show => {
      more.classList.toggle("open", show);
      follow();
    };
    if (chosen) {
      pick(choices, chosen == "yes" ? yesBtn : noBtn);
    }
    yesBtn.addEventListener("click", () => {
      pick(choices, yesBtn);
      yes?.();
    });
    noBtn.addEventListener("click", () => {
      pick(choices, noBtn);
      no?.();
    });
    return { box, inner, el, open, pick, follow };
  }

  // Wetter: Ja → „Mein Standort“ oder „Stadt …“ (Vorschläge beim Tippen); Nein → aus
  wireWelcomeWeather(hw, api) {
    const doc = hw.document;
    const note = doc.getElementById("platform-note");
    if (!note || doc.getElementById("weather")) {
      return;
    }
    let step = null;
    step = this.welcomeStep(hw, {
      id: "weather",
      question: tr("Weather in the Today Pane?"),
      yes: () => step.open(true),
      no: async () => {
        step.open(false);
        await api.setWeather(false);
      },
    });
    const { inner, el, pick, follow } = step;
    const hint = el("p", "small", tr("The symbol next to the title then shows the weather. Asks open-meteo.com about every 30 minutes."));
    const choices = el("div", "choices");
    const here = el("button", "capsule", tr("My Location"));
    const city = el("button", "capsule", tr("City …"));
    choices.append(here, city);
    const cityRow = el("div", "city");
    cityRow.hidden = true;
    const input = el("input");
    input.type = "text";
    input.placeholder = tr("e.g. Vienna");
    input.spellcheck = false;
    cityRow.append(input);
    const list = el("div", "suggest");
    list.hidden = true;
    const status = el("p", "small status");
    const settingsBtn = el("button", "capsule", tr("Open System Settings"));
    settingsBtn.hidden = true;
    inner.append(hint, choices, cityRow, list, status, settingsBtn);
    note.after(step.box);
    const result = r => {
      status.textContent = r.text;
      status.classList.toggle("bad", !r.ok);
      settingsBtn.hidden = !(r.status == "denied" && api.locationSettingsURL);
      if (!r.ok) {
        cityRow.hidden = false;
        pick(choices, city);
      }
      follow();
    };
    here.addEventListener("click", async () => {
      pick(choices, here);
      cityRow.hidden = true;
      list.hidden = true;
      status.textContent = tr("Locating …");
      follow();
      result(await api.setWeather(true, ""));
    });
    city.addEventListener("click", () => {
      pick(choices, city);
      cityRow.hidden = false;
      input.focus();
      follow();
    });
    // Vorschläge beim Tippen; ein Klick übernimmt den Ort samt Koordinaten
    let timer = null, seq = 0;
    input.addEventListener("input", () => {
      hw.clearTimeout(timer);
      const text = input.value.trim();
      if (text.length < 2) {
        list.hidden = true;
        follow();
        return;
      }
      timer = hw.setTimeout(async () => {
        const mine = ++seq;
        const hits = await api.searchPlaces(text);
        if (mine != seq || hw.closed) {
          return;
        }
        list.replaceChildren(...hits.map(p => {
          const b = el("button", "suggestion", p.label);
          b.addEventListener("click", async () => {
            input.value = p.label;
            list.hidden = true;
            status.textContent = tr("Searching …");
            follow();
            result(await api.choosePlace(p));
          });
          return b;
        }));
        list.hidden = !hits.length;
        follow();
      }, 250);
    });
    input.addEventListener("keydown", async e => {
      if (e.key == "Enter" && input.value.trim()) {
        list.hidden = true;
        status.textContent = tr("Searching …");
        follow();
        result(await api.setWeather(true, input.value.trim()));
      }
    });
    settingsBtn.addEventListener("click", () => api.openURL(api.locationSettingsURL));
  }

  // Chat: Ja (vorgewählt, wie bisher) → Chat bleibt; Nein → stattdessen Webseite,
  // Erweiterung (nur wenn eine einen eigenen Bereich mitbringt) oder nichts
  wireWelcomeFifth(hw, api) {
    const doc = hw.document;
    const after = doc.getElementById("weather") || doc.getElementById("platform-note");
    if (!after || doc.getElementById("fifth")) {
      return;
    }
    const addons = api.fifthAddons();
    let step = null, status = null;
    step = this.welcomeStep(hw, {
      id: "fifth",
      question: tr("Do you use Chat?"),
      chosen: "yes",
      yes: () => {
        api.setFifthSpace("chat");
        step.open(false);
      },
      no: () => {
        api.setFifthSpace("none");
        step.pick(choices, nothing);
        webRow.hidden = true;
        status.textContent = "";
        step.open(true);
      },
    });
    const { inner, el, pick, follow } = step;
    const hint = el("p", "small", tr("Instead in its place:"));
    const choices = el("div", "choices");
    const web = el("button", "capsule", tr("Website …"));
    const addon = el("button", "capsule", tr("Add-on"));
    const nothing = el("button", "capsule", tr("Nothing"));
    if (!addons.length) {
      addon.disabled = true;
      addon.title = tr("No add-on with its own space installed");
    }
    choices.append(web, addon, nothing);
    const webRow = el("div", "city");
    webRow.hidden = true;
    const input = el("input");
    input.type = "url";
    input.placeholder = tr("e.g. calendar.example.com");
    input.spellcheck = false;
    const ok = el("button", "capsule", tr("OK"));
    webRow.append(input, ok);
    status = el("p", "small status");
    inner.append(hint, choices, webRow, status);
    after.after(step.box);
    nothing.addEventListener("click", () => {
      pick(choices, nothing);
      webRow.hidden = true;
      status.textContent = "";
      api.setFifthSpace("none");
      follow();
    });
    addon.addEventListener("click", () => {
      pick(choices, addon);
      webRow.hidden = true;
      // die erste Erweiterung mit eigenem Bereich; weitere zur Wahl in den Einstellungen
      api.setFifthSpace("addon", addons[0].name);
      status.textContent = addons[0].title;
      status.classList.remove("bad");
      follow();
    });
    web.addEventListener("click", () => {
      pick(choices, web);
      webRow.hidden = false;
      status.textContent = "";
      input.focus();
      follow();
    });
    const useWeb = () => {
      const fine = api.setFifthSpace("web", input.value);
      status.textContent = fine ? tr("Saved") : tr("Not a valid web address");
      status.classList.toggle("bad", !fine);
      follow();
    };
    ok.addEventListener("click", useWeb);
    input.addEventListener("keydown", e => e.key == "Enter" && useWeb());
  }

  // Texte setzen und Knöpfe verbinden (aus der Erweiterung heraus)
  wireHaloWindow(hw, api) {
    const doc = hw.document;
    const $ = id => doc.getElementById(id);
    doc.documentElement.lang = uiLanguage();
    for (const el of doc.querySelectorAll("[data-l10n-en]")) {
      el.textContent = tr(el.dataset.l10nEn);
    }
    $("version").textContent = `Version ${api.version}`;
    // einmalig nach der Erstinstallation: Begrüßung; Windows/Linux: Hinweis zur Plattform
    const note = $("platform-note");
    const lines = [];
    if (api.welcome) {
      lines.push(tr("Thunderbird now looks calm and tidy."));
      if (api.themeSwitched) {
        lines.push(tr("Light and dark now follow your system."));
      }
    }
    if (api.platformNote) {
      lines.push(tr("halo.spaces is made for macOS. On Windows and Linux it is still being tested. If something looks odd, we'd love a quick note!"));
    }
    if (note && lines.length) {
      note.replaceChildren(...lines.map(text => {
        const p = doc.createElement("span");
        p.className = "line";
        p.textContent = text;
        return p;
      }));
      note.hidden = false;
    }
    if (api.welcome) {
      this.wireWelcomeWeather(hw, api);
      this.wireWelcomeFifth(hw, api);
    }
    if (api.welcome) {
      // Begrüßung: nur „Einstellungen öffnen“ (hervorgehoben) und „Weiter“
      doc.documentElement.classList.add("welcome");
      doc.querySelector("h1").textContent = tr("Welcome to halo.spaces");
      $("settings").querySelector(".label").textContent = tr("Open Settings");
      $("close").hidden = false;
      $("close").addEventListener("click", () => hw.close());
    }

    const button = $("update");
    const label = button.querySelector(".label");
    const status = $("update-status");
    let install = null;
    button.addEventListener("click", async () => {
      if (install) {
        button.disabled = true;
        label.textContent = tr("Installing …");
        try {
          await install();
          label.textContent = tr("Installed. Active in a moment.");
        } catch {
          label.textContent = tr("Installation failed");
          button.disabled = false;
        }
        button.classList.remove("available");
        install = null;
        return;
      }
      button.disabled = true;
      label.textContent = tr("Checking for updates …");
      status.textContent = "";
      const result = await api.checkUpdate();
      button.disabled = false;
      if (result.available) {
        install = result.install;
        button.classList.add("available");
        label.textContent = tr("Install version {v}", { v: result.version });
      } else if (result.error) {
        label.textContent = tr("No connection. Try again.");
      } else {
        label.textContent = tr("halo.spaces is up to date");
        status.textContent = "✓";
      }
    });
    const feedback = event => {
      event.preventDefault();
      api.sendFeedback();
      hw.close();
    };
    $("settings")?.addEventListener("click", () => {
      api.openSettings();
      hw.close();
    });
    $("feedback").addEventListener("click", feedback);
    $("donate").addEventListener("click", () => api.donate());
    // Logo mit Versionsnummer laden (sonst zeigt Thunderbird nach einem
    // Update noch das zwischengespeicherte alte)
    const icon = doc.querySelector(".icon");
    if (icon) {
      icon.src = `icon.svg?v=${api.version}`;
    }
    // Windows/Linux: die feste Höhe passt zu den Schriftmaßen von macOS –
    // mit anderen Systemschriften wäre das Fenster sonst scrollbar.
    // Begrüßung: Höhe genau nach dem Inhalt (Text je nach Sprache)
    if (!api.mac || api.welcome) {
      const body = doc.body, style = hw.getComputedStyle(body);
      const need = api.welcome
        ? Math.ceil([...body.children].filter(e => !e.hidden).reduce((h, e) => Math.max(h, e.getBoundingClientRect().bottom), 0) + parseFloat(style.paddingBottom))
        : doc.documentElement.scrollHeight;
      const extra = need - hw.innerHeight;
      if (extra > 0 || api.welcome) {
        hw.resizeBy(0, extra);
      }
      // Windows mit 125/150 % Zoom: das Fenster landet auf ganzen Gerätepixeln
      // und kann um Bruchteile zu niedrig sein – dann wäre es scrollbar
      for (let i = 0; i < 3 && doc.documentElement.scrollHeight > hw.innerHeight; i++) {
        hw.resizeBy(0, 1);
      }
    }
  }

  stop() {
    for (const timer of ["previewTimer", "fullTimer", "refreshTimer"]) {
      clearTimeout(this[timer]);
      this[timer] = null;
    }
    ExtensionSupport.unregisterWindowListener("mail-cards");
    this.mainWindows.clear();
    for (const restore of this.restorers.splice(0)) {
      try {
        restore();
      } catch {}
    }
    this.windows.clear();
  }

  anyWindow() {
    for (const w of this.windows) {
      if (!w.closed) {
        return w;
      }
      this.windows.delete(w);
    }
    return null;
  }

  // Leseansicht: ganze Konversation als Karten (ConversationCards) über
  // Thunderbirds Anzeige von Einzelmail bzw. Faden-Zusammenfassung
  hookConversation(win) {
    const pane = win.document.getElementById("messagePane");
    if (!pane || pane.__mcConv === HOOK_OWNER || typeof pane.displayMessage != "function") {
      return;
    }
    // (Reste einer älteren Fassung entfernen)
    win.document.getElementById("mcConversation")?.remove();
    pane.__mcConversation?.hide();
    delete pane.displayMessage;
    delete pane.displayMessages;
    pane.__mcConv = HOOK_OWNER;
    const conv = new ConversationCards(win, pane);
    pane.__mcConversation = conv;
    const one = pane.displayMessage, many = pane.displayMessages;
    pane.displayMessage = function (uri) {
      conv.hide();
      if (uri && conv.enabled()) {
        pane.classList.add("mc-conv-pending");
      }
      const result = one.call(this, uri);
      if (uri) {
        conv.show(conv.hdrFromURI(uri));
      }
      return result;
    };
    pane.displayMessages = function (messages = []) {
      conv.hide();
      if (messages.length && win.gDBView?.selection?.count == 1 && conv.enabled()) {
        pane.classList.add("mc-conv-pending");
      }
      const result = many.call(this, messages);
      // ein zugeklappter Faden (eine Zeile ausgewählt): Konversation statt Zusammenfassung
      if (messages.length && win.gDBView?.selection?.count == 1) {
        const newest = [...messages].sort((a, b) => b.date - a.date)[0];
        conv.show(newest, { thread: true });
      }
      return result;
    };
    this.addWinRestorer(win, () => {
      conv.hide();
      delete pane.displayMessage;
      delete pane.displayMessages;
      delete pane.__mcConv;
      delete pane.__mcConversation;
    });
  }

  // Drei-Punkte-Menü über der Mailliste: Ansicht und Layout als eine Auswahl
  // (Kartenansicht, Tabelle klassisch) statt Tabelle/Karten;
  // „Hide Message List Header“ ohne Wirkung (eigener Listenkopf) – ausgeblendet;
  // darunter „Show Contact Photo“ zum Abhaken (nur Kartenansicht)
  hookViewChoice(doc) {
    const popup = doc.getElementById("threadPaneDisplayContext");
    if (!popup || ownedElement(doc, "mcViewChoiceCards")) {
      return;
    }
    const restorers = { push: fn => this.addWinRestorer(doc.defaultView, fn) };
    const tb = [doc.getElementById("threadPaneTableView"), doc.getElementById("threadPaneCardsView")].filter(Boolean);
    const anchor = tb[0];
    if (!anchor) {
      return;
    }
    const items = VIEW_CHOICES.map(([key, label]) => {
      const item = doc.createXULElement("menuitem");
      item.id = "mcViewChoice" + key.charAt(0).toUpperCase() + key.slice(1);
      item.__mcOwner = HOOK_OWNER;
      item.setAttribute("type", "radio");
      item.setAttribute("name", "mcviewchoice");
      item.setAttribute("label", tr(label));
      item.addEventListener("command", () => setViewChoice(key));
      anchor.before(item);
      return [key, item];
    });
    for (const el of tb) {
      el.hidden = true;
    }
    const photoSep = doc.createXULElement("menuseparator");
    photoSep.id = "mcContactPhotoSeparator";
    const photo = doc.createXULElement("menuitem");
    photo.id = "mcContactPhoto";
    photo.setAttribute("type", "checkbox");
    photo.setAttribute("label", tr("Show Contact Photo"));
    photo.addEventListener("command", () => {
      if (Services.prefs.getBoolPref(CONTACT_PHOTOS_PREF, true)) {
        Services.prefs.setBoolPref(CONTACT_PHOTOS_PREF, false);
      } else {
        Services.prefs.clearUserPref(CONTACT_PHOTOS_PREF); // Standard: nichts im Profil speichern
      }
    });
    items.at(-1)[1].after(photoSep, photo);
    const hideItem = popup.querySelector('menuitem[data-l10n-id="thread-pane-header-context-hide"]');
    const sep = doc.getElementById("separatorAfterSortOptions");
    for (const el of [hideItem, sep]) {
      if (el) {
        el.hidden = true;
      }
    }
    const onShowing = event => {
      if (event.target != popup) {
        return;
      }
      const current = viewChoice();
      for (const [key, item] of items) {
        item.toggleAttribute("checked", key == current);
      }
      photo.toggleAttribute("checked", Services.prefs.getBoolPref(CONTACT_PHOTOS_PREF, true));
      photo.disabled = current != "cards";
    };
    popup.addEventListener("popupshowing", onShowing);
    restorers.push(() => {
      popup.removeEventListener("popupshowing", onShowing);
      items.forEach(([, item]) => item.remove());
      photoSep.remove();
      photo.remove();
      for (const el of [...tb, hideItem, sep]) {
        if (el) {
          el.hidden = false;
        }
      }
    });
  }

  // Filter wie in Apple Mail: nur ungelesene Mails bzw. wieder alle – über
  // Thunderbirds Schnellfilter „Ungelesen“, aber ohne dessen Leiste. Der
  // Filter bleibt beim Ordnerwechsel aktiv (wie „Filter beibehalten“), bis
  // man erneut klickt; nach einem Neustart ist er aus
  unreadFilterOn(a3) {
    return !!a3?.quickFilterBar?._filterer?.filterValues?.unread;
  }

  // Thunderbirds Symbolleisten-Knopf „Schnellfilter“ schaltet den
  // Ungelesen-Filter um – er soll ihn auch gedrückt zeigen. Thunderbird leitet
  // das aus der nie sichtbaren Leiste ab und setzt es bei Ordnerwechsel,
  // Auswahl und Tabwechsel selbst, daher jeweils kurz danach noch einmal
  syncQuickFilterToggle(w) {
    const d = w?.document;
    const set = () => {
      const ab = d?.getElementById("tabmail")?.currentAbout3Pane;
      const on = String(!!ab?.document && this.unreadFilterOn(ab));
      for (const b of d?.querySelectorAll('#unifiedToolbarContent button[is="quick-filter-bar-toggle"]') || []) {
        if (b.getAttribute("aria-pressed") != on) {
          b.setAttribute("aria-pressed", on);
        }
      }
    };
    try {
      set();
      w.setTimeout(set, 0);
    } catch {}
  }

  // Senden im Hintergrund: Thunderbird legt die Mail in den Postausgang und
  // sendet sie selbst – aber nur, wenn es beim Start schon einen Postausgang
  // gab (sonst blieb sie liegen). Darum nach jedem Senden kurz nachsehen und
  // den Postausgang selbst leeren, falls Thunderbird nicht schon dabei ist.
  flushOutbox() {
    const observer = {
      observe: () => setTimeout(() => {
        try {
          const sl = Cc["@mozilla.org/messengercompose/sendlater;1"].getService(Ci.nsIMsgSendLater);
          const outbox = MailServices.accounts.localFoldersServer?.rootFolder?.getFolderWithFlags(Ci.nsMsgFolderFlags.Queue);
          if (Services.prefs.getBoolPref("mailnews.sendInBackground", false) && !Services.io.offline &&
              outbox?.getTotalMessages(false) && !sl.sendingMessages) {
            Services.wm.getMostRecentWindow("mail:3pane")?.SendUnsentMessages?.();
          }
        } catch (e) {
          log("flush outbox error", e);
        }
      }, 2000),
    };
    Services.obs.addObserver(observer, "mail:composeSendProgressStop");
    this.restorers.push(() => Services.obs.removeObserver(observer, "mail:composeSendProgressStop"));
  }

  // Senden im Hintergrund: scheitert eine Mail aus dem Postausgang, wie Apple
  // Mail einen Dialog zeigen (Thunderbird nennt den Fehler sonst nur in der
  // Aktivitätsanzeige); „Postausgang zeigen“ öffnet den Ordner im Hauptfenster
  sendErrors() {
    let sendLater;
    try {
      sendLater = Cc["@mozilla.org/messengercompose/sendlater;1"].getService(Ci.nsIMsgSendLater);
    } catch (e) {
      log("send errors error", e);
      return;
    }
    const listener = {
      QueryInterface: ChromeUtils.generateQI(["nsIMsgSendLaterListener"]),
      onStartSending() {},
      onMessageStartSending() {},
      onMessageSendProgress() {},
      onStopSending() {},
      onMessageSendError: (current, hdr, status, message) => {
        this.showSendError(hdr, message).catch(e => log("send error dialog error", e));
      },
    };
    sendLater.addListener(listener);
    this.sendErrorListener = listener;
    this.restorers.push(() => sendLater.removeListener(listener));
  }

  async showSendError(hdr, message) {
    const win = Services.wm.getMostRecentWindow("mail:3pane");
    if (!win) {
      return;
    }
    const subject = hdr?.mime2DecodedSubject || "";
    const detail = [subject && `„${subject}“`, message, tr("The message was kept in the Outbox.")].filter(Boolean).join("\n\n");
    const P = Services.prompt;
    const flags = P.BUTTON_POS_0 * P.BUTTON_TITLE_OK + P.BUTTON_POS_1 * P.BUTTON_TITLE_IS_STRING;
    const result = await P.asyncConfirmEx(win.browsingContext.top, P.MODAL_TYPE_WINDOW,
      tr("The message could not be sent"), detail, flags, null, tr("Show Outbox"), null, null, false);
    if (result.getProperty("buttonNumClicked") != 1) {
      return;
    }
    const outbox = hdr?.folder || MailServices.accounts.localFoldersServer?.rootFolder?.getFolderWithFlags(Ci.nsMsgFolderFlags.Queue);
    if (outbox) {
      win.focus();
      win.document.getElementById("tabmail")?.switchToTab(0);
      win.gTabmail?.currentAbout3Pane?.displayFolder(outbox.URI);
    }
  }

  setUnreadFilter(a3, on) {
    const qfb = a3?.quickFilterBar;
    if (!qfb) {
      return;
    }
    const state = qfb.filterer;
    state.clear();
    if (on) {
      state.setFilterValue("sticky", true, true);
      state.setFilterValue("unread", true);
    }
    qfb.updateSearch();
    const top = a3.browsingContext?.topChromeWindow;
    if (top) {
      this.updateListHeader(top);
    }
  }

  // Archivieren, Löschen, Spam wie in Apple Mail: die gewählten Karten gleiten
  // kurz nach links weg (150 ms), dann führt Thunderbird den Befehl aus. Nur in
  // der Kartenansicht, nicht bei „Bewegung reduzieren“; die Animation endet,
  // sobald Thunderbird die nächste Mail wählt (Zeilen werden wiederverwendet)
  hookCardExit(win) {
    const cc = win.commandController;
    if (!cc || cc.__mcExit) {
      return;
    }
    cc.__mcExit = true;
    const orig = cc.doCommand;
    const EXIT = new Set(["cmd_archive", "cmd_delete", "cmd_shiftDelete", "cmd_deleteMessage", "cmd_markAsJunk"]);
    let busy = false;
    cc.doCommand = function (command, ...args) {
      if (EXIT.has(command) && !busy && motionMs(150) > 1 && this.isCommandEnabled?.(command)) {
        const cards = [...win.document.querySelectorAll('#threadTree tr[is="thread-card"]:is(.selected, [aria-selected="true"]) .card-container')];
        if (cards.length && cards.length <= 20) {
          busy = true;
          const anims = cards.map(c => c.animate(
            [{ transform: "none", opacity: 1 }, { transform: "translateX(-28px)", opacity: 0 }],
            { duration: 150, easing: "ease-in", fill: "forwards" }));
          const stop = () => anims.forEach(a => a.cancel());
          win.setTimeout(() => {
            try {
              orig.call(this, command, ...args);
            } finally {
              busy = false;
              win.addEventListener("select", () => win.setTimeout(stop, 0), { once: true, capture: true });
              win.setTimeout(stop, 800);
            }
          }, 150);
          return undefined;
        }
      }
      return orig.call(this, command, ...args);
    };
    this.addWinRestorer(win, () => {
      cc.doCommand = orig;
      delete cc.__mcExit;
    });
  }

  // Neue Mails gleiten oben in die Kartenliste ein, eine geänderte
  // Ungelesen-Zahl in der Ordnerliste „hüpft“ kurz (wie Apple Mail). Beides nur
  // für sichtbare Elemente und nicht bei „Bewegung reduzieren“
  hookArrivals(win) {
    const doc = win.document;
    const tree = doc.getElementById("folderTree");
    if (!tree || tree.__mcArrivals) {
      return;
    }
    tree.__mcArrivals = true;
    const pop = el => el.animate([{ transform: "scale(1.25)" }, { transform: "none" }], { duration: 220, easing: "ease-out" });
    const mo = new win.MutationObserver(records => {
      if (motionMs(220) <= 1) {
        return;
      }
      const seen = new Set();
      for (const rec of records) {
        const badge = rec.target.nodeType == 1 ? rec.target.closest?.(".unread-count") : rec.target.parentElement?.closest(".unread-count");
        if (badge && !seen.has(badge) && badge.getClientRects().length && /\d/.test(badge.textContent)) {
          seen.add(badge);
          pop(badge);
        }
      }
    });
    mo.observe(tree, { subtree: true, characterData: true, childList: true });
    const listener = {
      msgAdded: hdr => {
        if (hdr.folder != win.gFolder || motionMs(250) <= 1) {
          return;
        }
        win.setTimeout(() => {
          try {
            const i = win.gDBView?.findIndexOfMsgHdr(hdr, false);
            const row = i >= 0 ? win.threadTree?.getRowAtIndex?.(i) : null;
            row?.querySelector(".card-container")?.animate(
              [{ opacity: 0, transform: "translateY(-12px)" }, { opacity: 1, transform: "none" }],
              { duration: 250, easing: "ease-out" });
          } catch {}
        }, 60);
      },
    };
    MailServices.mfn.addListener(listener, MailServices.mfn.msgAdded);
    this.addWinRestorer(win, () => {
      mo.disconnect();
      MailServices.mfn.removeListener(listener);
      delete tree.__mcArrivals;
    });
  }

  // Schnellfilter-Leiste nie zeigen: Thunderbirds Befehle dafür (Knopf in
  // der Symbolleiste, Menü, ⇧⌘K) schalten stattdessen den Filter um bzw.
  // setzen den Cursor ins Suchfeld; „Zurücksetzen“ (z. B. beim Springen zu
  // einer ausgefilterten Mail) hebt den Filter auf
  hookUnreadFilter(win) {
    const qfb = win.quickFilterBar;
    const cc = win.commandController;
    if (!qfb || !cc || qfb.__mcUnread) {
      return;
    }
    qfb.__mcUnread = true;
    const origShow = qfb._showFilterBar;
    qfb._showFilterBar = function (show, init) {
      if (show && !init) {
        return undefined;
      }
      return origShow.call(this, false, init);
    };
    // war die Leiste schon offen (gemerkt vom letzten Start): schließen
    if (qfb._filterer?.visible) {
      origShow.call(qfb, false, true);
    }
    const ours = {
      cmd_toggleQuickFilterBar: () => this.setUnreadFilter(win, !this.unreadFilterOn(win)),
      cmd_showQuickFilterBar: () => win.browsingContext?.topChromeWindow?.QuickSearchFocus?.(),
      cmd_resetQuickFilterBar: () => this.setUnreadFilter(win, false),
    };
    // Thunderbird meldet die Befehle erst nach dem Laden der Leiste an –
    // auch dann gelten unsere
    const saved = {};
    const origRegister = cc.registerCallback;
    cc.registerCallback = function (name, callback, isEnabled) {
      if (name in ours) {
        saved[name] = [callback, isEnabled];
        return origRegister.call(this, name, ours[name]);
      }
      return origRegister.call(this, name, callback, isEnabled);
    };
    for (const name of Object.keys(ours)) {
      if (name in cc._callbackCommands) {
        saved[name] = [cc._callbackCommands[name], cc._isCallbackEnabled[name]];
      }
      origRegister.call(cc, name, ours[name]);
    }
    for (const name of ["cmd_showQuickFilterBar", "cmd_toggleQuickFilterBar"]) {
      win.top?.goUpdateCommand?.(name);
    }
    const TOGGLE_EVENTS = ["folderURIChanged", "select", "qfbtoggle"];
    const syncToggle = () => this.syncQuickFilterToggle(win.browsingContext?.topChromeWindow);
    for (const type of TOGGLE_EVENTS) {
      win.addEventListener(type, syncToggle);
    }
    this.addWinRestorer(win, () => {
      for (const type of TOGGLE_EVENTS) {
        win.removeEventListener(type, syncToggle);
      }
      if (this.unreadFilterOn(win)) {
        this.setUnreadFilter(win, false);
      }
      cc.registerCallback = origRegister;
      for (const name of Object.keys(ours)) {
        if (saved[name]) {
          origRegister.call(cc, name, ...saved[name]);
        } else {
          delete cc._callbackCommands[name];
          delete cc._isCallbackEnabled[name];
        }
      }
      qfb._showFilterBar = origShow;
      delete qfb.__mcUnread;
    });
  }

  patch(win, attempt) {
    // Merkmal an der Seite selbst: lädt Thunderbird die Mailansicht neu, bleibt
    // das Fensterobjekt dasselbe, die Seite (und ihre Karten) aber ist neu
    if (win.closed || (this.windows.has(win) && win.document?.__mcPatched)) {
      return;
    }
    const Card = win.customElements?.get("thread-card");
    if (!Card || !win.threadPane || !win.threadTree) {
      if (attempt < 100) {
        win.setTimeout(() => this.patch(win, attempt + 1), 200);
      } else {
        log("patch gave up", { card: !!Card, threadPane: !!win.threadPane, threadTree: !!win.threadTree });
      }
      return;
    }
    this.windows.add(win);
    const doc = win.document;
    doc.__mcPatched = true;
    // Nebenschritte einzeln absichern: ein Fehler darin darf das Einrichten
    // der Karten nicht abbrechen (sonst fehlen Bilder, Vorschau und Knöpfe)
    const safely = (name, fn) => {
      try {
        fn();
      } catch (e) {
        log("patch step error", name, e);
      }
    };
    safely("mail context", () => this.hookMailContext(doc));
    safely("dialog box", () => shareDialogBox(win, { push: fn => this.addWinRestorer(win, fn) }));
    safely("view choice", () => this.hookViewChoice(doc));
    safely("unread filter", () => this.hookUnreadFilter(win));
    safely("card exit", () => this.hookCardExit(win));
    safely("remind menu", () => Remind.hookMenu(win.document));
    safely("follow up", () => FollowUp.hook(win));
    safely("arrivals", () => this.hookArrivals(win));
    safely("star button", () => {
      // Stern-Knopf der Symbolleiste folgt der Auswahl („select“ der
      // Mailliste steigt nicht auf – darum in der Capture-Phase)
      const onSelect = () => this.updateStarButton(win.browsingContext?.topChromeWindow);
      for (const type of ["select", "folderURIChanged"]) {
        win.addEventListener(type, onSelect, true);
      }
      this.addWinRestorer(win, () => {
        for (const type of ["select", "folderURIChanged"]) {
          win.removeEventListener(type, onSelect, true);
        }
      });
    });
    safely("conversation", () => this.hookConversation(win));
    safely("scroll watch", () => {
      const onScroll = () => (this.lastListScroll = Date.now());
      win.threadTree.addEventListener("scroll", onScroll, { passive: true, capture: true });
      this.addWinRestorer(win, () => win.threadTree?.removeEventListener("scroll", onScroll, { capture: true }));
    });
    safely("account rows", () => colorAccountRows(doc, this.restorers));
    safely("search pause", () => this.hookSearchPause(win));
    safely("search stages", () => this.hookSearchStages(win));
    const mb = win.messageBrowser?.contentDocument;
    if (mb?.readyState == "complete") {
      safely("message context", () => this.hookMailContext(mb));
      safely("message header", () => this.hookHeaderAvatar(mb));
    }
    const threadPane = win.threadPane;

    // Die echten Thunderbird-Funktionen am Fenster merken. So überschreibt
    // eine neue Version beim Aktualisieren nie die Hülle der alten, und die
    // alte stellt beim Beenden nichts zurück, was ihr nicht mehr gehört.
    const reg = (win.__mailCards ??= {
      fill: Card.prototype.fillRow,
      density: threadPane.densityChange,
      owner: null,
    });
    const TableRow = win.customElements.get("thread-row");
    reg.rowFill ??= TableRow?.prototype.fillRow;
    const token = (this.token ??= Symbol("mail-cards"));
    reg.owner = token;

    doc.getElementById(STYLE_ID)?.remove();
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = this.cardStyle();
    doc.head.appendChild(style);

    const enhancer = this;
    let decorateErrors = 0;
    const fill = function () {
      reg.fill.call(this);
      try {
        enhancer.decorate(win, this);
      } catch (e) {
        if (decorateErrors++ < 5) {
          log("decorate error", e);
        }
      }
    };
    Card.prototype.fillRow = fill;

    const density = async function (...args) {
      await reg.density.apply(this, args);
      // bei jedem Aufruf neu: die Zeilenzahl lässt sich im Betrieb ändern
      const extra = enhancer.previewLines ? enhancer.previewLines * 16 + 10 : 0;
      Card.ROW_HEIGHT = Math.max(Card.ROW_HEIGHT + extra, 52);
      this.mcCardHeight = Card.ROW_HEIGHT; // Kontaktkarten im Adressbuch gleich hoch
      // Tabellenansicht: 14-px-Schrift (userChrome.css) braucht luftigere Zeilen
      const Row = win.customElements.get("thread-row");
      if (Row) {
        Row.ROW_HEIGHT = Math.max(Row.ROW_HEIGHT, 28);
      }
    };
    threadPane.densityChange = density;

    // Tabellenansicht: jede zweite Zeile leicht getönt (data-mc-odd nach der
    // echten Listenposition – die Zeilen werden beim Scrollen wiederverwendet)
    if (TableRow && reg.rowFill) {
      TableRow.prototype.fillRow = function (...args) {
        const result = reg.rowFill.apply(this, args);
        // als Attribut – Thunderbird setzt die Klassen der Zeile neu
        this.toggleAttribute("data-mc-odd", this._index % 2 == 1);
        return result;
      };
    }

    this.restorers.push(() => {
      if (reg.owner !== token) {
        return; // eine neuere Version hat übernommen
      }
      Card.prototype.fillRow = reg.fill;
      if (TableRow && reg.rowFill) {
        TableRow.prototype.fillRow = reg.rowFill;
      }
      threadPane.densityChange = reg.density;
      delete win.__mailCards;
      style.remove();
      for (const el of doc.querySelectorAll(".mc-avatar, .mc-preview")) {
        el.remove();
      }
      threadPane.updateThreadItemSize();
    });

    this.trackToolbarOffset(win);
    this.decorateFolders(win);
    this.hookFolderEvents(win);

    win.addEventListener("unload", () => this.windows.delete(win), {
      once: true,
    });
    threadPane.updateThreadItemSize();
    log("patched about:3pane", { attempt, rows: win.threadTree?.view?.rowCount ?? null, folder: win.gFolder?.URI || null });
  }

  // Kopfzeile über der Mailliste aktuell halten: bei Ordnerwechsel und wenn
  // sich die Anzahl ändert (auch wenn Thunderbirds eigene Kopfzeile aus ist)
  hookFolderEvents(win) {
    const top = win.browsingContext?.topChromeWindow;
    const tph = win.threadPaneHeader;
    if (!top || !tph || tph.__mcHooked) {
      return;
    }
    const self = this;
    const update = () => win.setTimeout(() => self.updateListHeader(top), 0);
    const origSelected = tph.onFolderSelected;
    const origCount = tph.updateMessageCount;
    tph.onFolderSelected = function (...args) {
      update();
      return origSelected.apply(this, args);
    };
    tph.updateMessageCount = function (...args) {
      update();
      return origCount.apply(this, args);
    };
    tph.__mcHooked = true;
    win.addEventListener("folderURIChanged", update);
    // anderen Ordner gewählt, während gesucht wurde: wie Apple Mail dort
    // weitersuchen (Sammelordner: wieder in allen Postfächern)
    const leave = () => {
      if (self.mailSearchTerm && win.gFolder && !self.isSearchFolder(win.gFolder)) {
        self.searchPrevURI = win.gFolder.URI;
        self.mailSearch(top, self.mailSearchTerm);
      }
      top.__mcSearchPlaceholder?.();
    };
    win.addEventListener("folderURIChanged", leave);
    this.restorers.push(() => win.removeEventListener("folderURIChanged", leave));
    this.restorers.push(() => {
      tph.onFolderSelected = origSelected;
      tph.updateMessageCount = origCount;
      delete tph.__mcHooked;
      win.removeEventListener("folderURIChanged", update);
    });
    update();
  }

  // Ordnerliste wie Apple Mail: oben „Favourites“ mit All Inboxes und All
  // Sent, darunter „On My Mac“ und je Konto alle Ordner – mit einheitlichen
  // Namen, Apple-Reihenfolge und ohne Gmails Zwischenebene „[Gmail]“.
  // Einmalig wie Apple Mail: „Sammelordner“ (Alle Eingänge, Alle
  // gesendeten …) oben in der Ordnerliste einschalten. Wer sie danach wieder
  // abschaltet, behält das so.
  enableUnifiedOnce(win, tries = 0) {
    const PREF = "extensions.mailcards.unifiedApplied";
    if (Services.prefs.getBoolPref(PREF, false)) {
      return;
    }
    const pane = win.folderPane;
    if (!pane?.isInitialized) {
      if (tries < 40 && !win.closed) {
        win.setTimeout(() => this.enableUnifiedOnce(win, tries + 1), 500);
      }
      return;
    }
    try {
      const modes = pane.activeModes;
      if (!modes.includes("smart")) {
        pane.activeModes = ["smart", ...modes];
      }
      Services.prefs.setBoolPref(PREF, true);
    } catch (e) {
      log("unified folders error", e);
    }
  }

  decorateFolders(win) {
    const doc = win.document;
    const tree = doc.getElementById("folderTree");
    if (!tree) {
      return;
    }
    this.enableUnifiedOnce(win);
    const L = appleLabels();
    const ORDER = FOLDER_ORDER;
    const roleOf = folderRole;
    const setText = (el, text) => {
      if (el && text && !L.native && el.textContent != text) {
        el.textContent = text;
      }
    };
    const setAttr = (el, name, on) => {
      if (on && !el.hasAttribute(name)) {
        el.setAttribute(name, "");
      } else if (!on && el.hasAttribute(name)) {
        el.removeAttribute(name);
      }
    };

    const localIsEmpty = () => {
      try {
        return this.localIsEmpty(MailServices.accounts.localFoldersServer?.rootFolder);
      } catch {
        return false;
      }
    };
    const apply = () => {
      // Favoriten nur straffen, wenn darunter auch „Alle Ordner“ angezeigt
      // wird – sonst wären die übrigen Ordner gar nicht erreichbar
      const allShown = !!tree.querySelector(':scope > li[data-mode="all"]');
      if (!L.native) {
        for (const header of tree.querySelectorAll(':scope > li[data-mode="smart"] > .mode-container .mode-name')) {
          header.removeAttribute("data-l10n-id");
          setText(header, L.favourites);
        }
      }
      const hideLocal = localIsEmpty();
      for (const li of tree.querySelectorAll('li[is="folder-tree-row"]')) {
        const modeLi = li.closest("li[data-mode]");
        const mode = modeLi?.dataset.mode;
        let folder = null;
        try {
          folder = MailServices.folderLookup.getFolderForURL(li.uri);
        } catch {}
        const label = li.querySelector(":scope > .container .name");
        const topLevel = li.parentElement?.parentElement === modeLi;
        // der Suchordner ist nur Mittel zum Zweck – nie in der Ordnerliste
        if (this.isSearchFolder(folder)) {
          setAttr(li, "data-mc-hide", true);
          continue;
        }

        if (mode == "smart") {
          if (li.hasAttribute("data-server-type")) {
            setAttr(li, "data-mc-hide", allShown); // Konto-Abschnitte gibt es unten schon
            continue;
          }
          if (topLevel) {
            const type = li.dataset.folderType;
            setAttr(li, "data-mc-hide", allShown && type != "inbox" && type != "sent");
            if (type == "inbox") setText(label, L.allInboxes);
            if (type == "sent") setText(label, L.allSent);
          } else {
            // nur das Postfach je Konto direkt unter „Alle Eingänge“/„Alle
            // gesendeten“ heißt wie das Konto – tiefere Zeilen (Unterordner)
            // und Ordner unter den Kontozeilen behalten ihren eigenen Namen
            const parentRow = li.parentElement?.closest("li");
            if (folder?.server && parentRow?.parentElement?.parentElement === modeLi &&
                !parentRow.hasAttribute("data-server-type")) {
              setText(label, folder.server.prettyName); // „Google“, „iCloud“
            }
          }
          continue;
        }

        if (mode != "all") {
          continue;
        }
        if (li.hasAttribute("data-server-type")) {
          if (li.dataset.serverType == "none") {
            setText(label, L.onMyMac);
            li.querySelectorAll(':scope > ul > li').forEach(c => setAttr(c, "data-mc-hide", hideLocal));
          }
          continue;
        }
        // Gmails Zwischenordner „[Gmail]“ auflösen
        const isGmailContainer = folder && !roleOf(folder) && folder.parent?.isServer &&
          /^\[(Gmail|Google Mail)\]$/.test(folder.name);
        setAttr(li, "data-mc-flatten", isGmailContainer);
        if (isGmailContainer) {
          li.querySelector(":scope > ul")?.style.setProperty("--depth", "1");
          continue;
        }
        // Gmail wie Apple Mail: „Markiert“ (Starred) und „Notes“ ausblenden,
        // „Wichtig“ (Important) gleich unter den Posteingang
        // Gmail an der Ordneradresse erkennen (server.hostName ist hier leer)
        const gmail = /^imap:\/\/[^/]*@?imap\.(gmail|googlemail)\.com\//i.test(li.uri || "");
        const directChild = folder?.parent && (folder.parent.isServer || /^\[(Gmail|Google Mail)\]$/.test(folder.parent.name));
        if (gmail && directChild && !roleOf(folder)) {
          if (/^(Markiert|Mit Stern|Starred|Notes|Notizen)$/i.test(folder.name)) {
            setAttr(li, "data-mc-hide", true);
            continue;
          }
          if (/^(Wichtig|Important)$/i.test(folder.name)) {
            li.style.order = "1";
            continue;
          }
        }
        const role = roleOf(folder);
        if (role && folder.parent && (folder.parent.isServer || /^\[(Gmail|Google Mail)\]$/.test(folder.parent.name))) {
          setText(label, L[role]);
          li.style.order = String(ORDER[role]);
        } else if (topLevel === false && (folder?.parent?.isServer || /^\[(Gmail|Google Mail)\]$/.test(folder?.parent?.name || ""))) {
          li.style.order = "10"; // eigene Ordner nach den Standardordnern
        }
      }
    };

    let pending = false;
    const observer = new win.MutationObserver(() => {
      if (pending) {
        return;
      }
      pending = true;
      win.requestAnimationFrame(() => {
        pending = false;
        observer.disconnect();
        try {
          apply();
        } catch (e) {
          log("decorateFolders error", e);
        }
        observer.observe(tree, { childList: true, subtree: true, characterData: true });
      });
    });
    try {
      apply();
    } catch (e) {
      log("decorateFolders error", e);
    }
    observer.observe(tree, { childList: true, subtree: true, characterData: true });
    this.restorers.push(() => {
      observer.disconnect();
      for (const li of tree.querySelectorAll("[data-mc-hide], [data-mc-flatten]")) {
        li.removeAttribute("data-mc-hide");
        li.removeAttribute("data-mc-flatten");
      }
      // Namen, Reihenfolge und Einrückung direkt zurücksetzen (activeModes neu
      // zuweisen baut nichts neu auf, solange die Modi gleich bleiben)
      for (const li of tree.querySelectorAll('li[is="folder-tree-row"]')) {
        li.style.removeProperty("order");
        if (li.childList && li.depth) {
          li.childList.style.setProperty("--depth", li.depth);
        }
        try {
          li._setName?.();
        } catch {}
      }
      for (const header of tree.querySelectorAll(":scope > li[data-mode] > .mode-container .mode-name")) {
        doc.l10n?.setAttributes(header, `folder-pane-mode-header-${header.closest("li[data-mode]").dataset.mode}`);
      }
    });
  }

  // Stylesheet der Kartenansicht samt Höhe der Vorschau
  cardStyle() {
    return CSS +
      `#threadTree tr[is="thread-card"] .mc-preview { -webkit-line-clamp: ${this.previewLines}; min-height: ${this.previewLines * 16}px; }` +
      // ohne Kontaktfoto wie Apple Mail: Text direkt neben dem Ungelesen-Punkt,
      // Punkt bzw. Pfeil auf Höhe der Absenderzeile statt auf der Bildmitte
      (this.contactPhotos ? "" : `
#threadTree tr[is="thread-card"] .card-container { grid-template-columns: 16px minmax(0, 1fr) !important; }
#threadTree tr[is="thread-card"] .mc-avatar { display: none !important; }
#threadTree { --mc-status-top: 7px; }`);
  }

  // Kontaktfoto ein-/ausgeschaltet: Stil in allen Mailansichten sofort tauschen
  applyContactPhotos() {
    const on = Services.prefs.getBoolPref(CONTACT_PHOTOS_PREF, true);
    if (on == this.contactPhotos) {
      return;
    }
    this.contactPhotos = on;
    for (const win of this.windows) {
      const style = win.document?.getElementById(STYLE_ID);
      if (style) {
        style.textContent = this.cardStyle();
      }
    }
  }

  // Vorschauzeilen geändert (Menü Ansicht): Stil, Kartenhöhe und Karten in
  // allen Mailansichten sofort anpassen; 0 = Vorschau ganz entfernen
  applyPreviewLines() {
    const lines = Math.max(0, Math.min(4, Services.prefs.getIntPref(PREVIEW_PREF, 1)));
    if (lines == this.previewLines) {
      return;
    }
    this.previewLines = lines;
    // wie beim Start: Karten mit Vorschau zeigen Absender und Betreff in zwei Zeilen
    if (lines && !Services.prefs.getBoolPref("extensions.mailcards.rowcountApplied", false)) {
      Services.prefs.setIntPref("mail.threadpane.cardsview.rowcount", 2);
      Services.prefs.setBoolPref("extensions.mailcards.rowcountApplied", true);
    }
    for (const win of this.windows) {
      try {
        const doc = win.document;
        const style = doc.getElementById(STYLE_ID);
        if (style) {
          style.textContent = this.cardStyle();
        }
        if (!lines) {
          for (const el of doc.querySelectorAll(".mc-preview")) {
            el.remove();
          }
        }
        // berechnet die Kartenhöhe neu und baut die Zeilen neu auf (decorate)
        win.threadPane?.updateThreadItemSize();
      } catch (e) {
        log("preview lines error", e);
      }
    }
  }

  decorate(win, row) {
    const doc = win.document;
    const container = row.querySelector(".card-container");
    row.removeAttribute("data-mc-dup"); // Zeilen werden wiederverwendet
    if (!container) {
      return;
    }
    let avatar = container.querySelector(":scope > .mc-avatar");
    if (!avatar) {
      avatar = doc.createElement("div");
      avatar.className = "mc-avatar";
      container.insertBefore(avatar, container.children[1] || null);
    }
    let preview = row.querySelector(".mc-preview");
    if (!preview && this.previewLines) {
      preview = doc.createElement("div");
      preview.className = "mc-preview";
      row.querySelector(".thread-card-dynamic-row")?.after(preview);
    }

    if ((row.dataset.properties || "").split(" ").includes("dummy")) {
      return;
    }

    const hdr = this.hdrForRow(row);
    if (!hdr) {
      return;
    }
    if (this.isDuplicateRow(row)) {
      row.setAttribute("data-mc-dup", "");
      return;
    }

    if (preview) {
      const text = cleanPreview(hdr.getStringProperty("preview"));
      preview.textContent = text;
      if (!text) {
        this.requestPreview(win, hdr);
      }
    }

    const outgoing = this.isOutgoingView(win, row);
    this.fillAvatar(avatar, hdr, outgoing);
    this.fillSender(row, hdr, outgoing);
    const dateEl = row.querySelector(".thread-card-row .date");
    if (dateEl && hdr.date) {
      dateEl.textContent = appleListDate(hdr.date / 1000);
    }
    this.markSearchHits(win, row);
  }

  // Zeigt die Karte Empfänger statt Absender? Wie Thunderbird: in Ordnern für
  // Ausgehendes, ohne Ordner (Suchergebnisse) je Mail
  isOutgoingView(win, row) {
    try {
      if (win.gFolder) {
        const F = Ci.nsMsgFolderFlags;
        return win.gFolder.isSpecialFolder(F.SentMail | F.Drafts | F.Queue | F.Templates, true);
      }
    } catch {}
    return (row.dataset.properties || "").split(" ").includes("outgoing");
  }

  // Zugeklappte Konversation: Bild, Vorschau und Datum stammen von der neuesten
  // Mail (hdrForRow) – dann auch der Name, sonst stünde dort der Absender der
  // ersten Mail neben dem Bild eines anderen. Sonst schreibt Thunderbird den
  // Namen; zeigt es Adressen (Person nicht im Adressbuch, „Anna <anna@…>“ oder
  // nur die Adresse), stehen wie in Apple Mail nur die Namen da – ohne Namen
  // der aus der Domain („rueckgabe@amazon.de“ → „Amazon“). Die Adressen bleiben
  // im Tooltip. Gilt ebenso für die Empfänger in Gesendet, Entwürfen …
  fillSender(row, hdr, outgoing = false) {
    const el = row.querySelector(".thread-card-row .sender");
    if (!el) {
      return;
    }
    let own = null;
    try {
      own = row.view.getMsgHdrAt(row._index);
    } catch {}
    const persons = personsFor(hdr, outgoing);
    const label = persons.map(p => senderLabel(p.name, p.email)).filter(Boolean).join(", ");
    if (own && own != hdr && (own.messageKey != hdr.messageKey || own.folder?.URI != hdr.folder?.URI)) {
      if (label && el.textContent != label) {
        el.textContent = label;
        el.title = label;
      }
      return;
    }
    const text = el.textContent.toLowerCase();
    if (!label || !persons.some(p => p.email && text.includes(p.email))) {
      return;
    }
    if (label != el.textContent) {
      el.textContent = label;
    }
  }

  // Suchtreffer in Absender, Betreff und Vorschau gelb markieren – nur in der
  // Suche (Zeilen werden wiederverwendet: sonst alte Markierungen entfernen)
  markSearchHits(win, row) {
    const term = this.isSearchFolder(win.gFolder) ? this.mailSearchTerm : "";
    for (const el of [row.querySelector(".sender"), row.querySelector(".subject"), row.querySelector(".mc-preview")]) {
      if (el && (term || el.querySelector("mark.mc-hit"))) {
        markHits(el, term);
      }
    }
  }

  // Lokale Ordner nur zusammenklappen, wenn darin nichts Eigenes liegt
  // (nur leere Standardordner) – POP3-Konten mit globalem Posteingang,
  // Archive oder Filterziele dort bleiben sichtbar. Der eigene Suchordner
  // zählt nicht – er behält nach einer Suche die Trefferzahl; gespeicherte
  // Suchen des Nutzers zählen weiter
  localIsEmpty(root) {
    return !root || root.subFolders.every(f => this.isSearchFolder(f) || (!f.hasSubFolders && f.getTotalMessages(false) == 0));
  }

  isSearchFolder(folder) {
    try {
      return !!folder && folder.name == SEARCH_FOLDER_NAME && folder.getFlag(Ci.nsMsgFolderFlags.Virtual) &&
        folder.parent?.isServer && folder.server == MailServices.accounts.localFoldersServer;
    } catch {
      return false;
    }
  }

  // versteckter Suchordner unter „Lokale Ordner“ (nur bei Bedarf angelegt)
  searchFolder(create = false) {
    let root = null;
    try {
      root = MailServices.accounts.localFoldersServer?.rootFolder;
    } catch {}
    if (!root) {
      return null;
    }
    const existing = root.subFolders.find(f => this.isSearchFolder(f));
    if (existing || !create) {
      return existing || null;
    }
    const { VirtualFolderHelper } = ChromeUtils.importESModule("resource:///modules/VirtualFolderWrapper.sys.mjs");
    return VirtualFolderHelper.createNewVirtualFolder(SEARCH_FOLDER_NAME, root, this.searchScope(), [], false).virtualFolder;
  }

  // Suchbereich wie Apple Mail: Sammelordner (Alle Eingänge …) und ohne
  // gewählten Ordner alle Postfächer aller Konten – ohne Papierkorb, Spam und
  // Suchordner; ein Konto: dessen Ordner; sonst nur der gewählte Ordner (auch
  // Papierkorb oder Spam, wenn genau der gewählt ist)
  searchScope(base = null) {
    const F = Ci.nsMsgFolderFlags;
    const all = MailServices.accounts.allFolders.filter(f =>
      !f.isServer && !(f.flags & (F.Virtual | F.Trash | F.Junk | F.ImapNoselect)));
    if (!base || this.isUnifiedFolder(base)) {
      return all;
    }
    if (base.isServer) {
      return all.filter(f => f.server == base.server);
    }
    return [base];
  }

  // Sammelordner („Alle Eingänge“ …, gespeicherte Suchen) – dort global suchen
  isUnifiedFolder(folder) {
    try {
      return !folder || folder.getFlag(Ci.nsMsgFolderFlags.Virtual) || /\/smart%20mailboxes(\/|$)/i.test(folder.URI);
    } catch {
      return true;
    }
  }

  // Ordner, in dem gesucht wird (während der Suche: der Ordner davor)
  searchBase(a3) {
    let base = a3?.gFolder;
    if (this.isSearchFolder(base)) {
      try {
        base = this.searchPrevURI ? MailServices.folderLookup.getFolderForURL(this.searchPrevURI) : null;
      } catch {
        base = null;
      }
    }
    return base;
  }

  // Begriff in Betreff, Absender, Empfänger oder Text – oder, wenn er wie ein
  // Datum aussieht („12.10“), Mails von diesem Tag; ohne body nur die
  // Kopfzeilen (stehen in der Ordner-Datenbank, der Text muss je Mail von der
  // Platte gelesen werden)
  searchTerms(session, text, body = true) {
    const A = Ci.nsMsgSearchAttrib;
    const O = Ci.nsMsgSearchOp;
    const terms = [];
    const add = (attrib, op, fill) => {
      const term = session.createTerm();
      term.attrib = attrib;
      term.op = op;
      const value = term.value;
      value.attrib = attrib;
      fill(value);
      term.value = value;
      term.booleanAnd = false;
      terms.push(term);
    };
    for (const attrib of body ? [A.Subject, A.Sender, A.ToOrCC, A.Body] : [A.Subject, A.Sender, A.ToOrCC]) {
      add(attrib, O.Contains, v => (v.str = text));
    }
    const date = searchDate(text);
    if (date) {
      add(A.Date, O.Is, v => (v.date = date.getTime() * 1000));
    }
    return terms;
  }

  // Suchfeld oben in der Mail: Treffer aus allen Postfächern in der
  // Kartenliste; leeres Feld kehrt zum vorherigen Ordner zurück
  mailSearch(top, text) {
    const a3 = top.document.getElementById("tabmail")?.currentAbout3Pane;
    if (!a3?.displayFolder) {
      return;
    }
    const term = (text || "").trim();
    let folder = this.searchFolder(false);
    if (!term) {
      this.mailSearchTerm = "";
      this.searchRun = null;
      a3.document.documentElement.removeAttribute("mc-search-stage");
      a3.document.documentElement.removeAttribute("mc-search-gloda");
      if (folder && this.isSearchFolder(a3.gFolder)) {
        let back = null;
        try {
          back = this.searchPrevURI && MailServices.folderLookup.getFolderForURL(this.searchPrevURI);
        } catch {}
        back ??= MailServices.accounts.defaultAccount?.incomingServer?.rootFolder
          ?.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
        if (back) {
          a3.displayFolder(back.URI);
        }
      }
      this.updateListHeader(top);
      return;
    }
    // wie Apple Mail zuerst der fertige Index: Thunderbirds Gloda kennt
    // Betreff, Personen und Text der indizierten Mails – seine Treffer stehen
    // sofort in der Liste, die Ordnersuche bestätigt sie im Hintergrund und
    // ergänzt, was Gloda (noch) nicht kennt. Abgeschaltet, leer oder zu
    // langsam: wie bisher erst Kopfzeilen, dann Text
    const run = { term, stage: "index", start: Date.now(), created: Date.now() };
    this.mailSearchTerm = term;
    this.searchRun = run;
    const html = a3.document.documentElement;
    html.removeAttribute("mc-search-gloda");
    if (!this.glodaEnabled() || term.length < GLODA_MIN_CHARS) {
      this.startMailSearch(top, a3, folder, run, null);
    } else {
      html.setAttribute("mc-search-stage", "index");
      this.glodaHits(term).then(hits => {
        if (this.searchRun === run && this.mailSearchTerm == term) {
          this.startMailSearch(top, a3, this.searchFolder(false), run, hits);
        }
      });
    }
    this.updateListHeader(top);
  }

  startMailSearch(top, a3, folder, run, hits) {
    const term = run.term;
    try {
      folder ??= this.searchFolder(true);
      const { VirtualFolderHelper } = ChromeUtils.importESModule("resource:///modules/VirtualFolderWrapper.sys.mjs");
      const wrapper = VirtualFolderHelper.wrapVirtualFolder(folder);
      if (a3.gFolder && !this.isSearchFolder(a3.gFolder)) {
        this.searchPrevURI = a3.gFolder.URI;
      }
      const scope = this.searchScope(this.searchBase(a3));
      // Thunderbird zeigt beim Start einer Suche zuerst die gemerkten Treffer
      // der letzten Suche (je Postfach zwischengespeichert) und räumt erst am
      // Ende auf – über viele IMAP-Postfächer dauert das, und bis dahin standen
      // Mails ohne den Begriff in der Liste. Darum vor jeder Suche leeren.
      this.clearSearchCache(folder, [...new Set([...wrapper.searchFolders, ...scope])]);
      // Gloda-Treffer als gemerkte Treffer eintragen: Thunderbird zeigt sie
      // beim Start der Suche sofort, ergänzt nur neue Treffer (keine
      // doppelten Zeilen) und entfernt am Ende eines Postfachs, was die
      // Ordnersuche nicht bestätigt
      const seeded = this.glodaSeed(folder, hits, scope);
      wrapper.searchFolders = scope;
      // zweistufig: erst nur die Kopfzeilen (fast sofort), danach im
      // Hintergrund der Text (searchStageDone); mit Gloda-Treffern gleich
      // der Text – die erste Stufe nähme deren Texttreffer wieder heraus.
      // Einschränkung: Kopfzeilentreffer in Mails, die Gloda noch nicht kennt
      // (neu, Postfach mitten in der Erstindizierung), erscheinen dann erst,
      // wenn die Textsuche ihr Postfach erreicht (die Begriffe gelten für
      // alle Postfächer des Suchordners gemeinsam)
      wrapper.searchTerms = this.searchTerms(wrapper.searchTermsSession, term, seeded > 0);
      wrapper.onlineSearch = false;
      MailServices.accounts.saveVirtualFolders();
      run.stage = seeded > 0 ? "body" : "headers";
      run.start = Date.now();
      debugLog("search: gloda", hits ? `${seeded} hits` : "off", "after", run.start - run.created, "ms");
      a3.document.documentElement.setAttribute("mc-search-stage", run.stage);
      if (seeded > 0) {
        a3.document.documentElement.setAttribute("mc-search-gloda", seeded);
      }
      if (this.isSearchFolder(a3.gFolder) && a3.gViewWrapper?.search && !this.searchScopeChanged) {
        // Suche läuft schon: neue Begriffe direkt in die Ansicht
        a3.gViewWrapper.search.virtualFolderTerms = wrapper.searchTerms;
      } else {
        this.searchScopeChanged = false;
        if (a3.gFolder && !this.isSearchFolder(a3.gFolder)) {
          this.searchPrevURI = a3.gFolder.URI;
        }
        wrapper.cleanUpMessageDatabase();
        a3.displayFolder(folder.URI);
        // frisch angelegt: die Ordnerliste hat die Zeile evtl. erst gleich
        if (!this.isSearchFolder(a3.gFolder)) {
          top.setTimeout(() => this.mailSearchTerm == term && a3.displayFolder(folder.URI), 300);
        }
      }
    } catch (e) {
      log("mail search error", e);
    }
    this.updateListHeader(top);
  }

  // Gloda aktiv (Thunderbirds Einstellung „Globale Suche und Indizierung“)
  glodaEnabled() {
    return Services.prefs.getBoolPref("mailnews.database.global.indexer.enabled", false);
  }

  // Treffer aus Gloda je Postfach (Ordner-URI → Nachrichtennummern); null,
  // wenn Gloda nicht oder nicht rechtzeitig antwortet
  glodaHits(term) {
    return new Promise(resolve => {
      let timer = null;
      const finish = value => {
        clearTimeout(timer);
        resolve(value);
      };
      // Begriff als Wortfolge, das letzte Wort darf weitergehen („rechn“ →
      // „Rechnung“); Anführungszeichen und Sterne hätten im Volltext-Index
      // eigene Bedeutung
      const words = term.replace(/["*]/g, " ").trim().split(/\s+/).filter(Boolean);
      if (!words.length) {
        finish(null);
        return;
      }
      timer = setTimeout(() => finish(null), GLODA_WAIT_MS);
      try {
        const { Gloda } = ChromeUtils.importESModule("resource:///modules/gloda/GlodaPublic.sys.mjs");
        const { GlodaConstants } = ChromeUtils.importESModule("resource:///modules/gloda/GlodaConstants.sys.mjs");
        const query = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
        query.fulltextMatches(`"${words.join(" ")}*"`);
        query.orderBy("-date");
        query.limit(GLODA_LIMIT);
        query.getCollection({
          onItemsAdded() {},
          onItemsModified() {},
          onItemsRemoved() {},
          onQueryCompleted: collection => {
            const hits = new Map();
            for (const msg of collection.items) {
              const uri = msg.folderURI;
              const key = msg.messageKey;
              if (uri && key != null) {
                if (!hits.has(uri)) {
                  hits.set(uri, []);
                }
                hits.get(uri).push(key);
              }
            }
            finish(hits);
          },
        });
      } catch (e) {
        log("search gloda error", e);
        finish(null);
      }
    });
  }

  // Gloda-Treffer im Suchbereich als gemerkte Treffer des Suchordners
  // eintragen (nur Mails, die es im Postfach noch gibt); liefert die Anzahl
  glodaSeed(searchFolder, hits, scope) {
    let count = 0;
    if (!hits?.size) {
      return count;
    }
    for (const f of scope) {
      const keys = hits.get(f.URI);
      if (!keys?.length) {
        continue;
      }
      try {
        const db = f.msgDatabase;
        const found = [...new Set(keys)].filter(k => db.containsKey(k)).sort((a, b) => a - b);
        if (found.length) {
          db.refreshCache(searchFolder.URI, found);
          count += found.length;
        }
      } catch (e) {
        log("search gloda seed error", f.URI, e);
      }
    }
    return count;
  }

  // Zweite Stufe der Suche: sind die Kopfzeilen durch, dieselbe Suche mit dem
  // Text dazu. Thunderbird zeigt dabei sofort die gemerkten Treffer der ersten
  // Stufe (je Postfach zwischengespeichert, alle passen weiter) und ergänzt
  // nur die neuen – keine doppelten Zeilen; Mails mit Treffer in den
  // Kopfzeilen liest es nicht noch einmal von der Platte. Pausiert beim
  // Scrollen wie jede Suche (hookSearchPause); ein neuer Begriff oder ein
  // Ordnerwechsel startet wieder mit Stufe eins (mailSearch).
  hookSearchStages(win) {
    const onLoaded = () => win.setTimeout(() => this.searchStageDone(win), 0);
    win.addEventListener("allMessagesLoaded", onLoaded);
    this.addWinRestorer(win, () => {
      win.removeEventListener("allMessagesLoaded", onLoaded);
      win.document.documentElement.removeAttribute("mc-search-stage");
      win.document.documentElement.removeAttribute("mc-search-gloda");
    });
  }

  searchStageDone(win) {
    const run = this.searchRun;
    const root = win.document.documentElement;
    // (Xray-Hülle: Getter wie „searching“ nur am Objekt der Seite sichtbar)
    const page = win.wrappedJSObject || win;
    const view = page.gViewWrapper;
    if (!run || run.stage == "index" || run.term != this.mailSearchTerm || root.getAttribute("mc-search-stage") != run.stage ||
        !this.isSearchFolder(win.gFolder) || !view?.search || view.searching) {
      return;
    }
    const ms = Date.now() - run.start;
    if (run.stage == "body") {
      log("search: body done", ms, "ms,", page.gDBView?.rowCount, "hits");
      this.searchRun = null;
      root.removeAttribute("mc-search-stage");
      return;
    }
    log("search: headers done", ms, "ms,", page.gDBView?.rowCount, "hits");
    try {
      const { VirtualFolderHelper } = ChromeUtils.importESModule("resource:///modules/VirtualFolderWrapper.sys.mjs");
      const wrapper = VirtualFolderHelper.wrapVirtualFolder(win.gFolder);
      const terms = this.searchTerms(wrapper.searchTermsSession, run.term, true);
      // erst im Ordner speichern: nur wenn die Begriffe der Ansicht dort
      // stehen, nimmt Thunderbird die gemerkten Treffer
      wrapper.searchTerms = terms;
      MailServices.accounts.saveVirtualFolders();
      run.stage = "body";
      run.start = Date.now();
      root.setAttribute("mc-search-stage", "body");
      // die Ansicht wird dabei neu angelegt und springt sonst nach oben –
      // weggescrollt: dort bleiben, auch wenn die Suche fertig ist
      const tree = win.threadTree;
      const pane = page.threadPane;
      const scrollTop = tree?.scrollTop || 0;
      view.search.virtualFolderTerms = terms;
      if (scrollTop > 0) {
        tree.scrollTop = scrollTop;
        if (pane) {
          pane.isFirstScroll = false;
          pane.scrollDetected = true;
        }
      }
    } catch (e) {
      log("search body stage error", e);
      this.searchRun = null;
      root.removeAttribute("mc-search-stage");
    }
  }

  clearSearchCache(searchFolder, folders) {
    for (const f of folders) {
      try {
        f.msgDatabase?.refreshCache(searchFolder.URI, []);
      } catch {}
    }
  }

  // Geburtstage aus dem Adressbuch als eigener Kalender wie bei Apple:
  // nur im Speicher und schreibgeschützt, bei jedem Start und bei Änderungen
  // an Kontakten neu gefüllt; synchronisiert nirgendwohin. Ein-/Ausblenden
  // über das Häkchen in der Kalenderliste. Beim Deaktivieren oder
  // Deinstallieren wird er wieder entfernt.
  hookBirthdays() {
    let timer = null;
    const schedule = (ms = 3000) => {
      clearTimeout(timer);
      timer = setTimeout(() => this.syncBirthdays().catch(e => log("birthdays error", e)), ms);
    };
    schedule(9000);
    const topics = ["addrbook-contact-created", "addrbook-contact-updated", "addrbook-contact-deleted", "addrbook-directory-created", "addrbook-directory-deleted"];
    const obs = { observe: () => schedule() };
    for (const topic of topics) {
      Services.obs.addObserver(obs, topic);
    }
    const prefObs = { observe: () => schedule(200) };
    Services.prefs.addObserver(BDAY_PREF, prefObs);
    // Deaktivieren/Deinstallieren: Kalender entfernen (beim Beenden oder
    // Update bleibt er, sonst bekäme er jedes Mal eine neue Kennung)
    const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
    // (dabei auch den versteckten Suchordner entfernen – ohne halo.spaces
    // stünde er sonst sichtbar unter „Lokale Ordner“)
    const goodbye = addon => {
      if (addon.id == "mail-cards@sebastian.local") {
        this.removeBirthdayCalendar();
        this.removeSearchFolder();
        restorePersonalBookName();
        EarlyTheme.remove().catch(e => log("early theme remove error", e));
      }
    };
    const addonListener = { onDisabling: goodbye, onUninstalling: goodbye };
    AddonManager.addAddonListener(addonListener);
    this.restorers.push(() => {
      clearTimeout(timer);
      for (const topic of topics) {
        Services.obs.removeObserver(obs, topic);
      }
      Services.prefs.removeObserver(BDAY_PREF, prefObs);
      AddonManager.removeAddonListener(addonListener);
    });
  }

  removeSearchFolder() {
    try {
      const folder = this.searchFolder(false);
      folder?.parent?.propagateDelete(folder, true);
      MailServices.accounts.saveVirtualFolders();
    } catch (e) {
      log("search folder remove error", e);
    }
  }

  removeBirthdayCalendar() {
    try {
      const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
      const calendar = cal.manager.getCalendarById(Services.prefs.getStringPref(BDAY_CAL_PREF, ""));
      if (calendar) {
        cal.manager.unregisterCalendar(calendar);
      }
    } catch (e) {
      log("birthdays remove error", e);
    }
    Services.prefs.clearUserPref(BDAY_CAL_PREF);
  }

  async syncBirthdays() {
    const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
    const { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");
    const { CalRecurrenceInfo } = ChromeUtils.importESModule("resource:///modules/CalRecurrenceInfo.sys.mjs");
    // Ein-/Ausblenden wie bei Apple Kalender über das Häkchen am Kalender
    // „Geburtstage“ in der Kalenderliste. Die frühere Option (Pref aus)
    // blendet ihn einmal aus und wird dann gelöscht
    let hide = false;
    if (Services.prefs.prefHasUserValue(BDAY_PREF)) {
      hide = !Services.prefs.getBoolPref(BDAY_PREF, true);
      Services.prefs.clearUserPref(BDAY_PREF);
    }
    // Geburtstage einsammeln (lokale Adressbücher; doppelte Kontakte einmal)
    const found = new Map();
    for (const dir of MailServices.ab.directories) {
      if (dir.isRemote) {
        continue; // LDAP o. Ä. – nicht komplett durchgehen
      }
      let cards = [];
      try {
        cards = dir.childCards;
      } catch {
        continue;
      }
      for (const card of cards) {
        if (card.isMailList) {
          continue;
        }
        let entry = null;
        try {
          entry = card.vCardProperties?.getFirstEntry("bday");
        } catch {}
        const value = String(entry?.value || "");
        const m = value.match(/^(?:(\d{4})|--)-?(\d{2})-?(\d{2})/);
        if (!m) {
          continue;
        }
        // Apple (Kontakte/iCloud) speichert Geburtstage ohne Jahr als 1604 mit
        // X-APPLE-OMIT-YEAR – das ist kein Geburtsjahr (auch ohne den Parameter)
        const omit = entry.params?.["x-apple-omit-year"];
        const year = m[1] && m[1] != omit && Number(m[1]) > 1604 ? Number(m[1]) : null;
        const name = (card.displayName || `${card.firstName || ""} ${card.lastName || ""}`).trim() || card.primaryEmail;
        if (!name) {
          continue;
        }
        const key = `${name.toLocaleLowerCase()}|${m[2]}${m[3]}`;
        if (!found.has(key) || (!found.get(key).year && year)) {
          found.set(key, { name, year, month: Number(m[2]), day: Number(m[3]) });
        }
      }
    }
    // wie bei Apple immer vorhanden (auch ohne Geburtstage), damit er sich
    // in der Kalenderliste ein- und ausblenden lässt
    let calendar = cal.manager.getCalendarById(Services.prefs.getStringPref(BDAY_CAL_PREF, ""));
    if (!calendar) {
      calendar = cal.manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
      calendar.name = tr("Birthdays");
      calendar.setProperty("color", "#FF2D55");
      calendar.setProperty("suppressAlarms", true);
      cal.manager.registerCalendar(calendar);
      Services.prefs.setStringPref(BDAY_CAL_PREF, calendar.id);
    }
    if (hide) {
      // wie das Häkchen: aus der sichtbaren Kalendersammlung jedes Fensters nehmen
      for (const win of Services.wm.getEnumerator("mail:3pane")) {
        try {
          cal.view.getCompositeCalendar(win).removeCalendar(calendar);
        } catch {}
      }
      calendar.deleteProperty("calendar-main-in-composite");
    }
    calendar.readOnly = false;
    try {
      for (const item of await calendar.getItemsAsArray(Ci.calICalendar.ITEM_FILTER_ALL_ITEMS, 0, null, null)) {
        await calendar.deleteItem(item);
      }
      for (const b of found.values()) {
        const e = new CalEvent();
        e.id = `halo-bday-${b.month}-${b.day}-${b.name}`;
        e.title = tr("{name}’s Birthday", { name: b.name });
        const start = cal.createDateTime();
        start.resetTo(b.year || 2000, b.month - 1, b.day, 0, 0, 0, cal.dtz.floating);
        start.isDate = true;
        const end = start.clone();
        end.day += 1;
        e.startDate = start;
        e.endDate = end;
        e.setProperty("TRANSP", "TRANSPARENT");
        const info = new CalRecurrenceInfo(e);
        const rule = cal.createRecurrenceRule();
        rule.type = "YEARLY";
        rule.interval = 1;
        info.appendRecurrenceItem(rule);
        e.recurrenceInfo = info;
        if (b.year) {
          e.setProperty("DESCRIPTION", tr("Born {year}", { year: b.year }));
        }
        await calendar.addItem(e);
      }
    } finally {
      calendar.readOnly = true;
    }
    log("birthdays", { count: found.size });
  }

  // Wie Apple Mail: Eine zugeklappte Konversation zeigt Vorschau und Bild der
  // neuesten Nachricht, nicht der ersten. Aufgeklappt hat jede Zeile ihre eigene.
  // Dieselbe Mail (gleiche Message-ID) mehrfach – etwa Gmail-Labels in „Alle
  // Posteingänge“, Kopien in mehreren Ordnern oder in Suchergebnissen: wie
  // Apple Mail nur die erste Karte zeigen, weitere Kopien in derselben
  // Konversation bzw. direkt dahinter blendet das CSS aus (data-mc-dup)
  // Eine laufende Suche (Suchfeld, Sammelordner) arbeitet Thunderbird in
  // Zeitscheiben auf dem Hauptthread ab – über viele Postfächer mit Tausenden
  // Treffern kam dabei jedes zweite Bild der Liste 50–70 ms zu spät, das
  // Scrollen ruckelte, bis die Suche fertig war. Darum die Suche anhalten,
  // solange gescrollt wird, und 300 ms nach der letzten Bewegung weiterlaufen
  // lassen (die Treffer kommen dann wie gewohnt nach)
  hookSearchPause(win) {
    const tree = win.threadTree;
    let paused = null;
    let timer = null;
    const resume = () => {
      win.clearTimeout(timer);
      timer = null;
      const session = paused;
      paused = null;
      try {
        session?.resumeSearch();
      } catch (e) {
        log("search resume error", e);
      }
    };
    const onScroll = () => {
      if (!paused) {
        // (durch die Xray-Hülle des Fensters wären die Getter „searching“
        // und „session“ unsichtbar – darum das Objekt der Seite selbst)
        const wrapper = (win.wrappedJSObject || win).gViewWrapper;
        const session = wrapper?.searching ? wrapper.search?.session : null;
        if (!session) {
          return;
        }
        try {
          session.pauseSearch();
        } catch {
          return;
        }
        paused = session;
      }
      win.clearTimeout(timer);
      timer = win.setTimeout(resume, 300);
    };
    tree.addEventListener("scroll", onScroll, { passive: true, capture: true });
    tree.addEventListener("wheel", onScroll, { passive: true });
    this.addWinRestorer(win, () => {
      tree.removeEventListener("scroll", onScroll, { capture: true });
      tree.removeEventListener("wheel", onScroll);
      if (paused) {
        resume();
      }
    });
  }

  isDuplicateRow(row) {
    const view = row.view;
    const index = row._index;
    let hdr, top;
    try {
      top = !view?.getLevel(index);
      hdr = view.getMsgHdrAt(index);
    } catch {
      return false;
    }
    if (!hdr?.messageId || index < 1) {
      return false;
    }
    // in der Konversation rückwärts bis zu ihrem Anfang (Ebene 0); eine
    // eigenständige Kopie (Ebene 0) mit dem Anfang der vorigen Konversation
    // vergleichen (gleiches Datum, steht direkt davor) – höchstens 500 Zeilen
    for (let i = index - 1; i >= 0 && index - i <= 500; i--) {
      try {
        const root = !view.getLevel(i);
        if ((!top || root) && view.getMsgHdrAt(i)?.messageId == hdr.messageId) {
          return true;
        }
        if (root) {
          return false;
        }
      } catch {
        return false;
      }
    }
    return false;
  }

  hdrForRow(row) {
    let hdr;
    try {
      hdr = row.view.getMsgHdrAt(row._index);
    } catch {
      return null;
    }
    if (!hdr || !row.classList.contains("children") || !row.classList.contains("collapsed")) {
      return hdr;
    }
    try {
      const thread = row.view.getThreadContainingIndex(row._index);
      let latest = hdr;
      for (let i = 0; i < thread.numChildren; i++) {
        const child = thread.getChildHdrAt(i);
        if (child && child.date > latest.date) {
          latest = child;
        }
      }
      return latest;
    } catch {
      return hdr;
    }
  }

  // Mailkopf: dasselbe Absenderbild wie in der Karte (Logo, Foto oder
  // Initialen mit Verlauf) statt Thunderbirds einzelnem Buchstaben
  hookHeaderAvatar(doc) {
    const win = doc?.defaultView;
    if (!win || doc.__mcHdrAvatar || !Services.prefs.getBoolPref("extensions.mailcards.bundledTheme", true)) {
      return;
    }
    doc.__mcHdrAvatar = true;
    const run = () => {
      const box = doc.querySelector("#fromRecipient0 .recipient-avatar");
      const hdr = win.gMessage;
      // Thunderbird befüllt das Bild bei Adressbuch-Änderungen (Stern im
      // Mailkopf, CardDAV) neu – mit seinem Buchstaben (<span>) oder Foto
      // (<img data-l10n-id>); fillAvatar erzeugt beides nie. Dann neu befüllen.
      const foreign = box?.querySelector(":scope > span, :scope > img[data-l10n-id]");
      if (!box || !hdr || (box.dataset.mcFor == hdr.messageId && !foreign)) {
        return;
      }
      const same = box.dataset.mcFor == hdr.messageId;
      if (foreign) {
        box.replaceChildren();
      }
      box.dataset.mcFor = hdr.messageId;
      box.classList.add("mc-hdr-avatar");
      try {
        this.fillAvatar(box, hdr);
        if (!same) {
          this.decorateHeader(doc, hdr);
          this.quickReply(doc, hdr);
        }
      } catch (e) {
        log("header avatar error", e);
      }
    };
    let pending = false;
    // Empfänger wie Apple Mail: nur der Name, die Adresse als Tooltip beim
    // Überfahren (ohne Namen bleibt die Adresse stehen – beim Absender wie in
    // der Liste der Name aus der Domain, „rueckgabe@amazon.de“ → „Amazon“)
    const shorten = () => {
      for (const li of doc.querySelectorAll("#messageHeader li.header-recipient")) {
        const email = li.emailAddress || "";
        // bei eigenen Adressen (mehrere Identitäten, kein Kontakt) schreibt
        // Thunderbird „Name <Adresse>“ – davon nur den Namen
        let name = (li.displayName || "").trim().replace(/^"?(.*?)"?\s*<[^<>\s]+@[^<>\s]+>$/, "$1").trim();
        if (email && li.id.startsWith("fromRecipient")) {
          name = senderLabel(name, email.toLowerCase());
        }
        if (email && li.title != email) {
          li.title = email;
        }
        for (const el of [li.querySelector(".recipient-single-line"), li.querySelector(".recipient-multi-line-name")]) {
          if (el && name && el.textContent != name) {
            el.textContent = name;
          }
        }
      }
    };
    const mo = new win.MutationObserver(() => {
      if (!pending) {
        pending = true;
        win.setTimeout(() => {
          pending = false;
          run();
          shorten();
        }, 0);
      }
    });
    mo.observe(doc.getElementById("messageHeader") || doc.documentElement, { childList: true, subtree: true });
    shorten();
    run();
    this.hookNotificationLayout(doc);
    this.hookHoverActions(doc);
    this.addWinRestorer(win, () => {
      mo.disconnect();
      delete doc.__mcHdrAvatar;
      // Datum zurück an seinen Platz, eigene Elemente entfernen
      const meta = doc.getElementById("mcHdrMeta");
      const date = doc.getElementById("dateLabel");
      if (meta && date && doc.__mcDateHome) {
        doc.__mcDateHome.parent.insertBefore(date, doc.__mcDateHome.next?.parentNode == doc.__mcDateHome.parent ? doc.__mcDateHome.next : null);
      }
      meta?.__mcResize?.disconnect();
      meta?.remove();
      doc.getElementById("mcListBanner")?.remove();
      for (const box of doc.querySelectorAll(".mc-hdr-avatar")) {
        box.classList.remove("mc-hdr-avatar", "mc-has-img", "mc-small");
        delete box.dataset.mcFor;
      }
    });
  }

  // Aktionen beim Überfahren wie Apple Mail: Fährt die Maus über die
  // geöffnete Mail (Kopf oder Text), erscheint mittig auf der Linie unter dem
  // Kopf eine kleine Kapsel mit Löschen | Antworten, Allen antworten,
  // Weiterleiten. Ein-/Ausblenden über :hover im CSS (userChrome.css); die
  // Befehle laufen über Thunderbirds commandController der Leseansicht – wie
  // die Knöpfe im Mailkopf, also auch mit Rückgängig und Folgemail.
  hookHoverActions(doc) {
    const win = doc.defaultView;
    // in den Rahmen um den Kopf – #messageHeader selbst schneidet Überstehendes ab
    const header = doc.getElementById("msgHeaderView") || doc.getElementById("messageHeader");
    if (!win || !header || doc.getElementById("mcHoverActions")) {
      return;
    }
    // nicht in den Karten der Konversationsansicht: Thunderbirds Befehle
    // wirken dort auf die Auswahl der Mailliste (Löschen träfe die gewählte
    // Mail bzw. den ganzen Faden) oder sind mangels Auswahl gesperrt
    try {
      if (win.frameElement?.classList?.contains("mc-conv-browser")) {
        return;
      }
    } catch {}
    const X = "http://www.w3.org/1999/xhtml";
    const box = doc.createElementNS(X, "div");
    box.id = "mcHoverActions";
    const buttons = [];
    const act = (cls, label, command) => {
      const b = doc.createElementNS(X, "button");
      b.type = "button";
      // nur für die Maus – per Tastatur gibt es Kopfzeilen-Knöpfe und Kürzel
      b.tabIndex = -1;
      b.className = `mc-hover-action ${cls}`;
      b.title = label;
      b.setAttribute("aria-label", label);
      b.dataset.command = command;
      b.addEventListener("click", event => {
        event.stopPropagation();
        try {
          win.commandController?.doCommand(command, event);
        } catch (e) {
          log("hover action error", command, e);
        }
      });
      buttons.push(b);
      return b;
    };
    const sep = doc.createElementNS(X, "span");
    sep.className = "mc-hover-sep";
    box.append(
      act("mc-hover-delete", tr("Delete"), "cmd_deleteMessage"),
      sep,
      act("mc-hover-reply", tr("Reply"), "cmd_reply"),
      act("mc-hover-replyall", tr("Reply All"), "cmd_replyall"),
      act("mc-hover-forward", tr("Forward"), "cmd_forward"),
    );
    header.append(box);
    // ausgegraut, was gerade nicht geht (z. B. ohne Identität kein Antworten)
    const update = () => {
      for (const b of buttons) {
        let ok = true;
        try {
          ok = !!win.commandController?.isCommandEnabled(b.dataset.command);
        } catch {}
        b.disabled = !ok;
      }
    };
    doc.documentElement.addEventListener("mouseenter", update);
    this.addWinRestorer(win, () => {
      doc.documentElement.removeEventListener("mouseenter", update);
      box.remove();
    });
  }

  // Hinweise über der Mail (entfernte Inhalte, Spam …): bei wenig Platz bricht
  // der Text in seiner Spalte um, der Knopf bleibt rechts daneben – statt in
  // eine eigene Zeile darunter zu rutschen. Thunderbirds moz-message-bar legt
  // das im Schatten-DOM fest (flex-wrap ohne Variable), daher eine kleine
  // Stilregel dort hinein; Farben bleiben unverändert.
  hookNotificationLayout(doc) {
    const win = doc.defaultView;
    const box = doc.getElementById("mail-notification-top");
    if (!win || !box || box.__mcLayout) {
      return;
    }
    box.__mcLayout = true;
    const CSS_TEXT = `
      .container { align-items: flex-start; }
      .content { flex-wrap: nowrap; column-gap: 12px; }
      .text-container { flex: 1 1 auto; min-width: 0; }
      .actions.active { flex: none; }
      /* sehr schmal: Knopf doch unter den Text */
      @media (max-width: 420px) { .content { flex-wrap: wrap; } }`;
    const apply = () => {
      for (const n of box.querySelectorAll("notification-message")) {
        const root = n.shadowRoot;
        if (root && !root.querySelector("style.mc-layout")) {
          const style = doc.createElementNS("http://www.w3.org/1999/xhtml", "style");
          style.className = "mc-layout";
          style.textContent = CSS_TEXT;
          root.append(style);
        }
      }
    };
    const mo = new win.MutationObserver(() => win.setTimeout(apply, 0));
    mo.observe(box, { childList: true, subtree: true });
    apply();
    this.addWinRestorer(win, () => {
      mo.disconnect();
      delete box.__mcLayout;
      for (const n of box.querySelectorAll("notification-message")) {
        n.shadowRoot?.querySelector("style.mc-layout")?.remove();
      }
    });
  }

  // Schnellantwort unter der Mail: ein Textfeld „Antworten an Anna …“; ⌘↩
  // bzw. Strg+↩ oder der Pfeil sendet die Antwort an den Absender (Betreff
  // „Re:“, mit Bezug auf die Mail, die danach als beantwortet gilt) ohne
  // Verfassen-Fenster; „Mehr …“ öffnet das normale Antwortfenster mit dem
  // Geschriebenen. Nicht bei Entwürfen, Vorlagen, Postausgang und eigenen
  // gesendeten Mails; Einstellung extensions.mailcards.quickReply
  quickReply(doc, hdr) {
    const win = doc.defaultView;
    const box = doc.getElementById("messagepanebox");
    let bar = doc.getElementById("mcQuickReply");
    const F = Ci.nsMsgFolderFlags;
    const skip = !Services.prefs.getBoolPref("extensions.mailcards.quickReply", true) || !hdr?.folder ||
      hdr.folder.isSpecialFolder(F.Drafts | F.Templates | F.Queue | F.SentMail, true) || hdr.folder.server?.type == "rss";
    if (skip || !box) {
      bar?.remove();
      return;
    }
    const X = "http://www.w3.org/1999/xhtml";
    if (!bar) {
      bar = doc.createElementNS(X, "div");
      bar.id = "mcQuickReply";
      const field = doc.createElementNS(X, "textarea");
      field.className = "mc-qr-field";
      field.rows = 1;
      const more = doc.createElementNS(X, "button");
      more.className = "mc-qr-more";
      more.textContent = tr("More …");
      const send = doc.createElementNS(X, "button");
      send.className = "mc-qr-send";
      send.title = tr("Send");
      send.setAttribute("aria-label", tr("Send"));
      bar.append(field, more, send);
      box.append(bar);
      // wächst mit dem Text bis 6 Zeilen
      const grow = () => {
        field.style.height = "auto";
        field.style.height = `${Math.min(field.scrollHeight, 6 * 18 + 12)}px`;
        bar.toggleAttribute("data-text", !!field.value.trim());
      };
      field.addEventListener("input", grow);
      field.addEventListener("keydown", event => {
        if (event.key == "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          send.click();
        }
      });
      send.addEventListener("click", () => this.sendQuickReply(doc, bar).catch(e => log("quick reply error", e)));
      more.addEventListener("click", () => {
        const text = field.value;
        const current = win.gMessage;
        if (!current) {
          return;
        }
        const uri = current.folder.getUriForMsg(current);
        // normales Antworten; der Text kommt an den Anfang, sobald der Editor bereit ist
        const known = new Set(Services.wm.getEnumerator("msgcompose"));
        MailServices.compose.OpenComposeWindow(null, current, uri, Ci.nsIMsgCompType.ReplyToSender, Ci.nsIMsgCompFormat.Default, null, null, win.msgWindow);
        if (text.trim()) {
          let tries = 0;
          const attach = () => {
            const cw = [...Services.wm.getEnumerator("msgcompose")].find(x => !known.has(x));
            if (!cw) {
              if (tries++ < 100) {
                win.setTimeout(attach, 100);
              }
              return;
            }
            cw.addEventListener("compose-editor-ready", () => {
              try {
                const editor = cw.GetCurrentEditor();
                editor.beginningOfDocument();
                editor.insertText(text);
                editor.insertLineBreak?.();
              } catch (e) {
                log("quick reply more error", e);
              }
            }, { once: true });
          };
          attach();
        }
        field.value = "";
        grow();
      });
    }
    const field = bar.querySelector(".mc-qr-field");
    const name = (hdr.mime2DecodedAuthor || hdr.author || "").replace(/\s*<.*$/, "").replace(/^"|"$/g, "") || hdr.author;
    field.placeholder = tr("Reply to {name} …", { name });
    if (bar.dataset.for != hdr.messageId) {
      field.value = "";
      field.style.height = "";
      bar.removeAttribute("data-text");
      bar.removeAttribute("data-sent");
    }
    bar.dataset.for = hdr.messageId;
  }

  async sendQuickReply(doc, bar) {
    const win = doc.defaultView;
    const hdr = win.gMessage;
    const field = bar.querySelector(".mc-qr-field");
    const text = field.value.trim();
    if (!hdr || !text || bar.hasAttribute("data-busy")) {
      return;
    }
    const { MailUtils } = ChromeUtils.importESModule("resource:///modules/MailUtils.sys.mjs");
    const [identity] = MailUtils.getIdentityForHeader(hdr);
    if (!identity) {
      return;
    }
    const fields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(Ci.nsIMsgCompFields);
    const replyTo = hdr.getStringProperty("replyTo") || hdr.author;
    fields.to = replyTo;
    fields.from = identity.fullName ? `${identity.fullName} <${identity.email}>` : identity.email;
    const subject = hdr.mime2DecodedSubject || "";
    fields.subject = /^re:/i.test(subject) ? subject : `Re: ${subject}`;
    fields.body = text + "\n";
    fields.forcePlainText = true;
    fields.useMultipartAlternative = false;
    const refs = hdr.numReferences ? [...Array(hdr.numReferences).keys()].map(i => `<${hdr.getStringReference(i)}>`) : [];
    fields.references = [...refs, `<${hdr.messageId}>`].join(" ");
    fields.setHeader("In-Reply-To", `<${hdr.messageId}>`);
    const params = Cc["@mozilla.org/messengercompose/composeparams;1"].createInstance(Ci.nsIMsgComposeParams);
    params.type = Ci.nsIMsgCompType.ReplyToSender;
    params.format = Ci.nsIMsgCompFormat.PlainText;
    params.identity = identity;
    params.originalMsgURI = hdr.folder.getUriForMsg(hdr);
    params.composeFields = fields;
    const compose = Cc["@mozilla.org/messengercompose/compose;1"].createInstance(Ci.nsIMsgCompose);
    compose.initialize(params, null, null);
    const account = MailServices.accounts.getAccount(hdr.accountKey) || MailServices.accounts.findAccountForServer(hdr.folder.server);
    bar.setAttribute("data-busy", "");
    try {
      await compose.sendMsg(Services.io.offline ? Ci.nsIMsgCompDeliverMode.Later : Ci.nsIMsgCompDeliverMode.Now, identity, account?.key || "", null, null);
      field.value = "";
      field.style.height = "";
      bar.removeAttribute("data-text");
      bar.setAttribute("data-sent", "");
      field.placeholder = tr("Reply sent");
    } finally {
      bar.removeAttribute("data-busy");
    }
  }

  // Mailkopf wie Apple Mail: oben rechts Ordner und Uhrzeit, darüber bei
  // Verteilern ein Hinweis mit „Abmelden“ (statt List-ID-Zeile)
  decorateHeader(doc, hdr) {
    const win = doc.defaultView;
    const X = "http://www.w3.org/1999/xhtml";
    const header = doc.getElementById("messageHeader");
    const date = doc.getElementById("dateLabel");
    if (!header || !date) {
      return;
    }
    let meta = doc.getElementById("mcHdrMeta");
    if (!meta) {
      meta = doc.createElementNS(X, "div");
      meta.id = "mcHdrMeta";
      const folder = doc.createElementNS(X, "span");
      folder.className = "mc-hdr-folder";
      doc.__mcDateHome = { parent: date.parentNode, next: date.nextSibling };
      meta.append(folder, date);
      header.append(meta);
    }
    const folderEl = meta.querySelector(".mc-hdr-folder");
    let title = "";
    try {
      title = hdr.folder ? appleFolderTitle(hdr.folder) : "";
    } catch {}
    // Text in eigenem Element – nur so kürzt ein langer Name mit „…“
    let folderText = folderEl.querySelector(".mc-hdr-folder-text");
    if (!folderText) {
      folderText = doc.createElementNS(X, "span");
      folderText.className = "mc-hdr-folder-text";
      folderEl.replaceChildren(folderText);
    }
    folderText.textContent = title;
    folderEl.hidden = !title;
    // Farbpunkt des Kontos vor dem Ordnersymbol (wie in der Ordnerliste);
    // Lokale Ordner ohne Punkt
    let accColor = "";
    try {
      const server = hdr.folder?.server;
      if (server && server.type != "none") {
        accColor = accountColor(server.prettyName);
      }
    } catch {}
    let accDot = folderEl.querySelector(".mc-hdr-acc");
    if (accColor) {
      if (!accDot) {
        accDot = doc.createElementNS(X, "span");
        accDot.className = "mc-hdr-acc";
        folderEl.prepend(accDot);
      }
      accDot.style.setProperty("--mc-acc", accColor);
    } else {
      accDot?.remove();
    }
    // genau so viel Platz rechts reservieren, wie Ordner und Uhrzeit brauchen
    const measure = () => header.style.setProperty("--mc-meta-w", `${Math.ceil(meta.getBoundingClientRect().width)}px`);
    measure();
    if (!meta.__mcResize) {
      meta.__mcResize = new win.ResizeObserver(measure);
      meta.__mcResize.observe(meta);
    }

    // Hinweis bei Verteilern (List-ID/List-Unsubscribe), nicht im Spam-Ordner
    doc.getElementById("mcListBanner")?.remove();
    const data = win.currentHeaderData || {};
    const isList = !!(data["list-id"] || data["list-unsubscribe"]);
    let junk = false;
    try {
      junk = !!hdr.folder?.getFlag(Ci.nsMsgFolderFlags.Junk);
    } catch {}
    if (!isList || junk) {
      return;
    }
    const links = (data["list-unsubscribe"]?.headerValue || "").match(/<[^>]+>/g)?.map(l => l.slice(1, -1).trim()) || [];
    const web = links.find(l => /^https:\/\//i.test(l));
    const mail = links.find(l => /^mailto:/i.test(l));
    // schon abgemeldet (Ein-Klick bestätigt): je Verteiler gemerkt, gilt auch für
    // weitere Mails desselben Verteilers
    const listKey = unsubscribeKey(data, hdr);
    const done = listKey && unsubscribedLists().includes(listKey);
    const banner = doc.createElementNS(X, "div");
    banner.id = "mcListBanner";
    const icon = doc.createElementNS(X, "span");
    icon.className = "mc-lb-icon";
    const text = doc.createElementNS(X, "span");
    text.className = "mc-lb-text";
    text.textContent = done ? tr("You unsubscribed from this mailing list.") : tr("This message is from a mailing list.");
    banner.append(icon, text);
    if ((web || mail) && !done) {
      const unsub = doc.createElementNS(X, "button");
      unsub.className = "mc-lb-unsub";
      unsub.type = "button";
      unsub.textContent = tr("Unsubscribe");
      unsub.title = web || mail.replace(/^mailto:/i, "");
      const openWeb = () => {
        // im Standardbrowser öffnen – der Absender bestätigt dort. Wie ein
        // Klick auf einen Link in der Mail (loadURI braucht seit Thunderbird
        // 140 einen Principal und schlug ohne ihn fehl)
        if (typeof win.openLinkExternally == "function") {
          win.openLinkExternally(web);
        } else {
          Cc["@mozilla.org/uriloader/external-protocol-service;1"]
            .getService(Ci.nsIExternalProtocolService)
            .loadURI(Services.io.newURI(web), Services.scriptSecurityManager.getSystemPrincipal());
        }
      };
      // Abmelde-Mail nur vorbereiten – gesendet wird erst durch den Nutzer.
      // Absender ist die Identität, an die die Mail ging (wie Thunderbird bei
      // mailto-Links in Mails), nicht die Standard-Identität: Verteiler melden
      // nach Absender ab, und die private Adresse ginge sonst an den Betreiber
      const composeMail = () => {
        let identity = null;
        try {
          const { MailUtils } = ChromeUtils.importESModule("resource:///modules/MailUtils.sys.mjs");
          [identity] = MailUtils.getIdentityForHeader(hdr);
        } catch (e) {
          debugLog("unsubscribe identity", String(e).slice(0, 120));
        }
        MailServices.compose.OpenComposeWindowWithURI(null, Services.io.newURI(mail), identity);
      };
      const unsubscribeOneClick = async () => {
        let name = "";
        try {
          const parsed = MailServices.headerParser.parseDecodedHeader(hdr.mime2DecodedAuthor || hdr.author)[0];
          name = senderLabel(parsed?.name, (parsed?.email || "").toLowerCase());
        } catch {}
        // wie Apple Mail erst nachfragen – die Abmeldung geschieht sofort
        // asynchron: ein modaler Dialog hielte sonst die ganze Oberfläche an
        const flags = Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_IS_STRING +
          Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_CANCEL;
        const result = await Services.prompt.asyncConfirmEx(win.browsingContext.top, Services.prompt.MODAL_TYPE_WINDOW,
          tr("Unsubscribe from messages from {name}?", { name: name || hdr.author }),
          tr("The sender will be told directly that you no longer want these messages."),
          flags, tr("Unsubscribe"), null, null, null, false);
        if (result.getProperty("buttonNumClicked") != 0) {
          return;
        }
        unsub.disabled = true;
        try {
          const res = await fetchWithTimeout(win, web, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: "List-Unsubscribe=One-Click",
            // die Antwortseite selbst wird nicht gebraucht; eine Umleitung auf
            // eine Bestätigungsseite heißt schon „erledigt“
            max: 0,
            truncate: true,
            followRedirects: false,
          });
          if (!res.ok) {
            throw new Error(`status ${res.status}`);
          }
          // erledigt: merken, Knopf weg, Hinweis sagt es (Apple Mail: Hinweis verschwindet)
          rememberUnsubscribed(listKey);
          text.textContent = tr("You unsubscribed from this mailing list.");
          unsub.remove();
        } catch (e) {
          // klappt der POST nicht: Abmelde-Mail oder doch die Seite im Browser
          debugLog("one-click unsubscribe failed", String(e).slice(0, 120));
          unsub.disabled = false;
          mail ? composeMail() : openWeb();
        }
      };
      unsub.addEventListener("click", async () => {
        try {
          // Ein-Klick-Abmeldung (RFC 8058): der Link erwartet einen POST – im
          // Browser geöffnet zeigt er nur eine leere Seite (z. B. Google).
          // Thunderbird reicht List-Unsubscribe-Post nicht in currentHeaderData durch.
          if (web && /List-Unsubscribe=One-Click/i.test(await readHeader(hdr, "list-unsubscribe-post"))) {
            await unsubscribeOneClick();
          } else if (web) {
            openWeb();
          } else {
            composeMail();
          }
        } catch (e) {
          log("unsubscribe error", e);
        }
      });
      banner.append(unsub);
    }
    const close = doc.createElementNS(X, "button");
    close.className = "mc-lb-close";
    close.type = "button";
    close.title = tr("Close");
    close.setAttribute("aria-label", tr("Close"));
    close.addEventListener("click", () => banner.remove());
    banner.append(close);
    const view = doc.getElementById("msgHeaderView");
    (view || header).before(banner);
  }

  // outgoing: Bild des (ersten) Empfängers wie der Name in der Karte (im
  // Mailkopf bleibt es der Absender)
  fillAvatar(avatar, hdr, outgoing = false) {
    const { name = "", email = "" } = personsFor(hdr, outgoing)[0] || {};

    avatar.dataset.email = email;
    const initials = initialsFor(name, email);
    const show = result => {
      if (avatar.dataset.email != email) {
        return; // Zeile wurde inzwischen für eine andere Nachricht verwendet
      }
      if (result?.src) {
        let img = avatar.querySelector("img");
        if (!img) {
          avatar.textContent = "";
          img = avatar.ownerDocument.createElement("img");
          img.alt = "";
          avatar.appendChild(img);
        }
        if (img.getAttribute("src") != result.src) {
          img.setAttribute("src", result.src);
        }
        avatar.classList.add("mc-has-img");
        avatar.classList.toggle("mc-small", !!result.small);
      } else {
        avatar.classList.remove("mc-has-img", "mc-small");
        avatar.textContent = initials;
      }
    };

    if (!email) {
      show(null);
      return;
    }
    const known = this.avatars.peek(email);
    if (known !== undefined) {
      show(known);
      return;
    }
    show(null);
    // in Werbung/Junk keine Logos laden (das würde Spam-Absendern zeigen,
    // dass die Mail angesehen wurde)
    try {
      if (hdr.folder?.getFlag(Ci.nsMsgFolderFlags.Junk) || hdr.getStringProperty("junkscore") == "100") {
        return;
      }
    } catch {}
    this.avatars.resolve(email, { name, messageId: hdr.messageId }).then(show);
  }

  requestPreview(win, hdr) {
    const folder = hdr.folder;
    if (!folder) {
      return;
    }
    const id = `${folder.URI}#${hdr.messageKey}`;
    if (this.requested.has(id)) {
      return;
    }
    this.requested.add(id);
    if (!this.pendingPreview.has(folder)) {
      this.pendingPreview.set(folder, []);
    }
    this.pendingPreview.get(folder).push(hdr);
    this.stats.quick++;
    if (!this.previewTimer) {
      // Modul-Timer: ein Fenster-Timer verfällt, wenn der Tab/das Fenster vorher geschlossen wird
      this.previewTimer = setTimeout(() => this.flushPreviews(), 150);
    }
  }

  // Nachladen ruht, solange die Liste scrollt: Treffer der Suche kommen aus vielen
  // Ordnern, bei IMAP ohne gespeicherte Vorschau – Abrufen und Einsetzen
  // während des Scrollens ließen es stark ruckeln
  scrollingRecently() {
    return Date.now() - (this.lastListScroll || 0) < 250;
  }

  flushPreviews() {
    this.previewTimer = null;
    if (this.scrollingRecently()) {
      this.stats.deferred = (this.stats.deferred || 0) + 1;
      this.previewTimer = setTimeout(() => this.flushPreviews(), 250);
      return;
    }
    const batches = [...this.pendingPreview];
    this.pendingPreview.clear();
    for (const [folder, hdrs] of batches) {
      // Schritt 2: was danach noch leer ist (z. B. HTML-Mails, deren erste
      // 2 KB nur aus <head>/<style> bestehen), aus der ganzen Nachricht holen.
      const afterQuick = () => {
        this.refreshPreviews();
        for (const hdr of hdrs) {
          if (!cleanPreview(hdr.getStringProperty("preview"))) {
            this.fullQueue.push(hdr);
          }
        }
        this.pumpFull();
      };
      const listener = {
        QueryInterface: ChromeUtils.generateQI(["nsIUrlListener"]),
        OnStartRunningUrl() {},
        OnStopRunningUrl: () => afterQuick(),
      };
      try {
        // Schritt 1: Thunderbirds eigene, schnelle Vorschau (Anfang der Mail)
        const async = folder.fetchMsgPreviewText(
          hdrs.map(h => h.messageKey),
          listener
        );
        if (!async) {
          afterQuick();
        }
      } catch (e) {
        // bekannt und harmlos: Größe im Ordner stimmt nicht mit der Mail überein –
        // dann fehlt nur der Vorschautext
        if (e?.result == 0x80550023) {
          debugLog("quick preview skipped (unexpected size)");
        } else {
          log("quick preview error", e);
        }
        afterQuick();
      }
    }
  }

  pumpFull() {
    if (this.scrollingRecently() && this.fullQueue.length) {
      clearTimeout(this.fullTimer);
      this.fullTimer = setTimeout(() => this.pumpFull(), 250);
      return;
    }
    while (this.fullActive < 2 && this.fullQueue.length) {
      const hdr = this.fullQueue.shift();
      if (cleanPreview(hdr.getStringProperty("preview"))) {
        continue;
      }
      this.fullActive++;
      let done = false;
      const finish = () => {
        if (done) {
          return;
        }
        done = true;
        this.fullActive--;
        this.refreshPreviews();
        this.pumpFull();
      };
      setTimeout(finish, 20000);
      try {
        MsgHdrToMimeMessage(
          hdr,
          null,
          (msgHdr, mime) => {
            try {
              const text = mime
                ? cleanPreview(mime.coerceBodyToPlaintext(msgHdr.folder))
                : "";
              if (text) {
                // dauerhaft speichern – Thunderbird nutzt dieselbe Eigenschaft
                msgHdr.setStringProperty("preview", text);
              }
              this.stats.full[text ? "ok" : mime ? "empty" : "nomime"]++;
            } catch (e) {
              log("preview parse error", e);
            }
            finish();
          },
          // nur aus der lokalen Kopie lesen – sonst würde für jede Vorschau
          // die ganze Mail vom Server geladen (IMAP ohne Offline-Kopie, Exchange)
          (() => {
            try {
              const folder = hdr.folder;
              return folder.server.type == "none" || folder.server.type == "pop3" || folder.server.type == "rss" ||
                folder.getFlag(Ci.nsMsgFolderFlags.Offline);
            } catch {
              return false;
            }
          })(),
          { saneBodySize: true, examineEncryptedParts: false }
        );
      } catch (e) {
        this.stats.full.error++;
        if (this.stats.full.error < 5) {
          log("full fetch error", e);
        }
        finish();
      }
    }
    if (!this.fullActive && !this.fullQueue.length && !this.statsLogged) {
      this.statsLogged = true;
      setTimeout(() => {
        log("preview stats", this.stats);
        this.statsLogged = false;
      }, 3000);
    }
  }

  // gebündelt: viele Rückmeldungen kurz hintereinander durchlaufen die Zeilen nur einmal
  refreshPreviews() {
    if (this.refreshTimer) {
      return;
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      this.refreshPreviewsNow();
    }, 60);
  }

  refreshPreviewsNow() {
    for (const win of this.windows) {
      if (win.closed) {
        continue;
      }
      for (const row of win.document.querySelectorAll(
        '#threadTree tr[is="thread-card"]'
      )) {
        const preview = row.querySelector(".mc-preview");
        if (!preview || preview.textContent) {
          continue;
        }
        try {
          const hdr = this.hdrForRow(row);
          preview.textContent = cleanPreview(hdr?.getStringProperty("preview"));
          this.markSearchHits(win, row);
        } catch {}
      }
    }
  }
}

// ---------------------------------------------------------------------------
// WebExtension-Experiment
// ---------------------------------------------------------------------------

// Einstellungen der Optionsseite: Schlüssel → Pref (Typ), nur diese sind erlaubt
// (Vorschauzeilen: Menü Ansicht, Geburtstage: Häkchen in der Kalenderliste)
const SETTINGS = {
  unreadTint: [UNREAD_TINT_PREF, "bool", false],
  earlyTheme: [EARLY_THEME_PREF, "bool", false],
  inlinePrompts: [INLINE_PROMPTS_PREF, "bool", true],
  composeFormatBar: [COMPOSE_FORMAT_PREF, "bool", false],
  fullConversation: [CONVERSATION_PREF, "bool", true],
  calendarEmoji: [EMOJI_PREF, "bool", true],
  emojiCustom: [EMOJI_CUSTOM_PREF, "string", ""],
  macContactPhotos: [MAC_PHOTOS_PREF, "bool", false],
  senderLogos: [SENDER_LOGOS_PREF, "bool", true],
  plainTextSystemFont: [PLAIN_TEXT_PREF, "bool", true],
  autoUpdate: [AUTO_UPDATE_PREF, "bool", true],
  hideCollectedAddresses: [HIDE_COLLECTED_PREF, "bool", true],
  calendarOffline: ["extensions.mailcards.calendarOffline", "bool", false],
  appleIcons: ["extensions.mailcards.appleIcons", "bool", true],
  bundledTheme: ["extensions.mailcards.bundledTheme", "bool", true],
  debug: ["extensions.mailcards.debug", "bool", false],
  // Thunderbirds eigene Umfärbung von HTML-Mails im Dunkelmodus (ab Thunderbird 13x);
  // ihr Schalter im Mailkopf ist ausgeblendet, eingestellt wird hier wie in Apple Mail
  darkMessages: ["mail.dark-reader.enabled", "bool", true],
  undoSend: [UNDO_SEND_PREF, "int", 10],
  weather: [WEATHER_PREF, "bool", false],
  weatherPlace: [WEATHER_PLACE_PREF, "string", ""],
  fifthSpace: [FIFTH_PREF, "string", "chat"],
  fifthSpaceAddon: [FIFTH_ADDON_PREF, "string", ""],
  fifthSpaceUrl: [FIFTH_URL_PREF, "string", ""],
  fifthSpaceIcon: [FIFTH_ICON_PREF, "string", "mask"],
};
// Voraussetzungen einzelner Optionen (needs in options/sections.js)
function settingNeeds() {
  return { darkReader: Services.prefs.getPrefType("mail.dark-reader.enabled") != Services.prefs.PREF_INVALID };
}
function readSetting([pref, type, def]) {
  if (type == "bool") return Services.prefs.getBoolPref(pref, def);
  if (type == "int") return Services.prefs.getIntPref(pref, def);
  return Services.prefs.getStringPref(pref, def);
}

var enhancer = null;
var extensionRoot = null; // rootURI der Erweiterung, für resource://mailcards/
var extensionVersion = ""; // hängt an den Stylesheet-Adressen, damit ein Update sofort greift
var extensionBaseURL = ""; // moz-extension://…/ – für die eingebettete Einstellungsseite

this.mailCards = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    return {
      mailCards: {
        // Übersetzungstabelle für die Einstellungsseite (Schlüssel = englischer Text)
        async getTranslations() {
          const lang = uiLanguage();
          return { lang, table: TRANSLATIONS[lang] || {} };
        },
        async getSettings() {
          const out = { mac: Services.appinfo.OS == "Darwin", german: Services.locale.appLocaleAsBCP47.startsWith("de"), ...settingNeeds() };
          for (const [key, spec] of Object.entries(SETTINGS)) {
            out[key] = readSetting(spec);
          }
          // fünfter Bereich: Bereiche fremder Erweiterungen zur Auswahl
          out.fifthSpaceAddons = FifthSpace.addonSpaces(Services.wm.getMostRecentWindow("mail:3pane"))
            .map(a => ({ value: a.name, label: a.title }));
          // wie im Hilfe-Fenster: eingerichtete Fotos gelten auch ohne Pref als an
          out.macContactPhotos = await MacPhotos.enabled();
          // Wetter: Ort und Zustand für die Zeile unter dem Ortsfeld
          const ws = Weather.state();
          out.weatherStatus = !out.weather ? "" : ws.status == "ok"
            ? (ws.place || tr("Current location")) + (ws.temp != null ? ` · ${Math.round(ws.temp)} °C` : "")
            : ws.status == "denied" ? tr("Location access is off. Allow it in System Settings or enter a city.")
            : ws.status == "unavailable" ? tr("Location unavailable. Enter a city.")
            : ws.status == "notfound" ? tr("City not found") : "";
          return out;
        },
        // Wetter: Ortsvorschläge beim Tippen und gewählten Ort übernehmen
        async searchPlaces(text) {
          return Weather.search(Services.wm.getMostRecentWindow("mail:3pane"), text);
        },
        async choosePlace(place) {
          await Weather.choose(place);
        },
        async setSetting(key, value) {
          const spec = SETTINGS[key];
          if (!spec) {
            throw new Error(`unknown setting ${key}`);
          }
          const [pref, type, def] = spec;
          // fünfter Bereich: nur bekannte Werte, Adresse nur http(s)
          if (key == "fifthSpace" && !FIFTH_CHOICES.includes(value)) throw new Error("not a choice");
          if (key == "fifthSpaceIcon" && !FIFTH_ICONS.includes(value)) throw new Error("not a choice");
          if (key == "fifthSpaceUrl") {
            const url = FifthSpace.normalizeURL(value);
            if (url === null) throw new Error("not a web address");
            value = url;
          }
          // Kontaktfotos immer ausdrücklich speichern: ohne Wert gälten sie als
          // an, sobald es mail-cards-photos/index.json gibt (MacPhotos.enabled)
          if ((value === null || value === def) && key != "macContactPhotos") {
            Services.prefs.clearUserPref(pref); // Standard: nichts im Profil speichern
          } else if (type == "bool") {
            Services.prefs.setBoolPref(pref, !!value);
          } else if (type == "int") {
            const n = Math.round(Number(value));
            if (!Number.isFinite(n)) throw new Error("not a number");
            if (key == "undoSend") {
              if (!UNDO_SEND_CHOICES.includes(n)) throw new Error("not a choice");
              Services.prefs.setIntPref(pref, n);
            } else {
              Services.prefs.setIntPref(pref, Math.max(0, Math.min(4, n)));
            }
          } else {
            Services.prefs.setStringPref(pref, String(value).slice(0, 10000));
          }
          if (key == "weather" || key == "weatherPlace") {
            await Weather.refresh(true); // Zeile unter dem Ortsfeld gleich mit Ergebnis
          }
          if (key == "macContactPhotos") {
            if (value) {
              MacPhotos.sync();
            } else {
              // sofort keine Fotos mehr zeigen
              MacPhotos.byEmail.clear();
              MacPhotos.byName.clear();
              MacPhotos.version++;
              MacPhotos.listeners.forEach(fn => fn());
            }
          }
          return readSetting(spec);
        },
        async start(options) {
          extensionRoot ||= context.extension.rootURI;
          extensionVersion ||= context.extension.version;
          extensionBaseURL ||= context.extension.baseURL;
          if (enhancer) {
            return;
          }
          log("start", options || {}, Services.appinfo.version);
          enhancer = new CardEnhancer(options || {});
          enhancer.start();
        },
      },
    };
  }

  // Start direkt beim Programmstart („events: startup“ im Manifest) – ohne
  // Umweg über die Hintergrundseite. Thunderbird kann nach Updates eine
  // veraltete Hintergrundseite aus dem Zwischenspeicher laden; dann würde
  // background.js nie laufen. Die Hintergrundseite ist nur noch Reserve.
  onStartup() {
    if (enhancer) {
      return;
    }
    extensionRoot = this.extension.rootURI;
    extensionVersion = this.extension.version;
    extensionBaseURL = this.extension.baseURL;
    log("start (onStartup)", { version: this.extension.version }, Services.appinfo.version);
    enhancer = new CardEnhancer({});
    enhancer.start();
  }

  onShutdown(isAppShutdown) {
    if (isAppShutdown) {
      return;
    }
    enhancer?.stop();
    enhancer = null;
  }
};
