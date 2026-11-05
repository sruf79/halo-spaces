halo.spaces privacy policy

halo.spaces runs entirely inside Thunderbird. It has no server, no account, no analytics and no telemetry, and it never sends your messages, contacts or events anywhere.

Network requests it makes:

All settings mentioned here are in Thunderbird under Settings → halo.spaces.

1. Sender logos (can be turned off: Mail → "Logos from sender websites"). For messages from organisations (not from common free-mail providers such as Gmail or Outlook.com), halo.spaces looks up the sender domain's BIMI record via DNS and asks that domain's own website for its logo or icon (for example https://example.com/favicon.ico). Only the domain name is used – never the full address, the subject or the content. The request goes directly to the sender's website, which can see your IP address, just like when you open that website. Logos are cached locally in your Thunderbird profile for 30 days.

2. Contact photos that you have stored as a web link in your own address book are loaded from that link (only secure https addresses on the public internet).

3. Update checks: Thunderbird checks for new versions like for every add-on. halo.spaces is distributed through GitHub, so Thunderbird reads the update list from GitHub (raw.githubusercontent.com) and downloads new versions from github.com. halo.spaces also starts this check once when Thunderbird starts (at most every 6 hours; can be turned off: Updates → "Install updates at start"). Only what Thunderbird sends for every add-on update check is sent (such as the add-on ID and version); GitHub can see your IP address.

4. Weather in the Today pane (off by default; Calendar → "Weather in the Today Pane"). When turned on, halo.spaces asks Open-Meteo (api.open-meteo.com, weather data CC BY 4.0) for the current weather about every 30 minutes. Only coordinates rounded to about 1 km are sent. If you enter a city, its name is sent once to Open-Meteo's geocoding service (geocoding-api.open-meteo.com) to find these coordinates. If you leave the city empty, your system's location service is used (your operating system asks for permission); the rounded coordinates go only to Open-Meteo. Open-Meteo can see your IP address.

5. Fifth space (off by default; when you turn off Chat under Spaces, "Instead" offers a website or the space of another add-on). If you choose "Website", the web address you enter opens in its own Thunderbird tab, like in a browser – that website sees your visit and can keep you signed in with cookies in your Thunderbird profile. With "Symbol: Original", halo.spaces loads that website's icon (/favicon.ico) for the spaces bar. Links to other websites open in your normal browser. If you choose the space of another add-on, halo.spaces only shows that add-on's own page; it sends nothing.

6. Unsubscribe from mailing lists: if a message offers one-click unsubscribe and you click "Unsubscribe" and confirm, halo.spaces sends a short request ("List-Unsubscribe=One-Click", without cookies) to the unsubscribe address given by the sender. That sender then knows that this address no longer wants its messages. If that does not work, halo.spaces only prepares an unsubscribe message for you to send or opens the sender's unsubscribe page in your browser.

Data stored locally (only in your Thunderbird profile): the logo cache, the last weather reading and place (if weather is on), the mailing lists you unsubscribed from, your halo.spaces settings, and – only if you turn on "Detailed log" – a debug log file that may contain sender addresses.

Optional, macOS only and off by default: "Photos from the Contacts app" reads pictures from your local macOS Contacts database; macOS asks for permission once. Nothing leaves your computer.

Feedback: the "Send Feedback" button only opens a new message window in Thunderbird, addressed to the developer; nothing is sent unless you send it yourself.

Contact: https://github.com/sruf79/halo-spaces/issues
