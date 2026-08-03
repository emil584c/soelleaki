# Glutentjek

En PWA der scanner stregkoden på en madvare og siger om den indeholder gluten.
Bygget som personligt værktøj til at stå med en pakke i hånden i Netto og få et
svar hurtigere end ved at nærlæse en varedeklaration.

Ingen brugerkonti, ingen backend, ingen sky, ingen sporing. Alt data bliver på
enheden.

## Sikkerhedsmodellen

Det vigtigste i hele projektet: **et tomt felt er aldrig et bevis på at noget er
sikkert.** Open Food Facts er crowdsourcet, og et manglende allergenfelt betyder
"ingen har udfyldt det", ikke "der er ingen gluten".

Men det modsatte gælder også: **en udfyldt ingrediensliste _er_ data.** Står hele
deklarationen der, og er der ingen kornsorter i den, så har vi kigget efter og
fundet noget. Der er "data mangler" et forkert svar — og det svar fik man før på
alt fra ost til kaffe, fordi tilstanden var opsamlingssted for alt der ikke var
et positivt fund.

Derfor findes der præcis seks tilstande, og de har hver deres vurdering. De tre
første kommer fra en deklaration, de to næste fra en læsning af
ingredienslisten:

| Tilstand | Kilde | Udløses af | Vises som |
| --- | --- | --- | --- |
| Indeholder gluten | deklareret | `allergens_tags` indeholder `en:gluten` eller en glutenholdig kornsort | rød, hel kant |
| Kan indeholde spor | deklareret | `traces_tags` indeholder gluten, eller varen indeholder havre | okker, hel kant |
| Mærket glutenfri | deklareret | `labels_tags` indeholder `en:gluten-free` eller tilsvarende | grøn, hel kant |
| Korn i listen | læst | ingredienslisten nævner en kornsort, uden at et allergenfelt bekræfter det | rød, stiplet kant |
| Ingen korn i listen | læst | hel, læsbar ingrediensliste gennemsøgt, ingen kornsorter og intet flertydigt led | grøn, stiplet kant |
| Data mangler | — | intet allergenfelt siger noget om gluten, og listen kan ikke bære vurderingen | grå, stiplet kant |

`DATA MANGLER` er kun for de varer hvor der reelt ikke er noget at gå efter.
Har vi læst en hel deklaration igennem, siger appen hvad der stod — også når
det den fandt, var ingenting.

Forskellen på de to kilder forsvinder ikke i visningen, den flytter bare fra
ordlyd til kant: **hel kant = deklareret, stiplet kant = læst ud af
ingredienslisten.** Farven siger hvor alvorligt det er, kanten siger hvor
sikkert vi ved det. Et kornfund farves desuden efter hvad der blev fundet —
havre alene giver den milde farve, præcis som når havre står i allergenfeltet.

Et par valg der er strengere end den simple læsning af felterne:

- **Kornsorter tæller som gluten.** Open Food Facts normaliserer som regel til
  `en:gluten`, men mange produkter har kun `en:wheat`, `en:rye`, `en:barley`,
  `en:spelt` osv. Dem behandles som gluten.
- **Havre hæver til spor, ikke til fri.** Havre er glutenfri af natur, men er
  næsten altid forurenet med hvede med mindre den er certificeret ren.
- **Deklareret gluten vinder over en glutenfri-mærkning.** Er data modstridende,
  vises den strengeste tilstand med en note om konflikten.
- **"Mærket glutenfri" vises med forbehold.** Mærkningen er indtastet af en
  bruger, ikke af producenten.

### Ingredienslisten som ekstra lag

Siger allergenfelterne ikke noget om gluten, gennemsøges ingredienslisten for
glutenholdige kornsorter på dansk, svensk, engelsk, tysk og fransk. Ud over
fritekstfelterne søges også i `ingredients_tags` — Open Food Facts' egen
opsplitning af listen, normaliseret til engelsk. Det fanger kornet i de sprog
ordbogen ikke dækker: spansk `harina de trigo` bliver til `en:wheat-flour`.

Et **fund** af korn vises med det samme — stiplet, og med en linje under
vurderingen der siger præcis hvilket ord der blev fundet hvor. At kalde et
rugbrød for "data mangler", fordi rugen stod i ingredienslisten og ikke i et
allergenfelt, hjælper ingen.

Et **manglende** fund vejer mindre og skal derfor igennem tre spærringer, før
det får sin egen vurdering:

1. listen skal være på et sprog vi kan læse — enten et sprogmærket felt, et
   originalsprogsfelt hvor `lang` er et af vores sprog, eller en liste Open Food
   Facts selv har delt op i `ingredients_tags`. Ellers betyder et manglende
   kornfund kun at vi ikke kunne læse med;
2. listen skal være en hel deklaration (flere led, eller markeret færdig i
   `states_tags`) — en enkelt afbrudt linje beviser ingenting;
3. der må ikke stå noget flertydigt i den.

Punkt 3 er en kort liste over ingredienser der plejer at være lavet af hvede
uden at sige det: bart `mel`, `rasp`, `panko`, `pasta`, `sojasauce`, `øl`,
`lakrids`. De er ikke bevis på gluten — de er bevis på at listen ikke er
entydig, og de sender varen tilbage til `DATA MANGLER` med en note om præcis
hvilket ord der stod i vejen.

Heuristikken er lavet så den ikke råber op uden grund:

- den finder kornet inde i danske sammensætninger (`fuldkornshvedemel`,
  `havregryn`, `fuldkornsrugmel`);
- den forveksler ikke `frugt`, `brug` eller `goat` med `rug`/`oat`;
- `mel` fanges kun som helt ord, så `rismel` og `mandelmel` går fri;
- den lader sig ikke narre af `glutenfri hvedestivelse`;
- den flager ikke `maltodextrin`, `maltitol` og `maltose`, som er så
  forarbejdede at de er undtaget allergenmærkning i EU.

Logikken ligger i [`src/lib/glutenStatus.js`](src/lib/glutenStatus.js) og er
dækket af tests i `src/lib/glutenStatus.test.js`. **Ret aldrig i den uden at
køre testene** — det er den fil hvor en fejl kan gøre reel skade.

## Kom i gang

```sh
npm install
npm run dev       # dev-server, også tilgængelig fra telefonen på samme net
npm test          # tests af vurderingslogik og stregkodevalidering
npm run build     # statisk build i dist/
npm run icons     # gengenererer app-ikonerne (kræves kun hvis motivet ændres)
```

Kameraet kræver HTTPS. `localhost` regnes som sikker kontekst, men skal du teste
fra telefonen mod dev-serverens IP, skal den nås over HTTPS — ellers giver
browseren ikke adgang til kameraet.

## Hosting bag Caddy

`npm run build` giver en ren statisk mappe. Appen forventer at ligge i roden af
et domæne (`start_url` og service worker-scope er `/`).

```caddyfile
glutentjek.eksempel.dk {
    root * /srv/glutentjek/dist
    encode zstd gzip
    try_files {path} /index.html
    file_server

    # Service worker'en må aldrig cache sig selv fast.
    @sw path /sw.js
    header @sw Cache-Control "no-cache"
}
```

`try_files … /index.html` gør at appen også åbner ved genindlæsning. Resten af
filerne har hash i navnet og kan cache frit.

## Arkitektur

```
src/
  scanner/        alt kamera- og stregkodearbejde, isoleret bag ét interface
    index.js          scanBarcode(video) -> Promise<string>, motorregister
    barcodeDetectorEngine.js   primær motor: browserens BarcodeDetector
    camera.js         getUserMedia, oprydning af streams
    formats.js        EAN-13/EAN-8/UPC-A/UPC-E, normalisering, modulo-10-tjek
  lib/
    glutenStatus.js   vurderingslogikken (sikkerhedskritisk)
    openFoodFacts.js  API-klient
    db.js             IndexedDB: historik + produktcache
  components/     visningen
```

### Scanneren er udskiftelig med vilje

Resten af appen kender kun `scanBarcode(videoElement) -> Promise<string>` og ved
intet om `BarcodeDetector`. Den API findes kun i Chromium (typisk Chrome på
Android) — Safari og iOS har den ikke, og der vises en tydelig fejltilstand i
stedet for at fejle stille. Manuel indtastning af stregkoden virker i alle
browsere.

Skal der senere et fallback-bibliotek ind til iOS, implementeres et objekt med
`{ id, label, isSupported(), scan(video, { signal }) }` og registreres:

```js
import { registerEngine } from './scanner/index.js';
registerEngine(myZxingEngine); // prøves efter den indbyggede motor
```

Resten af appen skal ikke røres.

### Kamera og privatliv

Streamen åbnes først når man trykker scan, og lukkes igen ved stop, ved fund og
når man forlader scanningsvisningen. Billeder forlader aldrig telefonen og bliver
ikke gemt. En kode skal læses ens to gange i træk før den tælles, og
kontrolcifferet skal passe — det filtrerer fejllæsninger fra i dårligt lys.

### Lagring

IndexedDB, database `soelleaki`:

- `scans` — én række pr. scanning: `barcode`, `name`, `brands`, `status`,
  `heuristic`, `found`, `snapshot` (rå API-svar) og `scannedAt`. Rå-svaret gemmes
  med vilje: historikken vurderes forfra ud fra snapshottet hver gang den vises,
  så gamle scanninger retter sig selv når logikken bliver skarpere — uden nyt
  netværksopslag.
- `products` — cache af opslåede produkter, nøglet på stregkoden. Bruges som
  fallback når nettet svigter i butikken, og vises altid mærket som lokal kopi.

Service worker'en cacher kun app-skallen, aldrig produktdata. Historikken kan
ryddes fra Historik-fanen, produktcachen fra Om-fanen.

## Data

Produktoplysninger kommer fra [Open Food Facts](https://world.openfoodfacts.org)
under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Krediteringen
står synligt i appen, som licensen kræver. Findes en vare ikke, linker appen til
at oprette den — det gavner både næste opslag og databasen.

Ud over API-opslaget hentes produktbilledet fra Open Food Facts' servere. Det er
den eneste tredjepartsforespørgsel, og siden sender ingen referrer.

## Ansvarsfraskrivelse

Appen er et hjælperedskab, ikke en garanti og ikke en lægefaglig vurdering. Data
er crowdsourcet og kan være forkert, forældet eller ufuldstændig. Ved cøliaki
eller anden allergi: læs altid varens emballage, og spørg din læge eller diætist
om det der har med helbredet at gøre.

## Ikke med i v1

Ingen brugerkonti, ingen cloud-synkronisering, ingen medfølgende offline-database
over alle produkter (kun cache af det du selv har scannet), ingen
push-notifikationer, ingen iOS-specifik polering.
