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
  "Archive": "Archivieren",
  "At time of event": "Zum Termin",
  "Automatic (like macOS)": "Automatisch (wie macOS)",
  "Birthdays": "Geburtstage",
  "Busy": "Beschäftigt",
  "Cancel": "Abbrechen",
  "Checking for updates …": "Suche nach Updates …",
  "Dark": "Dunkel",
  "Delete": "Löschen",
  "Due": "Fällig",
  "Emojis in Calendar: on": "Emojis im Kalender: an",
  "en": "de",
  "Ends": "Ende",
  "Event": "Termin",
  "Every Day": "Täglich",
  "Every Month": "Monatlich",
  "Every Week": "Wöchentlich",
  "Every Year": "Jährlich",
  "Flag": "Markieren",
  "Free": "Frei",
  "halo.spaces is up to date": "halo.spaces ist aktuell",
  "Hide Sidebar": "Seitenleiste ausblenden",
  "Hide Spaces": "Bereiche ausblenden",
  "Hide Today Pane": "Heute-Leiste ausblenden",
  "Installation failed": "Installation fehlgeschlagen",
  "Installed – active in a moment": "Installiert – wird gleich aktiv",
  "Installing …": "Wird installiert …",
  "Light": "Hell",
  "Light, dark or follow macOS": "Hell, dunkel oder wie macOS",
  "Merge Duplicate Contacts": "Doppelte Kontakte zusammenführen",
  "Message List Display Options": "Darstellung der Liste",
  "More Options…": "Mehr Optionen …",
  "Never": "Nie",
  "New Event": "Neuer Termin",
  "New Task": "Neue Aufgabe",
  "Next Month": "Nächster Monat",
  "No calendar for tasks": "Kein Kalender für Aufgaben",
  "No connection – try again": "Keine Verbindung – erneut versuchen",
  "No Due Date": "Kein Fälligkeitsdatum",
  "No writable calendar": "Kein beschreibbarer Kalender",
  "None": "Keine",
  "none – allow access in System Settings": "keine – Zugriff in den Systemeinstellungen erlauben",
  "Photos from Contacts: on": "Fotos aus Kontakte: an",
  "Previous Month": "Voriger Monat",
  "Quick Filter": "Schnellfilter",
  "Reading contacts …": "Kontakte werden gelesen …",
  "Repeat": "Wiederholen",
  "Show As": "Anzeigen als",
  "Show Emojis in Calendar": "Emojis im Kalender zeigen",
  "Show Names As": "Namen anzeigen als",
  "Show Sidebar": "Seitenleiste einblenden",
  "Show Spaces": "Bereiche einblenden",
  "Show Today Pane": "Heute-Leiste einblenden",
  "Sort": "Sortieren",
  "Starts": "Beginn",
  "Task": "Aufgabe",
  "Use photos from Contacts": "Fotos aus Kontakte verwenden",
  "View": "Ansicht",
  "Preview lines in the message list": "Vorschauzeilen in der Mailliste",
  "takes effect after a restart": "gilt nach einem Neustart",
  "Actions when hovering a message": "Aktionen beim Überfahren einer Mail",
  "Flag, archive, delete": "Markieren, Archivieren, Löschen",
  "Message list width": "Breite der Mailliste",
  "pixels; double-click the divider to reset": "Pixel; Doppelklick auf die Trennlinie setzt sie zurück",
  "Logos from sender websites": "Logos von Absender-Websites",
  "asks only the sender’s own website (favicon, BIMI) – off: no outside requests": "fragt nur die Website des Absenders (Favicon, BIMI) – aus: keine Anfragen nach außen",
  "Photos from the Contacts app": "Fotos aus der Kontakte-App",
  "macOS asks for access once": "macOS fragt einmal nach dem Zugriff",
  "Plain-text messages in system font": "Textmails in Systemschrift",
  "off: fixed-width font, e.g. for tables made of spaces": "aus: Schreibmaschinenschrift, z. B. für Tabellen aus Leerzeichen",
  "Merge duplicate contacts": "Doppelte Kontakte zusammenführen",
  "display only": "nur in der Anzeige",
  "Calendar": "Kalender",
  "Emojis before event titles": "Emojis vor Termintiteln",
  "🎂 birthday, 🏋️ training, 🦷 dentist …": "🎂 Geburtstag, 🏋️ Training, 🦷 Zahnarzt …",
  "Own keywords": "Eigene Stichwörter",
  "one per line, “keyword = emoji”, e.g. “Book club = 📖” – take precedence": "je Zeile „Stichwort = Emoji“, z. B. „Hellas Kagran = ⚽“ – haben Vorrang",
  "Book club = 📖\nChoir = 🎶": "Hellas Kagran = ⚽\nChor = 🎶",
  "Birthdays from the address book": "Geburtstage aus dem Adressbuch",
  "separate read-only calendar": "eigener, schreibgeschützter Kalender",
  "Offline copy for online calendars": "Offline-Kopie für Online-Kalender",
  "faster loading; re-creates the calendars once": "schnelleres Laden; legt die Kalender einmal neu an",
  "halo.spaces design": "Design von halo.spaces",
  "Own icons": "Eigene Symbole",
  "Troubleshooting": "Fehlersuche",
  "Detailed log": "Ausführliches Protokoll",
  "mail-cards-debug.log in the profile, includes sender addresses": "mail-cards-debug.log im Profil, auch mit Absenderadressen",
  "saved": "gesichert",
  "halo.spaces – Settings": "halo.spaces – Einstellungen",
  "Default": "Standard",
  "Check for Updates": "Nach Updates suchen",
  "Settings…": "Einstellungen …",
  "Send Feedback": "Feedback senden",
  "Say Thanks": "Danke sagen",
  "halo.spaces is made for macOS – on Windows and Linux it is still being tested. If something looks odd, we'd love a quick note!": "halo.spaces ist für macOS gemacht – unter Windows und Linux wird es gerade erst erprobt. Wenn etwas komisch aussieht, freuen wir uns über eine kurze Rückmeldung!",
  "This message is from a mailing list.": "Diese Nachricht stammt von einem Verteiler.",
  "Unsubscribe": "Abmelden",
  "Unsubscribed": "Abgemeldet",
  "Unsubscribe from messages from {name}?": "Keine Nachrichten mehr von {name} erhalten?",
  "The sender will be told directly that you no longer want these messages.": "Der Absender erfährt direkt, dass du diese Nachrichten nicht mehr möchtest.",
  "Close": "Schließen",
  "More name fields": "Weitere Namensfelder",
  "Fewer name fields": "Weniger Namensfelder",
  "More fields": "Weitere Felder",
  "Fewer fields": "Weniger Felder",
  "Install updates at start": "Updates beim Start installieren",
  "checks at most every 6 hours; active after a restart": "prüft höchstens alle 6 Stunden; aktiv nach einem Neustart",
  "Messages in system font": "Mails in Systemschrift",
  "like Apple Mail; messages with their own font keep it – off: Thunderbird’s fonts": "wie Apple Mail; Mails mit eigener Schrift behalten sie – aus: Thunderbirds Schriften",
  "Yesterday": "Gestern",
  "No Tasks": "Keine Aufgaben",
  "Tasks you add appear here.": "Neue Aufgaben erscheinen hier.",
  "No Task List Selected": "Keine Aufgabenliste ausgewählt",
  "Choose a calendar that supports tasks in the sidebar.": "Wähle links einen Kalender, der Aufgaben unterstützt.",
  "Searching": "Suche",
  "All Mailboxes": "Alle Postfächer",
  "{n} result": "{n} Treffer",
  "{n} results": "{n} Treffer",
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
  "Archive": "Archiver",
  "At time of event": "À l’heure de l’événement",
  "Automatic (like macOS)": "Automatique (comme macOS)",
  "Birthdays": "Anniversaires",
  "Busy": "Occupé",
  "Cancel": "Annuler",
  "Checking for updates …": "Recherche de mises à jour …",
  "Dark": "Sombre",
  "Delete": "Supprimer",
  "Due": "Échéance",
  "Emojis in Calendar: on": "Emojis dans le calendrier : activés",
  "Ends": "Fin",
  "Event": "Événement",
  "Every Day": "Tous les jours",
  "Every Month": "Tous les mois",
  "Every Week": "Toutes les semaines",
  "Every Year": "Tous les ans",
  "Flag": "Marquer",
  "Free": "Disponible",
  "halo.spaces is up to date": "halo.spaces est à jour",
  "Hide Sidebar": "Masquer la barre latérale",
  "Hide Spaces": "Masquer les espaces",
  "Hide Today Pane": "Masquer le volet Aujourd’hui",
  "Installation failed": "Échec de l’installation",
  "Installed – active in a moment": "Installé – actif dans un instant",
  "Installing …": "Installation …",
  "Light": "Clair",
  "Light, dark or follow macOS": "Clair, sombre ou comme macOS",
  "Merge Duplicate Contacts": "Fusionner les contacts en double",
  "Message List Display Options": "Options d’affichage de la liste",
  "More Options…": "Plus d’options…",
  "Never": "Jamais",
  "New Event": "Nouvel événement",
  "New Task": "Nouvelle tâche",
  "Next Month": "Mois suivant",
  "No calendar for tasks": "Aucun calendrier pour les tâches",
  "No connection – try again": "Pas de connexion – réessayer",
  "No Due Date": "Sans échéance",
  "No writable calendar": "Aucun calendrier modifiable",
  "None": "Aucune",
  "none – allow access in System Settings": "aucune – autoriser l’accès dans les Réglages Système",
  "Photos from Contacts: on": "Photos de Contacts : activées",
  "Previous Month": "Mois précédent",
  "Quick Filter": "Filtre rapide",
  "Reading contacts …": "Lecture des contacts …",
  "Repeat": "Répéter",
  "Show As": "Afficher comme",
  "Show Emojis in Calendar": "Afficher les emojis dans le calendrier",
  "Show Names As": "Afficher les noms",
  "Show Sidebar": "Afficher la barre latérale",
  "Show Spaces": "Afficher les espaces",
  "Show Today Pane": "Afficher le volet Aujourd’hui",
  "Sort": "Trier",
  "Starts": "Début",
  "Task": "Tâche",
  "Use photos from Contacts": "Utiliser les photos de Contacts",
  "View": "Présentation",
  "Preview lines in the message list": "Lignes d’aperçu dans la liste",
  "takes effect after a restart": "après un redémarrage",
  "Actions when hovering a message": "Actions au survol d’un message",
  "Flag, archive, delete": "Marquer, archiver, supprimer",
  "Message list width": "Largeur de la liste",
  "pixels; double-click the divider to reset": "pixels ; double-clic sur le séparateur pour réinitialiser",
  "Logos from sender websites": "Logos des sites des expéditeurs",
  "asks only the sender’s own website (favicon, BIMI) – off: no outside requests": "interroge uniquement le site de l’expéditeur (favicon, BIMI) – désactivé : aucune requête externe",
  "Photos from the Contacts app": "Photos de l’app Contacts",
  "macOS asks for access once": "macOS demande l’accès une fois",
  "Plain-text messages in system font": "Messages texte dans la police système",
  "off: fixed-width font, e.g. for tables made of spaces": "désactivé : police à chasse fixe, p. ex. pour les tableaux en espaces",
  "Merge duplicate contacts": "Fusionner les contacts en double",
  "display only": "affichage uniquement",
  "Calendar": "Calendrier",
  "Emojis before event titles": "Emojis devant les titres d’événements",
  "🎂 birthday, 🏋️ training, 🦷 dentist …": "🎂 anniversaire, 🏋️ sport, 🦷 dentiste …",
  "Own keywords": "Mots-clés personnels",
  "one per line, “keyword = emoji”, e.g. “Book club = 📖” – take precedence": "un par ligne, « mot-clé = emoji », p. ex. « Club de lecture = 📖 » – prioritaires",
  "Book club = 📖\nChoir = 🎶": "Club de lecture = 📖\nChorale = 🎶",
  "Birthdays from the address book": "Anniversaires du carnet d’adresses",
  "separate read-only calendar": "calendrier séparé en lecture seule",
  "Offline copy for online calendars": "Copie hors ligne des calendriers en ligne",
  "faster loading; re-creates the calendars once": "chargement plus rapide ; recrée les calendriers une fois",
  "halo.spaces design": "Design halo.spaces",
  "Own icons": "Icônes propres",
  "Troubleshooting": "Dépannage",
  "Detailed log": "Journal détaillé",
  "mail-cards-debug.log in the profile, includes sender addresses": "mail-cards-debug.log dans le profil, avec les adresses des expéditeurs",
  "saved": "enregistré",
  "halo.spaces – Settings": "halo.spaces – Réglages",
  "Default": "Par défaut",
  "Check for Updates": "Rechercher des mises à jour",
  "Settings…": "Réglages…",
  "Send Feedback": "Envoyer un avis",
  "Say Thanks": "Dire merci",
  "halo.spaces is made for macOS – on Windows and Linux it is still being tested. If something looks odd, we'd love a quick note!": "halo.spaces est conçu pour macOS – sous Windows et Linux, il est encore en test. Si quelque chose semble bizarre, un petit mot nous ferait plaisir !",
  "Mail": "Mail",
  "This message is from a mailing list.": "Ce message provient d’une liste de diffusion.",
  "Unsubscribe": "Se désabonner",
  "Unsubscribed": "Désabonné",
  "Unsubscribe from messages from {name}?": "Ne plus recevoir de messages de {name} ?",
  "The sender will be told directly that you no longer want these messages.": "L’expéditeur sera informé directement que vous ne souhaitez plus recevoir ces messages.",
  "Close": "Fermer",
  "More name fields": "Autres champs du nom",
  "Fewer name fields": "Moins de champs du nom",
  "More fields": "Autres champs",
  "Fewer fields": "Moins de champs",
  "Updates": "Mises à jour",
  "Install updates at start": "Installer les mises à jour au démarrage",
  "checks at most every 6 hours; active after a restart": "vérifie au plus toutes les 6 heures ; actif après un redémarrage",
  "Messages in system font": "Messages dans la police système",
  "like Apple Mail; messages with their own font keep it – off: Thunderbird’s fonts": "comme Apple Mail ; les messages avec leur propre police la gardent – désactivé : polices de Thunderbird",
  "Yesterday": "Hier",
  "No Tasks": "Aucune tâche",
  "Tasks you add appear here.": "Les tâches ajoutées apparaissent ici.",
  "No Task List Selected": "Aucune liste de tâches sélectionnée",
  "Choose a calendar that supports tasks in the sidebar.": "Choisissez dans la barre latérale un calendrier qui prend en charge les tâches.",
  "Searching": "Recherche",
  "All Mailboxes": "Toutes les boîtes",
  "{n} result": "{n} résultat",
  "{n} results": "{n} résultats",
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
  "Archive": "Archivar",
  "At time of event": "A la hora del evento",
  "Automatic (like macOS)": "Automático (como macOS)",
  "Birthdays": "Cumpleaños",
  "Busy": "Ocupado",
  "Cancel": "Cancelar",
  "Checking for updates …": "Buscando actualizaciones …",
  "Dark": "Oscuro",
  "Delete": "Eliminar",
  "Due": "Vence",
  "Emojis in Calendar: on": "Emojis en el calendario: activados",
  "Ends": "Termina",
  "Event": "Evento",
  "Every Day": "Cada día",
  "Every Month": "Cada mes",
  "Every Week": "Cada semana",
  "Every Year": "Cada año",
  "Flag": "Marcar",
  "Free": "Libre",
  "halo.spaces is up to date": "halo.spaces está actualizado",
  "Hide Sidebar": "Ocultar barra lateral",
  "Hide Spaces": "Ocultar espacios",
  "Hide Today Pane": "Ocultar panel Hoy",
  "Installation failed": "Error en la instalación",
  "Installed – active in a moment": "Instalado – activo en un momento",
  "Installing …": "Instalando …",
  "Light": "Claro",
  "Light, dark or follow macOS": "Claro, oscuro o como macOS",
  "Merge Duplicate Contacts": "Combinar contactos duplicados",
  "Message List Display Options": "Opciones de vista de la lista",
  "More Options…": "Más opciones…",
  "Never": "Nunca",
  "New Event": "Nuevo evento",
  "New Task": "Nueva tarea",
  "Next Month": "Mes siguiente",
  "No calendar for tasks": "Ningún calendario para tareas",
  "No connection – try again": "Sin conexión – inténtalo de nuevo",
  "No Due Date": "Sin vencimiento",
  "No writable calendar": "Ningún calendario editable",
  "None": "Ninguno",
  "none – allow access in System Settings": "ninguna – permite el acceso en Ajustes del Sistema",
  "Photos from Contacts: on": "Fotos de Contactos: activadas",
  "Previous Month": "Mes anterior",
  "Quick Filter": "Filtro rápido",
  "Reading contacts …": "Leyendo contactos …",
  "Repeat": "Repetir",
  "Show As": "Mostrar como",
  "Show Emojis in Calendar": "Mostrar emojis en el calendario",
  "Show Names As": "Mostrar nombres como",
  "Show Sidebar": "Mostrar barra lateral",
  "Show Spaces": "Mostrar espacios",
  "Show Today Pane": "Mostrar panel Hoy",
  "Sort": "Ordenar",
  "Starts": "Empieza",
  "Task": "Tarea",
  "Use photos from Contacts": "Usar fotos de Contactos",
  "View": "Ver",
  "Preview lines in the message list": "Líneas de vista previa en la lista",
  "takes effect after a restart": "se aplica tras reiniciar",
  "Actions when hovering a message": "Acciones al pasar sobre un mensaje",
  "Flag, archive, delete": "Marcar, archivar, eliminar",
  "Message list width": "Ancho de la lista",
  "pixels; double-click the divider to reset": "píxeles; doble clic en el divisor para restablecer",
  "Logos from sender websites": "Logotipos de los sitios web de los remitentes",
  "asks only the sender’s own website (favicon, BIMI) – off: no outside requests": "solo consulta el sitio web del remitente (favicon, BIMI) – desactivado: ninguna petición externa",
  "Photos from the Contacts app": "Fotos de la app Contactos",
  "macOS asks for access once": "macOS pide acceso una vez",
  "Plain-text messages in system font": "Mensajes de texto en la fuente del sistema",
  "off: fixed-width font, e.g. for tables made of spaces": "desactivado: fuente de ancho fijo, p. ej. para tablas con espacios",
  "Merge duplicate contacts": "Combinar contactos duplicados",
  "display only": "solo en la vista",
  "Calendar": "Calendario",
  "Emojis before event titles": "Emojis antes de los títulos de eventos",
  "🎂 birthday, 🏋️ training, 🦷 dentist …": "🎂 cumpleaños, 🏋️ entrenamiento, 🦷 dentista …",
  "Own keywords": "Palabras clave propias",
  "one per line, “keyword = emoji”, e.g. “Book club = 📖” – take precedence": "uno por línea, «palabra = emoji», p. ej. «Club de lectura = 📖» – tienen prioridad",
  "Book club = 📖\nChoir = 🎶": "Club de lectura = 📖\nCoro = 🎶",
  "Birthdays from the address book": "Cumpleaños de la libreta de direcciones",
  "separate read-only calendar": "calendario aparte de solo lectura",
  "Offline copy for online calendars": "Copia sin conexión de calendarios en línea",
  "faster loading; re-creates the calendars once": "carga más rápida; vuelve a crear los calendarios una vez",
  "halo.spaces design": "Diseño de halo.spaces",
  "Own icons": "Iconos propios",
  "Troubleshooting": "Solución de problemas",
  "Detailed log": "Registro detallado",
  "mail-cards-debug.log in the profile, includes sender addresses": "mail-cards-debug.log en el perfil, incluye direcciones de remitentes",
  "saved": "guardado",
  "halo.spaces – Settings": "halo.spaces – Ajustes",
  "Default": "Predeterminado",
  "Check for Updates": "Buscar actualizaciones",
  "Settings…": "Ajustes…",
  "Send Feedback": "Enviar comentarios",
  "Say Thanks": "Dar las gracias",
  "halo.spaces is made for macOS – on Windows and Linux it is still being tested. If something looks odd, we'd love a quick note!": "halo.spaces está hecho para macOS – en Windows y Linux aún se está probando. Si algo se ve raro, ¡nos encantaría que nos avisaras!",
  "Mail": "Correo",
  "This message is from a mailing list.": "Este mensaje procede de una lista de correo.",
  "Unsubscribe": "Darse de baja",
  "Unsubscribed": "Baja confirmada",
  "Unsubscribe from messages from {name}?": "¿Dejar de recibir mensajes de {name}?",
  "The sender will be told directly that you no longer want these messages.": "Se informará directamente al remitente de que ya no quieres estos mensajes.",
  "Close": "Cerrar",
  "More name fields": "Más campos de nombre",
  "Fewer name fields": "Menos campos de nombre",
  "More fields": "Más campos",
  "Fewer fields": "Menos campos",
  "Updates": "Actualizaciones",
  "Install updates at start": "Instalar actualizaciones al iniciar",
  "checks at most every 6 hours; active after a restart": "comprueba como máximo cada 6 horas; activo tras reiniciar",
  "Messages in system font": "Mensajes en la fuente del sistema",
  "like Apple Mail; messages with their own font keep it – off: Thunderbird’s fonts": "como Apple Mail; los mensajes con su propia fuente la conservan – desactivado: fuentes de Thunderbird",
  "Yesterday": "Ayer",
  "No Tasks": "No hay tareas",
  "Tasks you add appear here.": "Las tareas que añadas aparecerán aquí.",
  "No Task List Selected": "No hay ninguna lista de tareas seleccionada",
  "Choose a calendar that supports tasks in the sidebar.": "Elige en la barra lateral un calendario que admita tareas.",
  "Searching": "Buscando",
  "All Mailboxes": "Todos los buzones",
  "{n} result": "{n} resultado",
  "{n} results": "{n} resultados",
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
  "Archive": "Archivia",
  "At time of event": "All’ora dell’evento",
  "Automatic (like macOS)": "Automatico (come macOS)",
  "Birthdays": "Compleanni",
  "Busy": "Occupato",
  "Cancel": "Annulla",
  "Checking for updates …": "Ricerca aggiornamenti …",
  "Dark": "Scuro",
  "Delete": "Elimina",
  "Due": "Scadenza",
  "Emojis in Calendar: on": "Emoji nel calendario: attive",
  "Ends": "Fine",
  "Event": "Evento",
  "Every Day": "Ogni giorno",
  "Every Month": "Ogni mese",
  "Every Week": "Ogni settimana",
  "Every Year": "Ogni anno",
  "Flag": "Contrassegna",
  "Free": "Libero",
  "halo.spaces is up to date": "halo.spaces è aggiornato",
  "Hide Sidebar": "Nascondi barra laterale",
  "Hide Spaces": "Nascondi spazi",
  "Hide Today Pane": "Nascondi pannello Oggi",
  "Installation failed": "Installazione non riuscita",
  "Installed – active in a moment": "Installato – attivo tra un attimo",
  "Installing …": "Installazione …",
  "Light": "Chiaro",
  "Light, dark or follow macOS": "Chiaro, scuro o come macOS",
  "Merge Duplicate Contacts": "Unisci contatti duplicati",
  "Message List Display Options": "Opzioni di visualizzazione dell’elenco",
  "More Options…": "Altre opzioni…",
  "Never": "Mai",
  "New Event": "Nuovo evento",
  "New Task": "Nuova attività",
  "Next Month": "Mese successivo",
  "No calendar for tasks": "Nessun calendario per le attività",
  "No connection – try again": "Nessuna connessione – riprova",
  "No Due Date": "Nessuna scadenza",
  "No writable calendar": "Nessun calendario modificabile",
  "None": "Nessuno",
  "none – allow access in System Settings": "nessuna – consenti l’accesso in Impostazioni di Sistema",
  "Photos from Contacts: on": "Foto da Contatti: attive",
  "Previous Month": "Mese precedente",
  "Quick Filter": "Filtro rapido",
  "Reading contacts …": "Lettura contatti …",
  "Repeat": "Ripeti",
  "Show As": "Mostra come",
  "Show Emojis in Calendar": "Mostra emoji nel calendario",
  "Show Names As": "Mostra nomi come",
  "Show Sidebar": "Mostra barra laterale",
  "Show Spaces": "Mostra spazi",
  "Show Today Pane": "Mostra pannello Oggi",
  "Sort": "Ordina",
  "Starts": "Inizio",
  "Task": "Attività",
  "Use photos from Contacts": "Usa le foto di Contatti",
  "View": "Visualizza",
  "Preview lines in the message list": "Righe di anteprima nell’elenco",
  "takes effect after a restart": "attivo dopo un riavvio",
  "Actions when hovering a message": "Azioni al passaggio su un messaggio",
  "Flag, archive, delete": "Contrassegna, archivia, elimina",
  "Message list width": "Larghezza dell’elenco",
  "pixels; double-click the divider to reset": "pixel; doppio clic sul divisore per ripristinare",
  "Logos from sender websites": "Loghi dai siti dei mittenti",
  "asks only the sender’s own website (favicon, BIMI) – off: no outside requests": "interroga solo il sito del mittente (favicon, BIMI) – disattivato: nessuna richiesta esterna",
  "Photos from the Contacts app": "Foto dall’app Contatti",
  "macOS asks for access once": "macOS chiede l’accesso una volta",
  "Plain-text messages in system font": "Messaggi di testo nel font di sistema",
  "off: fixed-width font, e.g. for tables made of spaces": "disattivato: font a larghezza fissa, ad es. per tabelle fatte di spazi",
  "Merge duplicate contacts": "Unisci contatti duplicati",
  "display only": "solo nella visualizzazione",
  "Calendar": "Calendario",
  "Emojis before event titles": "Emoji prima dei titoli degli eventi",
  "🎂 birthday, 🏋️ training, 🦷 dentist …": "🎂 compleanno, 🏋️ allenamento, 🦷 dentista …",
  "Own keywords": "Parole chiave personali",
  "one per line, “keyword = emoji”, e.g. “Book club = 📖” – take precedence": "uno per riga, «parola = emoji», ad es. «Club del libro = 📖» – hanno la precedenza",
  "Book club = 📖\nChoir = 🎶": "Club del libro = 📖\nCoro = 🎶",
  "Birthdays from the address book": "Compleanni dalla rubrica",
  "separate read-only calendar": "calendario separato di sola lettura",
  "Offline copy for online calendars": "Copia offline dei calendari online",
  "faster loading; re-creates the calendars once": "caricamento più rapido; ricrea i calendari una volta",
  "halo.spaces design": "Design di halo.spaces",
  "Own icons": "Icone proprie",
  "Troubleshooting": "Risoluzione dei problemi",
  "Detailed log": "Registro dettagliato",
  "mail-cards-debug.log in the profile, includes sender addresses": "mail-cards-debug.log nel profilo, include gli indirizzi dei mittenti",
  "saved": "salvato",
  "halo.spaces – Settings": "halo.spaces – Impostazioni",
  "Default": "Predefinito",
  "Check for Updates": "Cerca aggiornamenti",
  "Settings…": "Impostazioni…",
  "Send Feedback": "Invia feedback",
  "Say Thanks": "Dì grazie",
  "halo.spaces is made for macOS – on Windows and Linux it is still being tested. If something looks odd, we'd love a quick note!": "halo.spaces è fatto per macOS – su Windows e Linux è ancora in prova. Se qualcosa sembra strano, ci farebbe piacere un messaggio!",
  "Mail": "Posta",
  "This message is from a mailing list.": "Questo messaggio proviene da una mailing list.",
  "Unsubscribe": "Annulla iscrizione",
  "Unsubscribed": "Iscrizione annullata",
  "Unsubscribe from messages from {name}?": "Non ricevere più messaggi da {name}?",
  "The sender will be told directly that you no longer want these messages.": "Il mittente verrà informato direttamente che non desideri più questi messaggi.",
  "Close": "Chiudi",
  "More name fields": "Altri campi del nome",
  "Fewer name fields": "Meno campi del nome",
  "More fields": "Altri campi",
  "Fewer fields": "Meno campi",
  "Updates": "Aggiornamenti",
  "Install updates at start": "Installa gli aggiornamenti all’avvio",
  "checks at most every 6 hours; active after a restart": "controlla al massimo ogni 6 ore; attivo dopo un riavvio",
  "Messages in system font": "Messaggi nel font di sistema",
  "like Apple Mail; messages with their own font keep it – off: Thunderbird’s fonts": "come Apple Mail; i messaggi con un proprio font lo mantengono – disattivato: font di Thunderbird",
  "Yesterday": "Ieri",
  "No Tasks": "Nessuna attività",
  "Tasks you add appear here.": "Le attività aggiunte appaiono qui.",
  "No Task List Selected": "Nessun elenco attività selezionato",
  "Choose a calendar that supports tasks in the sidebar.": "Scegli nella barra laterale un calendario che supporta le attività.",
  "Searching": "Ricerca",
  "All Mailboxes": "Tutte le caselle",
  "{n} result": "{n} risultato",
  "{n} results": "{n} risultati",
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
  const names = new Set();
  try {
    for (const server of MailServices.accounts.allServers) {
      if (server.type != "none") {
        names.add(server.prettyName); // „Lokale Ordner“ bleibt ohne Farbe
      }
    }
  } catch {}
  const paint = () => {
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
// Adressbuch: kleine Überschrift über der Liste wie „Favoriten“ in der Mail
// und „Kalender“ im Kalender
function hookBooksHeader(cw) {
  const doc = cw.document;
  const books = doc.getElementById("books");
  if (!books || doc.getElementById("mcBooksHeader")) {
    return;
  }
  const header = doc.createElement("div");
  header.id = "mcBooksHeader";
  header.textContent = Services.locale.appLocaleAsBCP47.startsWith("de") ? "Adressbücher" : "Address Books";
  books.before(header);
}

function hookAppearanceChoice(cw) {
  const doc = cw.document;
  const colorGroup = doc.getElementById("colorGroup");
  if (!colorGroup) {
    return;
  }
  const existing = doc.getElementById("mcAppearanceGroup");
  if (existing) {
    // Thunderbird blendet beim Seitenwechsel alles ohne passende Kategorie aus
    existing.setAttribute("data-category", "paneAppearance");
    existing.hidden = colorGroup.hidden;
    return;
  }
  const X = "http://www.w3.org/1999/xhtml";
  const group = doc.createElementNS(X, "fieldset");
  group.id = "mcAppearanceGroup";
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
#threadTree tr[is="thread-card"] .card-container {
  grid-template-columns: 16px 46px minmax(0, 1fr) !important;
  /* Inhalt senkrecht mittig: Thunderbird stapelt ihn sonst oben, und der
     Rest der festen Zeilenhöhe landet unten (bei kompakter Dichte deutlich) */
  align-content: center !important;
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
  padding-inline-start: 4px;
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
#threadTree tr[is="thread-card"].dummy .mc-avatar,
#threadTree tr[is="thread-card"][data-properties~="dummy"] .mc-avatar,
#threadTree tr[is="thread-card"][data-properties~="dummy"] .mc-preview {
  visibility: hidden;
}
/* Aktionen beim Überfahren: rechts unten in der Karte */
#threadTree tr[is="thread-card"] .mc-actions {
  position: absolute;
  inset-inline-end: 8px;
  bottom: 6px;
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
  background: var(--mt-window, Canvas);
  box-shadow: 0 0 0 0.5px var(--mt-pane-line, rgba(0,0,0,.12)), 0 1px 3px rgba(0, 0, 0, 0.12);
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
  z-index: 2;
}
#threadTree tr[is="thread-card"]:hover .mc-actions {
  opacity: 1;
  pointer-events: auto;
}
#threadTree tr[is="thread-card"][data-properties~="dummy"] .mc-actions {
  display: none;
}
#threadTree tr[is="thread-card"] .mc-action {
  appearance: none;
  width: 26px;
  height: 26px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--mt-text-secondary, GrayText) !important;
  display: flex;
  align-items: center;
  justify-content: center;
}
#threadTree tr[is="thread-card"] .mc-action:hover {
  background: var(--mt-control-hover, rgba(0,0,0,.09));
  color: var(--mt-text, CanvasText) !important;
}
#threadTree tr[is="thread-card"] .mc-action::before {
  content: "";
  width: 16px;
  height: 16px;
  background-color: currentColor;
  mask: var(--mi-flag) center / contain no-repeat;
}
#threadTree tr[is="thread-card"] .mc-act-archive::before { mask-image: var(--mi-archive); }
#threadTree tr[is="thread-card"] .mc-act-delete::before { mask-image: var(--mi-trash); }
#threadTree tr[is="thread-card"][data-properties~="flagged"] .mc-act-flag { color: #FF9500 !important; }
#threadTree tr[is="thread-card"] .mc-actions[data-trash] .mc-act-delete { display: none; }
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

// Datum in der Mailliste: heute nur die Uhrzeit, gestern „Gestern“, davor
// immer das ganze Datum (17.10.2026) – kein Wochentag
function appleListDate(ms, now = new Date()) {
  const locale = Services.locale.appLocaleAsBCP47;
  const d = new Date(ms);
  const startOfDay = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (days <= 0) {
    return new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(d);
  }
  if (days == 1) {
    return tr("Yesterday");
  }
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
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
  let year = m[3] ? (m[3].length == 2 ? 2000 + Number(m[3]) : Number(m[3])) : now.getFullYear();
  let date = new Date(year, month - 1, day);
  if (!m[3] && date > now) {
    date = new Date(--year, month - 1, day);
  }
  return date.getMonth() == month - 1 && date.getDate() == day ? date : null;
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

// Netzwerkzugriffe laufen in einer eigenen Sandbox: about:3pane verbietet
// per Content-Security-Policy Verbindungen ins Internet.
let netSandbox = null;
function sandboxFetch() {
  if (!netSandbox) {
    netSandbox = Components.utils.Sandbox(
      Services.scriptSecurityManager.getSystemPrincipal(),
      { wantGlobalProperties: ["fetch"], sandboxName: "mail-cards-net" }
    );
  }
  return netSandbox.fetch;
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

async function fetchWithTimeout(win, url, opts = {}) {
  if (!isPublicHttps(url)) {
    throw new Error("blocked url");
  }
  const request = sandboxFetch()(url, {
    credentials: "omit",
    redirect: "follow",
    ...opts,
  });
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      fetchTimeouts++;
      reject(new Error("timeout"));
    }, FETCH_TIMEOUT);
  });
  const res = await Promise.race([request, timeout]).finally(() => clearTimeout(timer));
  // Umleitungen folgt fetch selbst – das Ziel muss ebenfalls öffentlich sein
  if (res.url && !isPublicHttps(res.url)) {
    throw new Error("blocked redirect");
  }
  return res;
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
function appleFolderTitle(folder) {
  const L = appleLabels();
  const role = folderRole(folder);
  // frisch angelegte Ordner haben noch keinen prettyName (null) – dann name
  const plain = folder.prettyName || folder.localizedName || folder.name;
  if (/^mailbox:\/\/[^/]*smart%20mailboxes\//i.test(folder.URI)) {
    if (role == "Inbox" && !L.native) return L.allInboxes;
    if (role == "SentMail" && !L.native) return L.allSent;
    return plain;
  }
  const name = role && !L.native ? L[role] : plain;
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
        const res = await fetchWithTimeout(win, m[1]);
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
      const res = await fetchWithTimeout(win, home, {
        headers: { Accept: "text/html" },
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
        const res = await fetchWithTimeout(win, url);
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
const HOVER_ACTIONS_PREF = "extensions.mailcards.hoverActions";
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
  ["🩺", { stems: ["arzt", "ärztin", "doctor", "ordination", "therapie", "physio", "untersuchung", "befund"] }],
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
  ["💰", { stems: ["steuer", "finanzamt", "steuerberat"], words: ["bank"] }],
  ["🛒", { stems: ["einkauf", "shopping", "supermarkt"] }],
  ["📦", { stems: ["umzug", "paket", "lieferung"] }],
  ["🚗", { stems: ["werkstatt", "pickerl", "reifenwechsel", "autoservice"], words: ["auto"] }],
  ["🔧", { stems: ["handwerker", "installateur", "reparatur", "elektriker"] }],
  ["🛁", { stems: ["badezimmer"], words: ["bad"] }],
  ["💻", { stems: ["laptop", "computer"] }],
  ["🧹", { stems: ["putzen", "reinigung", "putzfrau"] }],
  ["👶", { stems: ["baby", "kindergarten", "kita"] }],
  ["🐶", { stems: ["hund", "gassi"] }],
].map(([emoji, { stems = [], words = [] }]) => ({
  emoji,
  stems,
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
    if (rule.stems.some(st => lower.includes(st)) || rule.word?.test(text)) {
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
  // relative Tage
  let m = take(new RegExp(`${B}(übermorgen|day after tomorrow)${E}`, "iu"));
  if (m) {
    day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
  } else if ((m = take(new RegExp(`${B}(heute|today|morgen|tomorrow)${E}`, "iu")))) {
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
  if (day && !/\d{4}/.test(m?.[0] || "") && day < new Date(now.getFullYear(), now.getMonth(), now.getDate()) && !/heute|today/i.test(m?.[0] || "")) {
    day.setFullYear(day.getFullYear() + 1);
  }
  // Wochentag (nächstes Vorkommen; „nächsten Montag“ = in der nächsten Woche)
  const dayNames = Object.keys(NL_WEEKDAYS).filter(k => k.length > 3).join("|");
  if (!day && (m = take(new RegExp(`${B}(?:(am|on|nächsten|nächste[rn]?|next)\\s+)?(${dayNames})${E}`, "iu")))) {
    const target = NL_WEEKDAYS[m[2].toLowerCase()];
    let diff = (target - now.getDay() + 7) % 7;
    if (diff == 0 || /^(nächst|next)/i.test(m[1] || "")) {
      diff += diff == 0 ? 7 : 0;
    }
    day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
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
  m = take(new RegExp(`${B}(?:von\\s+|from\\s+|um\\s+|at\\s+)?${T}\\s*(?:-|–|bis|to|until)\\s*${T}\\s*(?:uhr|h)?${E}`, "iu"));
  if (m) {
    startMin = toMinutes(m[1], m[2], m[3] || m[6]);
    endMin = toMinutes(m[4], m[5], m[6]);
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
  // Dauer
  let duration = null;
  if ((m = take(new RegExp(`${B}(?:für|for)\\s+(\\d+(?:[.,]5)?)\\s*(stunden?|std\\.?|hours?|hrs?|h|minuten|min\\.?|minutes?|mins?)${E}`, "iu")))) {
    const n = Number(m[1].replace(",", "."));
    duration = /^m/i.test(m[2]) ? n : n * 60;
  }
  if (day == null && startMin == null && !allDay) {
    return { title: text.trim() };
  }
  // Füllwörter am Rand entfernen („am“, „um“, „on“, „at“)
  const title = rest.replace(new RegExp(`${B}(am|um|on|at|von|from)\\s*$`, "iu"), "")
    .replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").replace(/^[\s,–-]+|[\s,–-]+$/g, "").trim();
  const base = day || new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const result = { title: title || text.trim(), allDay: allDay || (startMin == null && !!day) };
  if (!result.allDay && startMin != null) {
    result.start = new Date(base.getFullYear(), base.getMonth(), base.getDate(), Math.floor(startMin / 60), startMin % 60);
    const end = endMin != null ? endMin : startMin + (duration ?? 60);
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
const THEME_MARKER = "Thunderbird im Stil von Apple Mail";
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
        if (head.includes(THEME_MARKER)) {
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
      /^about:(addressbook|preferences|addons|accountsettings|accountsetup|message|3pane|import|profiling)/.test(url);
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
    for (const browser of top?.document?.querySelectorAll("browser") || []) {
      roots.push(browser.browsingContext);
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
    this.windows = new Set();
    this.restorers = [];
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

  start() {
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
    // Windows/Linux: einmal beim ersten Start sagen, dass halo.spaces für
    // macOS gemacht ist und dort noch erprobt wird
    const NOTE_PREF = "extensions.mailcards.platformNoteShown";
    if (Services.appinfo.OS != "Darwin" && !Services.prefs.getBoolPref(NOTE_PREF, false)) {
      const noteTimer = setTimeout(() => {
        const w = Services.wm.getMostRecentWindow("mail:3pane");
        if (w) {
          Services.prefs.setBoolPref(NOTE_PREF, true);
          this.openHaloWindow(w, { platformNote: true });
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
            dlg.addEventListener("load", () => dlg.setTimeout(() => this.fitSummaryDialog(dlg), 250), { once: true });
          }
          // Termin-/Aufgaben-Fenster: Titel und Beschriftungen ohne Doppelpunkt
          if (url.startsWith("chrome://calendar/content/calendar-event-dialog.xhtml") && doc.defaultView) {
            const dlg = doc.defaultView;
            dlg.addEventListener("load", () => dlg.setTimeout(() => this.tidyEventDialog(dlg), 300), { once: true });
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
    let observed = null;
    const ro = new w.ResizeObserver(() => update());
    const flexElement = () => {
      const tab = tabmail?.currentTabInfo;
      const docs = [tab?.chromeBrowser?.contentDocument, tab?.browser?.contentDocument, d].filter(Boolean);
      for (const doc of docs) {
        for (const id of FLEX) {
          const el = doc.getElementById(id);
          if (el && el.getBoundingClientRect().width > 0) {
            return el;
          }
        }
      }
      return null;
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
        const el = flexElement();
        if (el !== observed) {
          observed && ro.unobserve(observed);
          el && ro.observe(el);
          observed = el;
        }
        if (!el) {
          root.style.removeProperty("min-width");
          return;
        }
        const min = parseFloat(el.ownerDocument.defaultView.getComputedStyle(el).minWidth) || 0;
        const slack = Math.max(0, el.getBoundingClientRect().width - min);
        // nie unter 800 px (dann wäre schon die Toolbar zu eng)
        const value = Math.max(800, Math.round(w.innerWidth - slack));
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

  watchMainWindow(w) {
    if (this.mainWindows.has(w)) {
      return;
    }
    this.mainWindows.add(w);
    this.hookMinWindowWidth(w);
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
        return;
      }
      const inContent = el.ownerDocument != d;
      const shift = inContent ? tab.browser.getBoundingClientRect().left : 0;
      const r = el.getBoundingClientRect();
      const rowLeft = row.getBoundingClientRect().left;
      const right = r.width ? shift + r.right - rowLeft : 0;
      setBarVar(d, "--mc-side-right", `${Math.max(0, Math.round(right))}px`);
      // Wo die Knöpfe beginnen (erster Abstandhalter der Toolbar): im
      // Adressbuch über der Kontaktkarte rechts der Liste – wie in der Mail
      // über der geöffneten Nachricht –, sonst neben der Seitenleiste.
      const content = d.getElementById("unifiedToolbarContent");
      // Bezug: erster Abstandhalter (davor liegen ausgeblendete Knöpfe anderer Bereiche)
      const start = (content?.querySelector(':scope > li[item-id="spacer"]') || content)?.getBoundingClientRect().left ?? rowLeft;
      let edge = shift + (r.width ? r.right : 0) + 12;
      // erste Knöpfe in jedem Bereich an derselben Stelle wie in der Mail
      // (Kalender und Aufgaben: „+“ wie in Apple Kalender gleich rechts der
      // Seitenleiste)
      const ownEdge = tab.mode.name == "calendar" || tab.mode.name == "tasks";
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
          this.restorers.push(() => {
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
            const c = cards?.getBoundingClientRect();
            const b = tab.browser?.getBoundingClientRect();
            // (ohne Wert – beim Loslassen – nur die tatsächliche Größe übernehmen)
            if (typeof size == "number" && c && b) {
              const maxRight = row.getBoundingClientRect().right - toolbarNeed(d);
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
            const c = cards?.getBoundingClientRect();
            const b = tab.browser?.getBoundingClientRect();
            if (c?.width && b) {
              this.mcListWidth = Math.round(c.width);
              this.mcButtonsLeft = b.left + c.right + 6;
              this.mcListPending = true; // die Mail übernimmt die Breite beim nächsten Anzeigen
            }
            updateSideEdge();
          };
          shared.addEventListener("splitter-resizing", onResizing);
          shared.addEventListener("splitter-resized", onResized);
          this.restorers.push(() => {
            shared._updateSize = origUpdate;
            shared.removeEventListener("splitter-resizing", onResizing);
            shared.removeEventListener("splitter-resized", onResized);
            delete shared.__mcHooked;
          });
        }
        // rechte Kante der Kontaktliste dort, wo in der Mail die Mailliste endet –
        // auch bei ausgeblendeter Adressbuchliste (die Liste wird dann breiter)
        const cl = cards?.getBoundingClientRect();
        if (this.mcButtonsLeft && shared && "width" in shared && !shared.__mcDragging && cl &&
            !el.ownerDocument.body.classList.contains("layout-table")) {
          const want = Math.round(this.mcButtonsLeft - 6 - (shift + cl.left));
          if (want >= 160 && Math.abs((shared.width || 0) - want) >= 1) {
            shared.width = want;
          }
        }
        const cr = cards?.getBoundingClientRect();
        if (cr?.width) {
          // Knöpfe nie über der Kontaktliste
          edge = Math.max(this.mcButtonsLeft ? edge : 0, shift + cr.right + 6);
          setBarVar(d, "--mc-ab-list-right", `${Math.round(shift + cr.right - rowLeft)}px`);
        }
      }
      const toggle = d.getElementById("spacesPinnedButton")?.getBoundingClientRect();
      if (toggle?.width) {
        edge = Math.max(edge, toggle.right + 12);
      }
      setBarVar(d, "--mc-tab-offset", `${Math.max(0, Math.round(edge - start))}px`);
      // dieselbe Kante im Fenster und die Toolbar-Zeile – für Leisten, die
      // in diese Zeile verlegt werden (Chat)
      const rr = row.getBoundingClientRect();
      // nur an den Leisten, die in die Toolbar-Zeile verlegt werden
      const rowVar = (name, value) => {
        for (const id of ["chat-view-toolbox", "viewToggle", "task-addition-box"]) {
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
      rowVar("--mc-row-top", `${Math.round(rr.top)}px`);
      rowVar("--mc-row-h", `${Math.round(rr.height)}px`);
      const toggle2 = d.getElementById("viewToggle");
      if (toggle2?.offsetWidth) {
        setVar(toggle2, "--mc-toggle-half", `${Math.ceil(toggle2.offsetWidth / 2)}px`);
        // Suchfeld im Kalender nie unter der mittigen Umschaltung (Windows:
        // Fenstertasten und ≡-Menü nehmen rechts Platz weg)
        const search = d.querySelector('#unifiedToolbarContent > li[item-id="search-bar"]')?.getBoundingClientRect();
        if (search?.width) {
          const tr = toggle2.getBoundingClientRect();
          setBarVar(d, "--mc-cal-search-max", `${Math.max(40, Math.floor(search.right - tr.right - 12))}px`);
        }
      }
    };
    this.restorers.push(() => squeezeToolbar(w.document, () => true));
    this.sideEdgeUpdaters ??= new Set();
    this.sideEdgeUpdaters.add(updateSideEdge);
    const sideRO = new w.ResizeObserver(updateSideEdge);
    for (const id of ["calSidebar", "listPaneBox", "tabmail-container"]) {
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
        img.addEventListener("error", fallback, { once: true });
      }
    };
    const hookAvatars = cw => {
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
        return result;
      };
      Avatar.prototype.__mcFix = true;
      this.restorers.push(() => {
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
          const { card, name, first, last } = info();
          const text = initialOf(name, { firstName: first ?? card?.firstName, lastName: last ?? card?.lastName });
          const url = card && isCompany(card) ? COMPANY_AVATAR : text ? initialsImage(text) : "";
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
        this.restorers.push(() => {
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
        return { card: cw.detailsPane?.currentCard, name: editHeading?.textContent,
          first: val("vcard-n-firstname"), last: val("vcard-n-lastname") };
      });
      if (fixEditPhoto && editHeading) {
        const mo = new cw.MutationObserver(fixEditPhoto);
        mo.observe(editHeading, { childList: true, characterData: true, subtree: true });
        this.restorers.push(() => mo.disconnect());
      }
      // Bearbeiten wie Apple Kontakte: sichtbar sind Vor- und Nachname, E-Mail,
      // Telefon und Adressen; leere seltene Felder erst nach „Weitere Felder“,
      // Präfix, zweiter Vorname, Suffix, Spitzname, Anzeigename nach
      // „Weitere Namensfelder“. Was schon ausgefüllt ist, bleibt immer sichtbar.
      const EditCard = cw.customElements?.get("vcard-edit");
      if (EditCard && !EditCard.prototype.__mcLayout) {
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
        this.restorers.push(() => {
          EditCard.prototype.updateView = origUpdate;
          delete EditCard.prototype.__mcLayout;
          for (const el of cw.document.querySelectorAll(".mc-more-button")) {
            el.remove();
          }
        });
        for (const ve of cw.document.querySelectorAll("vcard-edit")) {
          layout(ve);
        }
      }
      // schon angezeigte Fotos ebenfalls prüfen
      for (const el of cw.document.querySelectorAll("contact-avatar")) {
        fixAvatar(el, () =>
          el.closest(".card-container")?.querySelector(".name")?.textContent ||
          cw.document.getElementById("viewContactName")?.textContent || "");
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
          // in welchen Adressbüchern es diesen Kontakt gibt (für die Labels)
          c.best.mcSources = [...new Set(c.rows.map(r => r.directory?.dirName).filter(Boolean))];
        }
      }
      return rows.filter(r => keep.has(r));
    };
    const hookDedupe = cw => {
      const view = cw.cardsPane?.cardsList?.view;
      const Adapter = view?.constructor;
      if (!Adapter?.prototype?.sortBy || Adapter.prototype.__mcDedupe) {
        return;
      }
      const orig = Adapter.prototype.sortBy;
      Adapter.prototype.sortBy = function (column, direction, resort = false) {
        if (Services.prefs.getBoolPref(DEDUPE_PREF, true) && this._rowMap?.length) {
          const before = this._rowMap.length;
          this._rowMap = dedupeRows(this._rowMap);
          if (this._rowMap.length != before) {
            resort = true;
          }
        }
        return orig.call(this, column, direction, resort);
      };
      Adapter.prototype.__mcDedupe = true;
      this.restorers.push(() => {
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
        this.restorers.push(() => {
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
        this.restorers.push(() => {
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
        this.restorers.push(() => {
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
          return result;
        };
        TableRow.prototype.__mcBooks = true;
        this.restorers.push(() => {
          TableRow.prototype.fillRow = origTableFill;
          delete TableRow.prototype.__mcBooks;
        });
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
        const caption = (label, before) => {
          if (!before) {
            return;
          }
          const c = cw.document.createXULElement("menucaption");
          c.className = "mc-caption";
          c.setAttribute("label", label);
          before.before(c);
          this.restorers.push(() => c.remove());
        };
        caption(tr("Show Names As"), menu.querySelector('menuitem[name="format"]'));
        caption(tr("Sort"), menu.querySelector('menuitem[name="sort"]'));
        caption(tr("View"), menu.querySelector('menuitem[value="addrbook"]'));
      }
      if (menu && !cw.document.getElementById("mcHideDuplicates")) {
        const sep = cw.document.createXULElement("menuseparator");
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
        menu.append(sep, item);
        this.restorers.push(() => {
          sep.remove();
          item.remove();
        });
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
        if (cw && url.startsWith("about:preferences")) {
          try {
            hookAppearanceChoice(cw);
          } catch (e) {
            log("appearance choice error", e);
          }
        }
        if (cw && url.startsWith("about:addressbook")) {
          try {
            hookAvatars(cw);
            hookBooksHeader(cw);
            hookSplitterReset(cw.document);
          } catch (e) {
            log("avatar fix error", e);
          }
          try {
            hookDedupe(cw);
            colorAccountRows(cw.document, this.restorers);
            cacheCardCount(cw.document, this.restorers);
          } catch (e) {
            log("dedupe error", e);
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
      // (noch keine eigene Breite gespeichert: 206 px wie die Ordnerliste in Apple Mail)
      const W = Services.prefs.getIntPref(WIDTH_PREF, 0) || 206;
      const [el, splitter, win] = sidebarFor(tab);
      if (W < 160 || busy(el, win)) {
        return;
      }
      const current = el.getBoundingClientRect().width;
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
      if (!el || el.__mcWidthWatch) {
        return;
      }
      el.__mcWidthWatch = true;
      // Startwert: die Breite der Ordnerliste in der Mail
      if (!Services.prefs.getIntPref(WIDTH_PREF, 0) && tab.mode?.name == "mail3PaneTab") {
        const width = Math.round(el.getBoundingClientRect().width);
        if (width >= 160) {
          Services.prefs.setIntPref(WIDTH_PREF, width);
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
        this.restorers.push(() => splitter.removeEventListener("pointerdown", onDown));
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
      this.restorers.push(() => {
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
    };
    this.sideHidden = () => {
      const { mode, el } = currentSide();
      return el ? !!sideState()[mode] : false;
    };
    this.toggleSpaceSidebar = () => {
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
      const DURATION = 250;
      const curve = cubicBezier(0.25, 0.1, 0.25, 1);
      unCollapse(el, splitter);
      if (show) {
        el.classList.remove("mc-side-hidden");
        splitter?.classList.remove("mc-side-hidden");
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
        updateSideEdge();
        this.sidebarTip?.();
      };
      win.requestAnimationFrame(() => win.requestAnimationFrame(step));
    };

    // Suchfeld oben rechts: im Adressbuch filtert es die Kontakte, in den
    // Aufgaben die Aufgabenliste, in den Einstellungen die Einstellungen (statt der
    // Mail-Volltextsuche) – die Suchfelder in diesen Seiten entfallen.
    const SEARCH_TARGETS = {
      addressBookTab: {
        de: "Kontakte durchsuchen", en: "Search Contacts",
        input: cw => cw?.cardsPane?.searchInput,
        set: (input, text) => input.overrideSearchTerm(text), // löst dort selbst die Suche aus
      },
      tasks: {
        de: "Aufgaben durchsuchen", en: "Search Tasks",
        input: () => w.document.getElementById("task-text-filter-field"),
        set: (input, text) => {
          input.value = text;
          input.dispatchEvent(new w.Event("input", { bubbles: true }));
        },
      },
      // Mail: alle Postfächer (Suchordner), Tippen sucht kurz verzögert
      mail3PaneTab: {
        de: "Alle Postfächer durchsuchen", en: "Search All Mailboxes",
        input: () => ({ value: this.mailSearchTerm || "" }),
        mail: true,
      },
      preferencesTab: {
        de: "Einstellungen durchsuchen", en: "Find in Settings",
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
      const de = Services.locale.appLocaleAsBCP47.startsWith("de");
      if (target) {
        bar.setAttribute("placeholder", de ? target.de : target.en);
        const term = target.input(currentTarget()?.cw)?.value || "";
        bar.overrideSearchTerm?.(term);
      } else {
        bar.removeAttribute("placeholder");
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
          this.restorers.push(() => target.removeEventListener("keydown", onEscape));
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
          this.animateSidebar(ab, splitter);
        }
      } else {
        // in allen anderen Bereichen deren Seitenleiste ein-/ausblenden
        this.toggleSpaceSidebar?.();
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
          text = this.sideHidden?.()
            ? (tr("Show Sidebar"))
            : (tr("Hide Sidebar"));
        }
        button.setAttribute("tooltiptext", text);
      };
      updateTip();
      this.sidebarTip = updateTip; // nach der Animation erneut aufrufen
      button.addEventListener("mouseenter", updateTip);
      this.restorers.push(() => {
        popup?.removeEventListener("popupshowing", blockPopup);
        button.removeEventListener("mousedown", onPress, true);
        button.removeEventListener("keydown", onPress, true);
        button.removeEventListener("mouseenter", updateTip);
        delete button.dataset.mcSidebar;
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
      bar.after(btn); // Geschwister der Leiste, damit CSS ihren Zustand sieht
      this.restorers.push(() => btn.remove());
      // Tooltips der Bereiche nur mit Namen („Mail“ statt „Mail (⌃ 1)“):
      // Thunderbird setzt sie per Fluent aus Titel und Kurzbefehl, auch
      // später noch (Übersetzung läuft verzögert) – also jedes Mal den
      // Titel aus den Fluent-Argumenten übernehmen
      const plainTitle = space => {
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
        this.todayTopSync?.();
      }) : null;
      mo?.observe(panel, { attributes: true, attributeFilter: ["collapsed", "hidden", "collapsedinmodes"] });
      // in die Toolbar-Zeile; darüber reicht die Today-Pane bis ganz oben
      // (#mcTodayTop in ihrer Breite) – wie die Seitenleiste links
      const row = d.getElementById("unifiedToolbarContainer");
      const top = d.createElementNS("http://www.w3.org/1999/xhtml", "div");
      top.id = "mcTodayTop";
      // Überschrift „Today Pane“ oben in der Toolbar-Zeile, neben dem Knopf
      const title = d.createElementNS("http://www.w3.org/1999/xhtml", "span");
      title.id = "mcTodayTitle";
      title.textContent = Services.locale.appLocaleAsBCP47.startsWith("de") ? "Heute-Leiste" : "Today Pane";
      top.append(title);
      row?.prepend(top);
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
        this.openNewPopupBelow?.(plus);
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
        setVar(row, "--mc-row-tail", `${rowTail(d)}px`);
        // neben Knopf und Fensterknöpfen zu wenig Platz: nur die Sonne
        // links Today-Knopf (12 + 40 + 8), rechts „+“ (8 + 40 + 12) und ggf. Fensterknöpfe
        title.toggleAttribute("data-narrow", width - 60 - (60 + caption) < 110);
      };
      this.todayTopSync = sync;
      const ro = panel ? new w.ResizeObserver(sync) : null;
      ro?.observe(panel);
      sync();
      this.restorers.push(() => {
        mo?.disconnect();
        ro?.disconnect();
        btn.remove();
        top.remove();
        row?.style.removeProperty("--mc-tp-w");
        delete this.todayTopSync;
      });
    };

    // Titel und Anzahl über der Mailliste in der Toolbar-Zeile, rechts davon
    // Filter und „…“ in einer Kapsel – wie Apple Mail. Thunderbirds eigene
    // Kopfzeile in der Liste wird per CSS ausgeblendet.
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
      filter.title = tr("Quick Filter");
      const more = el("button", "mc-lh-more");
      more.title = tr("Message List Display Options");
      tools.append(filter, more);
      box.append(text, tools);
      const ab = () => d.getElementById("tabmail")?.currentAbout3Pane;
      filter.addEventListener("click", () => ab()?.goDoCommand("cmd_toggleQuickFilterBar"));
      more.addEventListener("click", () => {
        const cw = abWindow();
        const popup = cw
          ? cw.document.getElementById("sortContext")
          : ab()?.document.getElementById("threadPaneDisplayContext");
        const r = more.getBoundingClientRect();
        popup?.openPopupAtScreen(w.mozInnerScreenX + r.left, w.mozInnerScreenY + r.bottom + 4, false);
      });
      row.append(box);
      this.restorers.push(() => box.remove());
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
          const lr = list.getBoundingClientRect();
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
          more.textContent = tr("+{n} more", { n: hidden });
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
        if (records.some(r => ![...r.addedNodes, ...r.removedNodes].every(n => n.classList?.contains("mc-more")) || r.type == "attributes")) {
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
    // weitergeht (innerhalb einer Wochenzeile); der Titel steht nur im
    // ersten Stück je Woche
    const annotateSpans = root => {
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
        const prefObs = { observe: () => { resetEmojiRules(); annotateEmoji(root); } };
        Services.prefs.addObserver(EMOJI_PREF, prefObs);
        Services.prefs.addObserver(EMOJI_CUSTOM_PREF, prefObs);
        run();
        this.restorers.push(() => {
          mo.disconnect();
          Services.prefs.removeObserver(EMOJI_PREF, prefObs);
          Services.prefs.removeObserver(EMOJI_CUSTOM_PREF, prefObs);
          for (const label of root.querySelectorAll("[data-mc-emoji]")) {
            label.removeAttribute("data-mc-emoji");
          }
          for (const el of root.querySelectorAll("[data-mc-join-l], [data-mc-join-r]")) {
            el.removeAttribute("data-mc-join-l");
            el.removeAttribute("data-mc-join-r");
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
        title.textContent = noList ? tr("No Task List Selected") : tr("No Tasks");
        text.textContent = noList ? tr("Choose a calendar that supports tasks in the sidebar.") : tr("Tasks you add appear here.");
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
      const mo = field ? new w.MutationObserver(later) : null;
      mo?.observe(field, { attributes: true, attributeFilter: ["readonly", "aria-disabled"] });
      update();
      this.restorers.push(() => {
        for (const [name, orig] of wrapped) {
          view[name] = orig;
        }
        tree.removeEventListener("refresh", later);
        mo?.disconnect();
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
      // Popover wie in Apple Kalender: zwei runde Symbole mit Beschriftung
      const popup = d.createXULElement("panel");
      popup.id = "mcNewPopup";
      popup.setAttribute("type", "arrow");
      popup.setAttribute("noautofocus", "true");
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
          this.openQuickCreate(w, command == "calendar_new_todo_command" ? "task" : "event", this.lastNewAnchor);
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
      this.openNewPopupAbove = anchor => {
        if (popup.state == "open" || popup.state == "showing") {
          popup.hidePopup();
          return;
        }
        popup.classList.add("mc-up");
        this.lastNewAnchor = anchor;
        const width = 294; // Breite des Popovers samt Rand für den Schatten
        popup.openPopup(anchor, "before_start", Math.round(anchor.getBoundingClientRect().width / 2 - width / 2), 12);
      };
      // dasselbe Popover unter dem „+“ oben rechts in der Today-Pane
      this.openNewPopupBelow = anchor => {
        if (popup.state == "open" || popup.state == "showing") {
          popup.hidePopup();
          return;
        }
        popup.classList.remove("mc-up");
        this.lastNewAnchor = anchor;
        popup.openPopup(anchor, "after_end", 0, 6);
      };
      const onHidden = () => popup.classList.remove("mc-up");
      popup.addEventListener("popuphidden", onHidden);
      this.restorers.push(() => {
        bar.removeEventListener("click", onClick, true);
        popup.removeEventListener("popuphidden", onHidden);
        popup.remove();
        delete bar.__mcNewHooked;
        delete this.openNewPopupAbove;
        delete this.openNewPopupBelow;
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
      header.dataset.mcTitle = Services.locale.appLocaleAsBCP47.startsWith("de") ? "Heute-Leiste" : "Today Pane";
      const home = button?.parentElement;
      const next = button?.nextSibling;
      // ganz unten in der Today-Pane, unter den Einträgen: ein „+“ wie im
      // Kalender, das nach Termin oder Aufgabe fragt
      const panel = d.getElementById("today-pane-panel");
      const savedCommand = button?.getAttribute("command");
      const onPlus = event => {
        event.preventDefault();
        event.stopPropagation();
        this.openNewPopupAbove?.(button);
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
      hookTitle();
      labelToday();
      hookTodayPaneHeader();
      hookEscape();
      hookSidebarButton();
      hookSpacesToggle();
      hookTodayToggle();
      hookSplitterReset(w.document);
      hookListHeader();
      this.updateListHeader(w);
      this.styleSearch(w);
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
    const style = w.document.createElementNS("http://www.w3.org/1999/xhtml", "style");
    style.id = "mail-cards-search";
    style.textContent = `
      .button { inset-inline-start: 4px !important; inset-inline-end: auto !important; }
      input { padding-inline: 30px 10px !important; }
      div { inset-inline-start: 30px !important; inset-inline-end: 10px !important; }
    `;
    bar.shadowRoot.appendChild(style);

    const placeholder = bar.querySelector('[slot="placeholder"]');
    const l10nId = placeholder?.getAttribute("data-l10n-id");
    if (placeholder) {
      placeholder.removeAttribute("data-l10n-id");
      placeholder.textContent = Services.locale.appLocaleAsBCP47.startsWith("de")
        ? "Suchen"
        : "Search";
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
  animateSidebar(ab, splitter) {
    if (ab.__mcAnimating) {
      return;
    }
    const pane = ab.document.getElementById("folderPane");
    const grid = splitter.parentNode;
    const prop = "--folderPaneSplitter-width";
    const DURATION = 250;
    const curve = cubicBezier(0.25, 0.1, 0.25, 1);
    const collapsing = !splitter.isCollapsed;
    let full;
    if (collapsing) {
      full = pane.getBoundingClientRect().width;
    } else {
      splitter.isCollapsed = false;
      full = pane.getBoundingClientRect().width;
    }
    if (!full) {
      return;
    }
    const saved = grid.style.getPropertyValue(prop);
    const inner = [...pane.children];
    // Inhalt der Ordnerliste behält seine volle Breite und bleibt stehen –
    // er wird nur von rechts her zugedeckt
    inner.forEach(el => (el.style.minWidth = `${full}px`));
    pane.style.overflow = "hidden";
    pane.style.minWidth = "0px"; // Thunderbirds Mindestbreite (100 px) würde die Animation stoppen
    pane.classList.add("mc-side-anim"); // (auch unsere 160 px)
    // Der Teiler fixiert die Ordnerliste beim Ändern der Fenstergröße mit
    // „width: …px !important“ – das hält sonst das Raster fest
    const lockedWidth = pane.style.getPropertyValue("width");
    pane.style.removeProperty("width");
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
      const width = full * shown;
      grid.style.setProperty(prop, `${width}px`);
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
      if (collapsing) {
        splitter.isCollapsed = true; // setzt die Variable selbst auf 0px
      } else if (saved) {
        grid.style.setProperty(prop, saved);
      } else {
        grid.style.removeProperty(prop);
      }
      ab.__mcAnimating = false;
      this.sidebarTip?.();
      ab.setTimeout(() => this.offsetUpdaters?.forEach(fn => fn()), 30);
    };
    // erstes Bild sofort setzen, damit nichts aufblitzt
    if (!collapsing) {
      grid.style.setProperty(prop, "0px");
      pane.getBoundingClientRect(); // Aufbau der Ordnerliste jetzt erzwingen, nicht im ersten Bild
    }
    ab.requestAnimationFrame(() => ab.requestAnimationFrame(step));
  }

  // Titel und Anzahl der Kopfzeile aus dem aktuellen Mail-Tab übernehmen
  updateListHeader(w) {
    const d = w.document;
    const box = d.getElementById("mcListHeader");
    const tab = d.getElementById("tabmail")?.currentTabInfo;
    if (box && tab?.mode?.name == "addressBookTab") {
      this.updateAbHeader(box, tab.browser?.contentWindow);
      return;
    }
    const ab = d.getElementById("tabmail")?.currentAbout3Pane;
    if (!box || !ab?.document) {
      return;
    }
    const title = box.querySelector(".mc-lh-title");
    const count = box.querySelector(".mc-lh-count");
    try {
      const folder = ab.gFolder;
      if (this.isSearchFolder(folder)) {
        // Suche: „Suche“ und „Alle Postfächer, 12 Treffer“ wie Apple Mail
        const n = ab.gDBView?.numMsgsInView || 0;
        title.textContent = tr("Searching");
        count.textContent = tr("All Mailboxes") + ", " +
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
      const update = () => cw.setTimeout(() => this.updateAbHeader(box, cw), 0);
      const search = cw.cardsPane.searchInput;
      books.addEventListener("select", update);
      search?.addEventListener("autocomplete", update);
      const mo = new cw.MutationObserver(update);
      mo.observe(list, { childList: true, subtree: true });
      this.restorers.push(() => {
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
    const DURATION = 250;
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
    const set = v => {
      const px = `${v}px`;
      bar?.style.setProperty("--spaces-total-width", px);
      toggle?.style.setProperty("--spaces-total-width", px);
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
      toggle?.style.removeProperty("--spaces-total-width");
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
      return y ? new Date(y, m - 1, day, hh || 0, mm || 0) : null;
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
        const s = parse(f.startDate.value, f.startTime.value);
        const e = parse(f.endDate.value, f.endTime.value);
        if (s && e && lastStart) {
          const moved = new Date(e.getTime() + (s - lastStart));
          f.endDate.value = dateValue(moved);
          f.endTime.value = timeValue(moved);
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
        const start = r.start || def.start;
        const end = r.end || (r.allDay ? start : new Date(start.getTime() + 3600 * 1000));
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
          f.startDate.value = dateValue(start);
          f.startTime.value = timeValue(r.start && !r.allDay ? start : def.start);
          f.endDate.value = dateValue(allDay ? start : end);
          f.endTime.value = timeValue(r.start && !r.allDay ? end : def.end);
          panel.__mcSetLastStart(parse(f.startDate.value, f.startTime.value));
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
          let s = parse(f.startDate.value, f.allDay.checked ? "00:00" : f.startTime.value) || new Date();
          let e = parse(f.endDate.value, f.allDay.checked ? "00:00" : f.endTime.value);
          if (f.allDay.checked) {
            e = new Date((e || s).getFullYear(), (e || s).getMonth(), (e || s).getDate() + 1);
          } else if (!e || e <= s) {
            e = new Date(s.getTime() + 3600 * 1000);
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
    let start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), now.getHours() + 1, 0);
    if (preset?.start) {
      start = preset.allDay
        ? new Date(preset.start.getFullYear(), preset.start.getMonth(), preset.start.getDate(), now.getHours() + 1, 0)
        : new Date(preset.start);
    }
    const end = new Date(start.getTime() + 3600 * 1000);
    if (preset?.allDay) {
      f.allDay.checked = true;
      root.toggleAttribute("data-allday", true);
    }
    f.startDate.value = dateValue(start);
    f.startTime.value = timeValue(start);
    f.endDate.value = dateValue(end);
    f.endTime.value = timeValue(end);
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
    if (preset?.at) {
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
    // Platz für die Today-Pane in der Toolbar beim Einblenden gleich am Anfang
    // (beim Ausblenden erst am Ende, über todayTopSync) – nicht mittendrin
    if (showing) {
      d.getElementById("unifiedToolbarContainer")?.style.setProperty("--mc-tp-room", `${Math.round(full)}px`);
    }
    const DURATION = 250;
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
      this.todayTopSync?.(value);
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
      this.todayTopSync?.();
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
      const browser = win.browsingContext.embedderElement;
      const row = top.document.getElementById("unifiedToolbarContainer");
      if (!pane || !browser || !row || !win.document.body.classList.contains("layout-vertical")) {
        return 0;
      }
      const msgRight = browser.getBoundingClientRect().left + pane.getBoundingClientRect().right;
      const want = toolbarNeed(top.document, true) - (row.getBoundingClientRect().right - msgRight);
      // die Liste selbst nie schmaler als ihre Mindestbreite (CSS) machen
      const list = threadPane.getBoundingClientRect();
      const listMin = parseFloat(win.getComputedStyle(threadPane).minWidth) || 240;
      const room = pane.getBoundingClientRect().right - list.left - listMin;
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
      const browser = win.browsingContext.embedderElement;
      if (!content || !browser || win.closed || top.__mcSpacesAnimating) {
        return;
      }
      keepListWidth();
      enforceMessageWidth();
      // nur der Mail-Tab, der gerade vorne ist, richtet die Toolbar aus –
      // sonst überschreibt ein zweiter Mail-Tab im Hintergrund die Kanten
      // (auch nicht, solange ein anderer Bereich vorne ist)
      const current = top.document.getElementById("tabmail")?.currentTabInfo;
      if (current?.chromeBrowser != browser) {
        return;
      }
      fixFolderLock();
      // im Adressbuch neu gezogene Listenbreite übernehmen
      if (this.mcListPending && msgSplitter && !msgSplitter.isCollapsed && msgSplitter.resizeElement?.id == "messagePane") {
        const listNow = threadPane.getBoundingClientRect().width;
        const pane = win.document.getElementById("messagePane");
        if (listNow > 1 && this.mcButtonsLeft) {
          this.mcListPending = false;
          // rechte Listenkante auf die im Adressbuch gezogene Stelle
          const browserLeft = win.browsingContext.embedderElement.getBoundingClientRect().left;
          const diff = browserLeft + threadPane.getBoundingClientRect().right - (this.mcButtonsLeft - 6);
          if (Math.abs(diff) >= 1) {
            Services.prefs.setIntPref(LIST_WIDTH_PREF, Math.max(200, Math.round(listNow - diff)));
            msgSplitter.width = Math.max(minMessageWidth(), Math.round(pane.getBoundingClientRect().width + diff));
          }
        }
      }
      // Ohne sichtbare Mailliste (z. B. Kontoübersicht) bleiben die Knöpfe
      // dort, wo sie in der Mailansicht zuletzt standen.
      const listRect = threadPane.getBoundingClientRect();
      const folderRect = win.document.getElementById("folderPane")?.getBoundingClientRect();
      let listRight;
      if (listRect.width > 1) {
        listRight = listRect.right;
        this.lastListRight = listRight - (folderRect?.right || 0); // Breite der Mailliste merken
      } else {
        listRight = (folderRect?.right || 0) + (this.lastListRight ?? 0);
      }
      const paneRight = browser.getBoundingClientRect().left + listRight;
      // für die übrigen Bereiche merken: dort beginnen die Knöpfe an derselben
      // Stelle, und die Kontaktliste im Adressbuch ist so breit wie die Mailliste
      this.mcButtonsLeft = paneRight + 6;
      if (listRect.width > 1) {
        this.mcListWidth = Math.round(listRect.width);
      }
      // Bezug ist der Anfang des ersten Abstandhalters (die Toolbar hat
      // eigenen Innenabstand); +6 px wie der Einzug in Apple Mail.
      const start = (content.querySelector(':scope > li[item-id="spacer"]') || content).getBoundingClientRect().left;
      let offset = Math.max(0, Math.round(paneRight - start + 6));
      // nie links vom Seitenleisten-Knopf beginnen
      const toggle = top.document.getElementById("spacesPinnedButton");
      const tb = toggle?.getBoundingClientRect();
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
        squeezeToolbar(top.document, () => (!firstSpacer || firstSpacer.getBoundingClientRect().right >= start + offset - 2) &&
          (!search || search.getBoundingClientRect().width >= 159));
      }
      // Suchfeld in jedem Bereich gleich breit (333 px wie Apple Mail): fehlt
      // dafür Platz, wird zuerst der Abstand nach „Verfassen“ kleiner (69 → 12 px)
      const write = content.querySelector(':scope > li[item-id="write-message"]');
      const search = content.querySelector(':scope > li[item-id="search-bar"]');
      // (nicht während einer Ein-/Ausblend-Animation – das kostet pro Bild ein
      // komplettes Neuberechnen; am Ende wird einmal gemessen)
      if (!animating && write && search && write.getBoundingClientRect().width) {
        const spacer = search.previousElementSibling;
        const gap = parseFloat(top.getComputedStyle(write).marginInlineEnd) || 0;
        const spare = (spacer?.getAttribute("item-id") == "spacer" ? spacer.getBoundingClientRect().width : 0) -
          (333 - search.getBoundingClientRect().width);
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
        const fr = folderPane.getBoundingClientRect();
        const right = fr.width
          ? browser.getBoundingClientRect().left + fr.right - row.getBoundingClientRect().left
          : 0;
        setBarVar(top.document, "--mc-sidebar-right", `${Math.max(0, Math.round(right))}px`
        );
        // rechte Kante der Mailliste für die Trennlinie in der Toolbar-Zeile
        // Ist das Fenster für alle Knöpfe zu schmal, schrumpft der Einzug davor –
        // die Kopfzeile über der Liste endet dann vor dem ersten Knopf
        const firstSpacer = content.querySelector(':scope > li[item-id="spacer"]');
        const buttonsStart = firstSpacer ? firstSpacer.getBoundingClientRect().right : paneRight;
        const rowLeft = row.getBoundingClientRect().left;
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
          const shift = tabs.getBoundingClientRect().left - row.getBoundingClientRect().left;
          setVar(tabs, "--mc-sidebar-right", `${Math.max(0, Math.round(right - shift))}px`);
          setVar(tabs, "--mc-list-right", `${Math.round((listRight - shift) * dpr) / dpr}px`);
        }
        // Statusleiste ebenso: Seitenleisten-Grau läuft unten bis zum Fensterrand
        const status = top.document.getElementById("status-bar");
        if (status) {
          const shift = status.getBoundingClientRect().left - row.getBoundingClientRect().left;
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
  }

  // Heute-Leiste (Aufgaben/Termine rechts) gehört nicht in den Chat – wie in
  // Apples Nachrichten-App. Einmalig für den Chat-Bereich ausblenden; danach
  // gilt wieder, was man selbst einstellt.
  hideTodayPaneInChatOnce(w) {
    const PREF = "extensions.mailcards.todayPaneChatHidden";
    if (Services.prefs.getBoolPref(PREF, false)) {
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

  // Apple Mail hat über den Postfächern keine eigene Knopfzeile – Abrufen und
  // Verfassen stehen schon in der Toolbar. Einmalig Thunderbirds Kopfzeile der
  // Ordnerliste ausblenden (zurück über ≡ → Ansicht → Ordner); nicht, wenn die
  // eigene Toolbar keinen Verfassen-Knopf hat.
  hideFolderHeaderOnce(win) {
    const PREF = "extensions.mailcards.folderHeaderHidden";
    if (Services.prefs.getBoolPref(PREF, false) || !win.folderPane?.toggleHeader) {
      return;
    }
    try {
      const { getState } = ChromeUtils.importESModule("resource:///modules/CustomizationState.mjs");
      if (getState().mail?.includes("write-message")) {
        win.folderPane.toggleHeader(true);
      }
      Services.prefs.setBoolPref(PREF, true);
    } catch (e) {
      log("folder header error", e);
    }
  }

  // Termin-Details: an den Inhalt anpassen (mindestens 480 px breit, höchstens
  // so groß wie der Bildschirm) und iClouds Platzhalter-Erinnerung ausblenden
  // (Apple legt für Standard-Erinnerungen eine feste vom 1. April 1976 an)
  tidyEventDialog(dlg, tries = 0) {
    try {
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
      fixLabels();
      new dlg.MutationObserver(() => dlg.setTimeout(fixLabels, 0)).observe(idoc.documentElement, {
        subtree: true, attributes: true, attributeFilter: ["value", "label"], childList: true, characterData: true,
      });
    } catch (e) {
      log("event dialog tidy error", String(e).slice(0, 120));
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
        const rest = dlg.innerHeight - list.getBoundingClientRect().height;
        const inner = Math.ceil(rest + content);
        if (Math.abs(inner - dlg.innerHeight) >= 2) {
          dlg.resizeTo(dlg.outerWidth, dlg.outerHeight - dlg.innerHeight + inner);
        }
      };
      fit();
      // Einträge kommen hinzu oder werden erledigt
      new dlg.MutationObserver(() => dlg.setTimeout(fit, 50)).observe(list, { childList: true });
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
      dlg.sizeToContent();
      const maxW = dlg.screen.availWidth - 40;
      const maxH = dlg.screen.availHeight - 40;
      const width = Math.min(maxW, Math.max(480, dlg.outerWidth));
      const height = Math.min(maxH, dlg.outerHeight);
      dlg.resizeTo(width, height);
      // ein zweites Mal, falls der breitere Text weniger Zeilen braucht
      dlg.setTimeout(() => {
        dlg.sizeToContent();
        dlg.resizeTo(Math.min(maxW, Math.max(480, dlg.outerWidth)), Math.min(maxH, dlg.outerHeight));
      }, 50);
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
  async openHaloWindow(w, { platformNote = false } = {}) {
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
      photosEnabled: () => MacPhotos.enabled(),
      emojiEnabled: () => Services.prefs.getBoolPref(EMOJI_PREF, true),
      openSettings: () => w.openAddonsMgr?.(`addons://detail/${encodeURIComponent("mail-cards@sebastian.local")}/preferences`),
      setEmoji: on => Services.prefs.setBoolPref(EMOJI_PREF, on),
      // Fotos aus der Kontakte-App: einschalten und gleich abgleichen
      // (macOS fragt dabei einmal nach dem Zugriff auf die Kontakte)
      setPhotos: async on => {
        Services.prefs.setBoolPref(MAC_PHOTOS_PREF, on);
        if (!on) {
          // sofort keine Fotos mehr zeigen (nicht erst nach dem Neustart)
          MacPhotos.byEmail.clear();
          MacPhotos.byName.clear();
          MacPhotos.version++;
          MacPhotos.listeners.forEach(fn => fn());
          return 0;
        }
        await MacPhotos.sync();
        return MacPhotos.byEmail.size;
      },
      sendFeedback: () => this.sendFeedback(),
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
      `chrome,dialog=yes,centerscreen,resizable=no,width=360,height=${(api.mac ? 438 : 390) + (platformNote ? 64 : 0)}`);
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

  // Texte setzen und Knöpfe verbinden (aus der Erweiterung heraus)
  wireHaloWindow(hw, api) {
    const doc = hw.document;
    const $ = id => doc.getElementById(id);
    doc.documentElement.lang = uiLanguage();
    for (const el of doc.querySelectorAll("[data-l10n-en]")) {
      el.textContent = tr(el.dataset.l10nEn);
    }
    $("version").textContent = `Version ${api.version}`;
    // Windows/Linux: einmaliger Hinweis beim ersten Start
    const note = $("platform-note");
    if (note && api.platformNote) {
      note.textContent = tr("halo.spaces is made for macOS – on Windows and Linux it is still being tested. If something looks odd, we'd love a quick note!");
      note.hidden = false;
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
          label.textContent = tr("Installed – active in a moment");
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
        label.textContent = tr("No connection – try again");
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
    // Mac: Absenderbilder aus der Kontakte-App
    const photos = $("photos");
    if (api.mac && photos) {
      const pLabel = photos.querySelector(".label");
      const pStatus = $("photos-status");
      const show = on => {
        pLabel.textContent = on
          ? tr("Photos from Contacts: on")
          : tr("Use photos from Contacts");
        pStatus.textContent = on ? "✓" : "";
        photos.dataset.on = on ? "1" : "";
      };
      photos.hidden = false;
      api.photosEnabled().then(show);
      photos.addEventListener("click", async () => {
        const on = !photos.dataset.on;
        photos.disabled = true;
        if (on) {
          pLabel.textContent = tr("Reading contacts …");
          pStatus.textContent = "";
        }
        try {
          const count = await api.setPhotos(on);
          show(on);
          if (on) {
            pStatus.textContent = count
              ? `✓ ${count}`
              : tr("none – allow access in System Settings");
          }
        } catch {
          show(false);
        }
        photos.disabled = false;
      });
    }
    // Emojis im Kalender ein/aus (sofort sichtbar)
    const emoji = $("emoji");
    if (emoji) {
      const eLabel = emoji.querySelector(".label");
      const eStatus = $("emoji-status");
      const showEmoji = on => {
        eLabel.textContent = on ? tr("Emojis in Calendar: on") : tr("Show Emojis in Calendar");
        eStatus.textContent = on ? "🎂" : "";
      };
      showEmoji(api.emojiEnabled());
      emoji.addEventListener("click", () => {
        const on = !api.emojiEnabled();
        api.setEmoji(on);
        showEmoji(on);
      });
    }
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
  }

  stop() {
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
    safely("account rows", () => colorAccountRows(doc, this.restorers));
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
    style.textContent =
      CSS +
      `#threadTree tr[is="thread-card"] .mc-preview { -webkit-line-clamp: ${this.previewLines}; min-height: ${this.previewLines * 16}px; }`;
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

    const extra = this.previewLines ? this.previewLines * 16 + 10 : 0;
    const density = async function (...args) {
      await reg.density.apply(this, args);
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
      for (const el of doc.querySelectorAll(".mc-avatar, .mc-preview, .mc-actions")) {
        el.remove();
      }
      threadPane.updateThreadItemSize();
    });

    this.trackToolbarOffset(win);
    this.hideFolderHeaderOnce(win);
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
    // anderen Ordner gewählt, während gesucht wurde: Suchfeld leeren
    const leave = () => {
      if (self.mailSearchTerm && !self.isSearchFolder(win.gFolder)) {
        self.mailSearchTerm = "";
        top.document.querySelector("#unifiedToolbarContent global-search-bar")?.reset?.();
      }
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

    // Lokale Ordner nur zusammenklappen, wenn darin nichts Eigenes liegt
    // (nur leere Standardordner) – POP3-Konten mit globalem Posteingang,
    // Archive oder Filterziele dort bleiben sichtbar
    const localIsEmpty = () => {
      try {
        const root = MailServices.accounts.localFoldersServer?.rootFolder;
        return !root || root.subFolders.every(f => !f.hasSubFolders && f.getTotalMessages(false) == 0);
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
          } else if (folder?.server) {
            setText(label, folder.server.prettyName); // „Google“, „iCloud“
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
      win.folderPane?.activeModes && (win.folderPane.activeModes = win.folderPane.activeModes); // Namen neu aufbauen
    });
  }

  decorate(win, row) {
    const doc = win.document;
    const container = row.querySelector(".card-container");
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
    if (!container.querySelector(":scope > .mc-actions") && Services.prefs.getBoolPref(HOVER_ACTIONS_PREF, false)) {
      container.append(this.hoverActions(win, row));
    }

    if ((row.dataset.properties || "").split(" ").includes("dummy")) {
      return;
    }

    const hdr = this.hdrForRow(row);
    if (!hdr) {
      return;
    }

    const actions = container.querySelector(":scope > .mc-actions");
    if (actions) {
      let trash = false;
      try {
        trash = !!hdr.folder?.getFlag(Ci.nsMsgFolderFlags.Trash);
      } catch {}
      actions.toggleAttribute("data-trash", trash);
    }

    if (preview) {
      const text = cleanPreview(hdr.getStringProperty("preview"));
      preview.textContent = text;
      if (!text) {
        this.requestPreview(win, hdr);
      }
    }

    this.fillAvatar(avatar, hdr);
    this.fillSender(row, hdr);
    const dateEl = row.querySelector(".thread-card-row .date");
    if (dateEl && hdr.date) {
      dateEl.textContent = appleListDate(hdr.date / 1000);
    }
    this.markSearchHits(win, row);
  }

  // Zeigt Thunderbird nur die Adresse des Absenders (kein Name im Kopf),
  // stattdessen den Namen aus der Domain. Im Gesendet-Ordner steht dort der
  // Empfänger – dann bleibt alles, wie es ist.
  fillSender(row, hdr) {
    const el = row.querySelector(".thread-card-row .sender");
    if (!el) {
      return;
    }
    let name = "";
    let email = "";
    try {
      const parsed = MailServices.headerParser.parseDecodedHeader(hdr.mime2DecodedAuthor || hdr.author)[0];
      name = parsed?.name || "";
      email = (parsed?.email || "").toLowerCase();
    } catch {}
    if (!email || !el.textContent.toLowerCase().includes(email)) {
      return;
    }
    const label = senderLabel(name, email);
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

  // alle Postfächer aller Konten – ohne Papierkorb, Spam und Suchordner
  searchScope() {
    const F = Ci.nsMsgFolderFlags;
    return MailServices.accounts.allFolders.filter(f =>
      !f.isServer && !(f.flags & (F.Virtual | F.Trash | F.Junk | F.ImapNoselect)));
  }

  // Begriff in Betreff, Absender, Empfänger oder Text – oder, wenn er wie ein
  // Datum aussieht („12.10“), Mails von diesem Tag
  searchTerms(session, text) {
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
    for (const attrib of [A.Subject, A.Sender, A.ToOrCC, A.Body]) {
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
    try {
      folder ??= this.searchFolder(true);
      const { VirtualFolderHelper } = ChromeUtils.importESModule("resource:///modules/VirtualFolderWrapper.sys.mjs");
      const wrapper = VirtualFolderHelper.wrapVirtualFolder(folder);
      wrapper.searchFolders = this.searchScope();
      wrapper.searchTerms = this.searchTerms(wrapper.searchTermsSession, term);
      wrapper.onlineSearch = false;
      MailServices.accounts.saveVirtualFolders();
      this.mailSearchTerm = term;
      if (this.isSearchFolder(a3.gFolder) && a3.gViewWrapper?.search) {
        // Suche läuft schon: neue Begriffe direkt in die Ansicht
        a3.gViewWrapper.search.virtualFolderTerms = wrapper.searchTerms;
      } else {
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

  // Geburtstage aus dem Adressbuch als eigener Kalender wie bei Apple:
  // nur im Speicher und schreibgeschützt, bei jedem Start und bei Änderungen
  // an Kontakten neu gefüllt; synchronisiert nirgendwohin. Beim Abschalten,
  // Deaktivieren oder Deinstallieren wird er wieder entfernt.
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
    if (!Services.prefs.getBoolPref(BDAY_PREF, true)) {
      this.removeBirthdayCalendar();
      return;
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
        let value = "";
        try {
          value = String(card.vCardProperties?.getFirstValue("bday") || "");
        } catch {}
        const m = value.match(/^(?:(\d{4})|--)-?(\d{2})-?(\d{2})/);
        if (!m) {
          continue;
        }
        const name = (card.displayName || `${card.firstName || ""} ${card.lastName || ""}`).trim() || card.primaryEmail;
        if (!name) {
          continue;
        }
        const key = `${name.toLocaleLowerCase()}|${m[2]}${m[3]}`;
        if (!found.has(key) || (!found.get(key).year && m[1])) {
          found.set(key, { name, year: m[1] ? Number(m[1]) : null, month: Number(m[2]), day: Number(m[3]) });
        }
      }
    }
    let calendar = cal.manager.getCalendarById(Services.prefs.getStringPref(BDAY_CAL_PREF, ""));
    if (!found.size && !calendar) {
      return; // keine Geburtstage – keinen leeren Kalender anlegen
    }
    if (!calendar) {
      calendar = cal.manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
      calendar.name = tr("Birthdays");
      calendar.setProperty("color", "#FF2D55");
      calendar.setProperty("suppressAlarms", true);
      cal.manager.registerCalendar(calendar);
      Services.prefs.setStringPref(BDAY_CAL_PREF, calendar.id);
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

  // Aktionen beim Überfahren einer Karte: Markieren, Archivieren, Löschen –
  // nur für diese Mail, ohne Auswahl oder Ansicht zu ändern
  hoverActions(win, row) {
    const doc = win.document;
    const box = doc.createElement("div");
    box.className = "mc-actions";
    const act = (cls, label, run) => {
      const b = doc.createElement("button");
      b.type = "button";
      // nur für die Maus – sonst müsste man pro Karte durch drei Knöpfe tabben
      b.tabIndex = -1;
      b.className = `mc-action ${cls}`;
      b.title = label;
      b.setAttribute("aria-label", label);
      // nicht die Zeile auswählen oder ziehen
      for (const type of ["mousedown", "pointerdown", "dblclick"]) {
        b.addEventListener(type, e => e.stopPropagation());
      }
      b.addEventListener("click", event => {
        event.stopPropagation();
        event.preventDefault();
        const hdr = this.hdrForRow(row);
        if (!hdr?.folder) {
          return;
        }
        try {
          run(hdr);
        } catch (e) {
          log("hover action error", cls, e);
        }
      });
      box.append(b);
    };
    act("mc-act-flag", tr("Flag"), hdr => hdr.folder.markMessagesFlagged([hdr], !hdr.isFlagged));
    act("mc-act-archive", tr("Archive"), hdr => {
      const { MessageArchiver } = ChromeUtils.importESModule("resource:///modules/MessageArchiver.sys.mjs");
      new MessageArchiver().archiveMessages([hdr]);
    });
    act("mc-act-delete", tr("Delete"), hdr => {
      // nur in den Papierkorb verschieben – im Papierkorb selbst (dort wäre es
      // endgültig) ist der Knopf ausgeblendet und tut nichts
      if (hdr.folder.getFlag(Ci.nsMsgFolderFlags.Trash)) {
        return;
      }
      hdr.folder.deleteMessages([hdr], win.msgWindow, false, false, null, true);
    });
    return box;
  }

  // Wie Apple Mail: Eine zugeklappte Konversation zeigt Vorschau und Bild der
  // neuesten Nachricht, nicht der ersten. Aufgeklappt hat jede Zeile ihre eigene.
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
      if (!box || !hdr || box.dataset.mcFor == hdr.messageId) {
        return;
      }
      box.dataset.mcFor = hdr.messageId;
      box.classList.add("mc-hdr-avatar");
      try {
        this.fillAvatar(box, hdr);
        this.decorateHeader(doc, hdr);
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
        let name = (li.displayName || "").trim();
        if (email && li.id.startsWith("fromRecipient")) {
          name = senderLabel(name, email.toLowerCase());
        }
        if (email && li.title != email) {
          li.title = email;
        }
        const single = li.querySelector(".recipient-single-line");
        if (single && name && single.textContent != name) {
          single.textContent = name;
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
    this.restorers.push(() => {
      mo.disconnect();
      delete doc.__mcHdrAvatar;
      // Datum zurück an seinen Platz, eigene Elemente entfernen
      const meta = doc.getElementById("mcHdrMeta");
      const date = doc.getElementById("dateLabel");
      if (meta && date && doc.__mcDateHome) {
        doc.__mcDateHome.parent.insertBefore(date, doc.__mcDateHome.next?.parentNode == doc.__mcDateHome.parent ? doc.__mcDateHome.next : null);
      }
      meta?.remove();
      doc.getElementById("mcListBanner")?.remove();
      for (const box of doc.querySelectorAll(".mc-hdr-avatar")) {
        box.classList.remove("mc-hdr-avatar", "mc-has-img", "mc-small");
        delete box.dataset.mcFor;
      }
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
    this.restorers.push(() => {
      mo.disconnect();
      delete box.__mcLayout;
      for (const n of box.querySelectorAll("notification-message")) {
        n.shadowRoot?.querySelector("style.mc-layout")?.remove();
      }
    });
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
    folderEl.textContent = title;
    folderEl.hidden = !title;
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
    const banner = doc.createElementNS(X, "div");
    banner.id = "mcListBanner";
    const icon = doc.createElementNS(X, "span");
    icon.className = "mc-lb-icon";
    const text = doc.createElementNS(X, "span");
    text.className = "mc-lb-text";
    text.textContent = tr("This message is from a mailing list.");
    banner.append(icon, text);
    if (web || mail) {
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
      // Abmelde-Mail nur vorbereiten – gesendet wird erst durch den Nutzer
      const composeMail = () => MailServices.compose.OpenComposeWindowWithURI(null, Services.io.newURI(mail));
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
          });
          if (!res.ok) {
            throw new Error(`status ${res.status}`);
          }
          unsub.textContent = tr("Unsubscribed");
          unsub.setAttribute("data-done", "true");
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

  fillAvatar(avatar, hdr) {
    let name = "";
    let email = "";
    try {
      const parsed = MailServices.headerParser.parseDecodedHeader(
        hdr.mime2DecodedAuthor || hdr.author
      )[0];
      name = parsed?.name || "";
      email = (parsed?.email || "").toLowerCase();
    } catch {}

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
      this.previewTimer = win.setTimeout(() => this.flushPreviews(), 150);
    }
  }

  flushPreviews() {
    this.previewTimer = null;
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

  refreshPreviews() {
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
const SETTINGS = {
  previewLines: [PREVIEW_PREF, "int", 1],
  // standardmäßig aus (auf Wunsch: ruhigere Karten); in den Einstellungen einschaltbar
  hoverActions: [HOVER_ACTIONS_PREF, "bool", false],
  calendarEmoji: [EMOJI_PREF, "bool", true],
  emojiCustom: [EMOJI_CUSTOM_PREF, "string", ""],
  birthdays: [BDAY_PREF, "bool", true],
  macContactPhotos: [MAC_PHOTOS_PREF, "bool", false],
  senderLogos: [SENDER_LOGOS_PREF, "bool", true],
  plainTextSystemFont: [PLAIN_TEXT_PREF, "bool", true],
  autoUpdate: [AUTO_UPDATE_PREF, "bool", true],
  hideDuplicateContacts: ["extensions.mailcards.hideDuplicateContacts", "bool", true],
  calendarOffline: ["extensions.mailcards.calendarOffline", "bool", false],
  appleIcons: ["extensions.mailcards.appleIcons", "bool", true],
  bundledTheme: ["extensions.mailcards.bundledTheme", "bool", true],
  listWidth: [LIST_WIDTH_PREF, "int", LIST_WIDTH_DEFAULT],
  debug: ["extensions.mailcards.debug", "bool", false],
};
function readSetting([pref, type, def]) {
  if (type == "bool") return Services.prefs.getBoolPref(pref, def);
  if (type == "int") return Services.prefs.getIntPref(pref, def);
  return Services.prefs.getStringPref(pref, def);
}

var enhancer = null;
var extensionRoot = null; // rootURI der Erweiterung, für resource://mailcards/
var extensionVersion = ""; // hängt an den Stylesheet-Adressen, damit ein Update sofort greift

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
          const out = { mac: Services.appinfo.OS == "Darwin", german: Services.locale.appLocaleAsBCP47.startsWith("de") };
          for (const [key, spec] of Object.entries(SETTINGS)) {
            out[key] = readSetting(spec);
          }
          return out;
        },
        async setSetting(key, value) {
          const spec = SETTINGS[key];
          if (!spec) {
            throw new Error(`unknown setting ${key}`);
          }
          const [pref, type, def] = spec;
          if (value === null || value === def) {
            Services.prefs.clearUserPref(pref); // Standard: nichts im Profil speichern
          } else if (type == "bool") {
            Services.prefs.setBoolPref(pref, !!value);
          } else if (type == "int") {
            const n = Math.round(Number(value));
            if (!Number.isFinite(n)) throw new Error("not a number");
            Services.prefs.setIntPref(pref, key == "previewLines" ? Math.max(0, Math.min(4, n)) : Math.max(200, Math.min(1200, n)));
          } else {
            Services.prefs.setStringPref(pref, String(value).slice(0, 10000));
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
