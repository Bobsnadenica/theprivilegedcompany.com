# Liar's Deck — free game / Тесте на блъфа — безплатна игра

## English

Play alone against three bots, or host a room for **2–4 people on the same Wi-Fi/local network**. This download includes a ready-built browser client and a local game server. No account, subscription, or hosting bill.

1. Install **Node.js 22 or newer** from https://nodejs.org/ on one host computer.
2. Unzip this entire folder. On Mac run `start.command`, on Windows run `start.bat`, or on Linux run `bash start.sh`. You can also run `node start.mjs` in a terminal in this folder.
3. First launch installs the required free packages from npm and needs internet. Later launches reuse them.
4. Open the **Host** address printed in the window. Enter your name and choose **Create room**.
5. Friends on the same Wi-Fi open the printed **Friends** address on their computers or phones, choose **Join**, and enter the room code. Only the host needs Node.js.
6. The host chooses **Start** once two players have joined. Keep the host computer and terminal running. **Ctrl+C** stops it; rooms are not saved.

If no Friends address appears, connect the host to Wi-Fi and restart. Guest Wi-Fi/client isolation or a firewall may prevent connections: use a trusted private network. Do not forward router ports or expose this starter server to the public internet. Online play across different networks requires separate server setup.

Use the **EN / БГ** switch at any time. Voice chat is optional and requires localhost or HTTPS, so it normally will not work for friends using a plain HTTP LAN address; the card game still works.

Select 1–3 cards, then **Play**, or **Call bluff** to challenge the previous turn. Matching table ranks and Jokers are truthful. A splash eliminates a player; the last player wins. This is a fictional card game with water effects, no wagering or prizes.

Source and development instructions: https://github.com/Bobsnadenica/theprivilegedcompany.com/tree/main/dev/Russian-roulette
Built by The Privileged Company: https://www.theprivilegedcompany.com/

## Български

Играйте сами срещу три бота или създайте стая за **2–4 души в една Wi-Fi/локална мрежа**. Пакетът съдържа готова игра за браузър и локален сървър. Без регистрация, абонамент и платен хостинг.

1. Инсталирайте **Node.js 22 или по-нова версия** от https://nodejs.org/ на компютъра на домакина.
2. Разархивирайте цялата папка. За Mac стартирайте `start.command`, за Windows — `start.bat`, а за Linux — `bash start.sh`. Може и с `node start.mjs` в терминал, отворен в тази папка.
3. Първото стартиране изтегля нужните безплатни пакети от npm и изисква интернет. Следващите използват вече инсталираните пакети.
4. Отворете адреса **Домакин**, въведете име и натиснете **Създай стая**.
5. Приятелите ви отварят адреса **Приятели в същата Wi-Fi мрежа** от своя компютър или телефон, избират **Влез** и въвеждат кода на стаята. Само домакинът трябва да има Node.js.
6. При поне двама играчи домакинът натиска **Старт**. Оставете компютъра и терминала включени. **Ctrl+C** спира сървъра; стаите не се запазват.

Ако няма адрес за приятели, свържете домакина към Wi-Fi и рестартирайте. Гост мрежа с изолирани устройства или защитна стена може да пречи на връзката — използвайте доверена частна мрежа. Не пренасочвайте портове от рутера към този сървър. За игра през различни мрежи е нужна отделна сървърна настройка.

Сменяйте езика от **EN / БГ**. Гласовият чат е по избор и изисква localhost или HTTPS. Затова обикновено не работи при приятели с HTTP адрес в локалната мрежа; играта на карти работи и без него.

Изберете 1–3 карти и натиснете **Играй** или оспорете предишния ход с **Блъф!**. Картите с ранга на масата и жокерите са честен ход. Пръските изваждат играч от играта; последният останал печели. Това е измислена игра с водни ефекти, без залози и награди.
