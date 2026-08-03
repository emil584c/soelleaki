/**
 * Sikkerhedskritisk logik.
 *
 * Grundreglen: et tomt felt er ALDRIG et bevis på at noget er sikkert.
 * Open Food Facts er crowdsourcet, og et manglende allergenfelt betyder
 * "ingen har udfyldt det", ikke "der er ingen gluten".
 *
 * Men det modsatte gælder også: en udfyldt ingrediensliste ER data. Står
 * hele deklarationen der, og er der ingen kornsorter i den, så har vi
 * kigget efter og fundet noget — så er "data mangler" et forkert svar.
 * `DATA MANGLER` er derfor kun for de varer hvor der reelt ikke er noget
 * at gå efter.
 *
 * De to kilder holdes adskilt hele vejen. Allergenfelter og mærkning er
 * autoritative; ingredienslisten er en læsning. Derfor har de hver deres
 * tilstande, og `heuristic` siger hvilken kilde svaret kom fra — UI'et
 * viser det med stiplet ramme, så en læsning aldrig kan forveksles med en
 * deklaration.
 *
 * Funktionen returnerer én af seks tilstande (status) plus et antal
 * uddybende noter. UI'et må kun stemple ud fra `status` — noterne er
 * kontekst, ikke konklusion.
 */

export const STATUS = {
  CONTAINS: 'contains', // 1. Deklareret gluten
  TRACES: 'traces', // 2. Deklarerede spor
  FREE: 'free', // 3. Mærket glutenfri
  GRAIN: 'grain', // 4. Kornsort læst i ingredienslisten
  NO_GRAIN: 'no-grain', // 5. Hel ingrediensliste gennemsøgt, ingen kornsorter
  UNKNOWN: 'unknown', // 6. Vi ved det ikke
};

/**
 * Tags der i praksis betyder gluten.
 *
 * Open Food Facts normaliserer som regel til `en:gluten`, men en del
 * produkter (særligt franske og tyske indtastninger) har kun kornsorten
 * angivet. Dem tæller vi med — det er den sikre fejlretning.
 */
const GLUTEN_TAGS = new Set([
  'en:gluten',
  'en:wheat',
  'en:durum-wheat',
  'en:soft-wheat',
  'en:spelt',
  'en:kamut',
  'en:khorasan-wheat',
  'en:einkorn',
  'en:emmer',
  'en:rye',
  'en:barley',
  'en:malt',
  'en:malted-barley',
  'en:barley-malt',
  'en:triticale',
  'en:semolina',
  'en:couscous',
  'en:bulgur',
  'en:seitan',
]);

/**
 * Havre er glutenfri af natur, men er så godt som altid forurenet med
 * hvede fra mark og mølle med mindre den er certificeret ren. Havre alene
 * hæver derfor til "spor", ikke til "indeholder".
 */
const OAT_TAGS = new Set(['en:oats', 'en:oat']);

const GLUTEN_FREE_LABELS = new Set([
  'en:gluten-free',
  'en:no-gluten',
  'en:certified-gluten-free',
  'en:crossed-grain-symbol', // Crossed Grain er Cøliaki Foreningens licenssymbol
  'en:afdiag-gluten-free',
  'en:gluten-free-certified',
]);

/**
 * Heuristik-ordbog til ingredienslisten. Resultatet præsenteres altid som
 * en formodning, aldrig som et allergenfelt.
 *
 * Dansk, svensk/norsk, engelsk, tysk og fransk dækker hovedparten af en
 * dansk hylde. Italiensk, spansk, hollandsk og polsk er taget med for de
 * importerede varer — de er dem der ellers ville slippe igennem som
 * "ingen korn i listen".
 *
 * De fleste rødder søges som ren delstreng, fordi danske sammensætninger
 * gemmer kornet inde i ordet: "fuldkornshvedemel", "havregryn". Undtaget
 * er "rug" og "byg", som optræder inde i harmløse ord (frugt, brug,
 * bygning) og derfor kræver ordgrænse plus en liste over de sammensætninger
 * der faktisk står på en varedeklaration.
 */
const COMPOUND_PREFIX = '(?:fuldkorns|hel|hele|grov|groft|valset|valsede|knust|knækket|sigtet)?';

const GRAIN_PATTERNS = [
  { grain: 'hvede', re: /(hvede|hvete|vetemj|wheat|weizen|froment|blé|trigo|frumento|tarwe|pszen)/i },
  { grain: 'spelt', re: /(spelt|dinkel|épeautre|epeautre|farro|espelta)/i },
  { grain: 'durum', re: /(durum|semulje|semol|semoule|hartweizen)/i },
  { grain: 'kamut', re: /(kamut|khorasan)/i },
  { grain: 'couscous', re: /(couscous|bulgur)/i },
  { grain: 'seitan', re: /seitan/i },
  { grain: 'triticale', re: /triticale/i },
  { grain: 'malt', re: /malt/i },
  {
    grain: 'rug',
    re: new RegExp(
      `(\\b${COMPOUND_PREFIX}rug|\\brågmj|\\brogge|\\brye\\b|\\bseigle|\\bsegale|\\bcenteno|\\bżyt)`,
      'i',
    ),
  },
  {
    grain: 'byg',
    re: new RegExp(
      `(\\b${COMPOUND_PREFIX}byg|\\bbarley|\\bgerst|\\borge\\b|\\bcebada|\\borzo\\b|\\bjęczmie)`,
      'i',
    ),
  },
  { grain: 'havre', re: /(havre|hafer|avoine|\boat|\bavena|\bowie|\bowsian)/i, oat: true },
];

/**
 * Passager der skal skrælles væk før søgningen:
 *
 *  · "glutenfri hvedestivelse" — hvedestivelse i et glutenfrit produkt er
 *    netop den slags falske hit der ville gøre heuristikken ubrugelig;
 *  · maltodextrin, maltitol og maltose — navnet indeholder "malt", men
 *    stofferne laves oftest af majs og er så forarbejdede at de er undtaget
 *    allergenmærkning i EU. Uden det her ville halvdelen af hylden lyse op.
 */
const NEGATION_RE =
  /\b(gluten ?fri\w*|gluten[- ]?free|ohne gluten|sans gluten|glutenfrei)\b[^.,;]*|malto(?:dextrin|dekstrin|se)\w*|maltitol\w*/gi;

/**
 * Ingredienser der ikke selv er en kornsort, men som i praksis plejer at
 * være lavet af hvede uden at sige det. De er ikke bevis på gluten — de er
 * bevis på at ingredienslisten ikke er entydig, og de spærrer derfor for
 * at vi melder "ingen kornsorter fundet".
 *
 * "mel" søges med ordgrænse i begge ender, så kun det bare ord fanges:
 * `rismel` og `mandelmel` er sammensatte og siger selv hvad de er, mens
 * "mel" alene på en dansk deklaration stort set altid er hvedemel.
 */
const AMBIGUOUS_PATTERNS = [
  { name: 'mel uden kornsort', re: /\b(mel|mjöl|mehl|flour|farine|farina|harina|mąka)\b/i },
  { name: 'brød eller rasp', re: /(\bbrød|brødkrumme|\brasp\b|panko|crouton|tvebak|paneret|panering)/i },
  { name: 'pasta eller nudler', re: /(\bpasta\b|nudler|nudel|noodle)/i },
  { name: 'sojasauce', re: /(soja ?s(auce|ovs|åpa)|soy ?sauce|teriyaki)/i },
  { name: 'øl', re: /(\bøl\b|\bbeer\b)/i },
  { name: 'lakrids', re: /(lakrids|li(c|q)orice)/i },
];

const toTags = (value) => (Array.isArray(value) ? value.filter((t) => typeof t === 'string') : []);

/**
 * Sprogfelterne, i den rækkefølge vi foretrækker dem. Open Food Facts
 * lægger originalsproget i `ingredients_text` og oversættelser i
 * `ingredients_text_<sprog>`. Et produkt kan have kornet stavet i det ene
 * felt og ikke i det andet.
 */
const INGREDIENT_FIELDS = [
  'ingredients_text_da',
  'ingredients_text',
  'ingredients_text_en',
  'ingredients_text_sv',
  'ingredients_text_de',
  'ingredients_text_fr',
];

const readField = (product, key) => (typeof product?.[key] === 'string' ? product[key].trim() : '');

/** Den liste vi viser og måler fyldighed på: ét sprog, ikke en sammenblanding. */
const primaryIngredients = (product) =>
  INGREDIENT_FIELDS.map((key) => readField(product, key)).find(Boolean) ?? '';

/** Alle sprogversioner på én gang — kun til selve søgningen. */
const ingredientsSource = (product) =>
  INGREDIENT_FIELDS.map((key) => readField(product, key))
    .filter(Boolean)
    .join(' \n ');

const hasAny = (tags, set) => tags.some((tag) => set.has(tag.toLowerCase()));

const matched = (tags, set) => tags.filter((tag) => set.has(tag.toLowerCase()));

/** Selve søgningen i én tekstbid, efter at negationerne er skrællet væk. */
function findGrains(text) {
  const cleaned = text.replace(NEGATION_RE, ' ');
  const grains = GRAIN_PATTERNS.filter(({ re }) => re.test(cleaned)).map(({ grain }) => grain);
  const ambiguous = AMBIGUOUS_PATTERNS.filter(({ re }) => re.test(cleaned)).map(({ name }) => name);
  return { grains, ambiguous };
}

const isOatOnly = (grains) => grains.length > 0 && grains.every((grain) => grain === 'havre');

/**
 * Gennemsøger ingredienslisten for glutenholdige kornsorter.
 * Returnerer null hvis der ikke er nogen ingrediensliste at søge i —
 * det er vigtigt at skelne "søgte, fandt intet" fra "der var intet at søge i".
 */
export function scanIngredientsForGrains(ingredientsText) {
  if (typeof ingredientsText !== 'string') return null;
  const raw = ingredientsText.trim();
  if (!raw) return null;

  const { grains, ambiguous } = findGrains(raw);
  return { grains, ambiguous, oatOnly: isOatOnly(grains), searched: true };
}

/**
 * Samme søgning, men på Open Food Facts' egen opsplitning af listen
 * (`ingredients_tags`: `en:wheat-flour`, `en:barley-malt-extract` …).
 *
 * Taggene er normaliseret til engelsk, uanset hvilket sprog varen er
 * indtastet på. Det fanger de kornsorter vores ordbog ikke kender ordet
 * for — spansk `harina de trigo` bliver til `en:wheat-flour`. Hvert tag
 * søges for sig, så en negation i ét tag ikke kan æde det næste.
 */
export function scanIngredientTags(tags) {
  const list = toTags(tags);
  if (list.length === 0) return null;

  const grains = new Set();
  const ambiguous = new Set();

  for (const tag of list) {
    const text = tag.replace(/^[a-z]{2}:/i, ' ').replace(/-/g, ' ');
    const found = findGrains(text);
    found.grains.forEach((grain) => grains.add(grain));
    found.ambiguous.forEach((name) => ambiguous.add(name));
  }

  return { grains: [...grains], ambiguous: [...ambiguous], searched: true };
}

/**
 * Hvor meget kan vi regne med ingredienslisten?
 *
 *   none     der er ingen liste — intet at søge i;
 *   foreign  der er en liste, men på et sprog ordbogen ikke dækker;
 *   thin     der står noget, men for lidt til at et manglende korn betyder
 *            noget (et enkelt ord, en afbrudt sætning, "se emballagen");
 *   full     en rigtig deklaration med flere led, eller en liste Open Food
 *            Facts selv har markeret som færdig.
 *
 * Kun `full` er nok til at sige "ingen kornsorter i listen" frem for "data
 * mangler". `foreign` er den vigtigste af de tre spærringer: at vi ikke
 * fandt ordet for hvede i en italiensk liste, betyder ikke at hveden ikke
 * er der — det betyder at vi ikke kunne læse med.
 */
export const QUALITY = { NONE: 'none', FOREIGN: 'foreign', THIN: 'thin', FULL: 'full' };

/** Sprog vi har ordbog nok til at drage en negativ konklusion på. */
const READABLE_LANGS = new Set(['da', 'sv', 'nb', 'nn', 'no', 'en', 'de', 'fr']);

const LANG_TAGGED_FIELDS = INGREDIENT_FIELDS.filter((key) => key !== 'ingredients_text');

/**
 * Kunne vi rent faktisk læse listen?
 *
 * Tre veje: et sprogmærket felt vi har ordbog til, et originalsprogsfelt
 * hvor produktet selv oplyser et sprog vi kan, eller Open Food Facts' egen
 * opsplitning — den er normaliseret til engelsk og dermed læsbar uanset
 * hvad varen er indtastet på, så længe parseren genkendte det meste.
 */
function ingredientsReadable(product) {
  if (LANG_TAGGED_FIELDS.some((key) => readField(product, key))) return true;

  const lang = String(product?.lang ?? '').toLowerCase();
  if (readField(product, 'ingredients_text') && READABLE_LANGS.has(lang)) return true;

  const tagged = toTags(product?.ingredients_tags).length;
  if (tagged === 0) return false;
  const unknown = Number(product?.unknown_ingredients_n) || 0;
  const total = Number(product?.ingredients_n) || tagged;
  return unknown * 2 < total;
}

const ITEM_SPLIT_RE = /[,;·•\n()[\]]+/;
const LETTERS_RE = /[a-zà-öø-ÿ]/gi;

const countItems = (text) =>
  text
    .split(ITEM_SPLIT_RE)
    .map((part) => part.trim())
    .filter((part) => (part.match(LETTERS_RE) ?? []).length >= 2).length;

export function ingredientQuality(product) {
  const text = primaryIngredients(product);
  const parsed = Number.isFinite(product?.ingredients_n) ? product.ingredients_n : 0;
  const tagged = toTags(product?.ingredients_tags).length;
  const items = Math.max(countItems(text), parsed, tagged);

  // Hvert led skal have mindst to bogstaver, så tegnsætning alene ikke tæller.
  if (items === 0) return QUALITY.NONE;
  if (!ingredientsReadable(product)) return QUALITY.FOREIGN;
  if (items >= 2) return QUALITY.FULL;

  // Ét led. En enkeltingrediensvare ("Ris", "Mandler") er et fuldgyldigt
  // svar — men kun hvis nogen har erklæret listen færdig.
  return toTags(product?.states_tags).includes('en:ingredients-completed')
    ? QUALITY.FULL
    : QUALITY.THIN;
}

/**
 * @param {object|null} product Rå `product`-objekt fra Open Food Facts.
 * @returns {{status: string, heuristic: boolean, notes: string[], evidence: object}}
 */
export function assessGluten(product) {
  const notes = [];

  if (!product || typeof product !== 'object') {
    return {
      status: STATUS.UNKNOWN,
      heuristic: false,
      notes: ['Der er ingen produktdata at vurdere ud fra.'],
      evidence: {
        allergens: [],
        traces: [],
        labels: [],
        grains: [],
        ambiguous: [],
        ingredientsSearched: false,
        ingredientQuality: QUALITY.NONE,
      },
    };
  }

  const allergens = toTags(product.allergens_tags);
  const traces = toTags(product.traces_tags);
  const labels = toTags(product.labels_tags);

  const allergenGluten = matched(allergens, GLUTEN_TAGS);
  const traceGluten = matched(traces, GLUTEN_TAGS);
  const allergenOats = matched(allergens, OAT_TAGS);
  const traceOats = matched(traces, OAT_TAGS);
  const freeLabels = matched(labels, GLUTEN_FREE_LABELS);

  // Ingredienslisten læses op front, så alle grene kan skrive om den.
  // Den afgør aldrig noget over allergenfeltet — den kommer først til
  // orde når felterne har tiet.
  const textScan = scanIngredientsForGrains(ingredientsSource(product));
  const tagScan = scanIngredientTags(product.ingredients_tags);
  const grains = [...new Set([...(textScan?.grains ?? []), ...(tagScan?.grains ?? [])])];
  const ambiguous = [...new Set([...(textScan?.ambiguous ?? []), ...(tagScan?.ambiguous ?? [])])];
  const searched = Boolean(textScan || tagScan);
  const quality = searched ? ingredientQuality(product) : QUALITY.NONE;

  const evidence = {
    allergens,
    traces,
    labels: freeLabels,
    grains,
    ambiguous,
    ingredientsSearched: searched,
    ingredientQuality: quality,
  };

  // 1. Deklareret gluten i allergenfeltet. Vinder over alt andet.
  if (allergenGluten.length > 0) {
    if (freeLabels.length > 0) {
      notes.push(
        'Modstridende data: produktet er også mærket glutenfrit. Stol på det strengeste — læs emballagen.',
      );
    }
    return { status: STATUS.CONTAINS, heuristic: false, notes, evidence };
  }

  // 1b. Havre i allergenfeltet uden gluten-tag: risiko for forurening, ikke deklareret gluten.
  if (allergenOats.length > 0 && freeLabels.length === 0) {
    notes.push(
      'Produktet indeholder havre. Havre er glutenfri af natur, men er ofte forurenet med hvede med mindre den er certificeret ren.',
    );
    return { status: STATUS.TRACES, heuristic: false, notes, evidence };
  }

  // 2. Spor af gluten.
  if (traceGluten.length > 0 || traceOats.length > 0) {
    if (traceOats.length > 0 && traceGluten.length === 0) {
      notes.push('Sporene er angivet som havre, som ofte er forurenet med hvede.');
    }
    if (freeLabels.length > 0) {
      notes.push('Produktet er mærket glutenfrit, men har alligevel spor angivet.');
    }
    return { status: STATUS.TRACES, heuristic: false, notes, evidence };
  }

  // 3. Mærket glutenfrit. Stadig brugerindsendt data.
  if (freeLabels.length > 0) {
    notes.push('Mærkningen er indtastet af en bruger, ikke af producenten. Tjek emballagen første gang.');
    if (allergens.length === 0 && traces.length === 0) {
      notes.push('Allergenfelterne er tomme, så mærkningen er den eneste kilde.');
    }
    if (grains.length > 0) {
      notes.push(
        `Bemærk: ingredienslisten nævner ${grains.join(', ')}. I glutenfri varer kan det være fx glutenfri hvedestivelse, men det er værd at læse efter.`,
      );
    }
    return { status: STATUS.FREE, heuristic: false, notes, evidence };
  }

  // 4. Kornsorter i ingredienslisten. Et fund er et fund — det skal siges
  //    lige ud, ikke gemmes under et "data mangler". Men det er læst, ikke
  //    deklareret, og `heuristic` holder den forskel synlig hele vejen op.
  if (grains.length > 0) {
    // Hvilke kornsorter der blev fundet, står allerede på strimlen under
    // stemplet — noten skal sige hvor stærkt fundet vejer.
    notes.push(
      allergens.length > 0 || traces.length > 0
        ? 'Allergenfeltet nævner ikke gluten, men ingredienslisten gør. Formodningen bygger udelukkende på ord i ingredienslisten — feltet kan være ufuldstændigt.'
        : 'Allergenfeltet er tomt. Formodningen bygger udelukkende på ord fundet i ingredienslisten.',
    );
    if (isOatOnly(grains)) {
      notes.push('Kun havre blev fundet — glutenfri af natur, men ofte forurenet.');
    }
    return { status: STATUS.GRAIN, heuristic: true, notes, evidence };
  }

  // 5. Ingen kornsorter — men et fund er kun noget værd hvis der var en hel
  //    liste at lede i, og hvis intet af det der står, skjuler et korn.
  if (quality === QUALITY.FULL && ambiguous.length === 0) {
    notes.push(
      allergens.length > 0 || traces.length > 0
        ? 'Allergenfelterne er udfyldt med andre allergener og nævner ikke gluten, og ingredienslisten indeholder ingen kornsorter.'
        : 'Hele ingredienslisten er gennemsøgt uden fund af kornsorter. Allergenfelterne er til gengæld tomme, så listen er den eneste kilde.',
    );
    notes.push(
      'Spor fra produktionen står ikke altid i ingredienslisten. Ved cøliaki: læs emballagen første gang.',
    );

    const unknownIngredients = Number(product.unknown_ingredients_n) || 0;
    const totalIngredients = Number(product.ingredients_n) || 0;
    if (totalIngredients > 0 && unknownIngredients * 2 >= totalIngredients) {
      notes.push(
        `Open Food Facts kunne ikke genkende ${unknownIngredients} af ${totalIngredients} ingredienser. Teksten er søgt igennem som den står, men listen kan være stavet forkert eller afkortet.`,
      );
    }

    return { status: STATUS.NO_GRAIN, heuristic: true, notes, evidence };
  }

  // 6. Vi ved det ikke — og her siger vi hvorfor, i stedet for bare "data mangler".
  if (ambiguous.length > 0) {
    notes.push(
      `Ingredienslisten nævner ${ambiguous.join(', ')} uden at sige hvilken kornsort. Det er som regel hvede, men det står der ikke.`,
    );
  } else if (quality === QUALITY.THIN) {
    notes.push(
      'Der står en ingrediens eller to, men ikke nok til en hel deklaration. En manglende kornsort i en halv liste betyder ingenting.',
    );
  } else if (quality === QUALITY.FOREIGN) {
    notes.push(
      'Ingredienslisten er på et sprog appen ikke læser. At der ikke blev fundet en kornsort, betyder her kun at vi ikke kunne læse med.',
    );
  }

  if (allergens.length > 0 || traces.length > 0) {
    notes.push(
      'Allergenfelterne er udfyldt med andre allergener og nævner ikke gluten. Det er et tegn, men ikke et bevis — feltet kan være ufuldstændigt.',
    );
  } else if (quality === QUALITY.NONE) {
    notes.push('Hverken allergenfelter eller ingrediensliste er udfyldt for dette produkt.');
  } else {
    notes.push('Allergenfelterne er tomme, så der er ikke andet at falde tilbage på.');
  }

  return { status: STATUS.UNKNOWN, heuristic: false, notes, evidence };
}

/** Kort, entydig overskrift til stemplet. */
export const STATUS_LABEL = {
  [STATUS.CONTAINS]: 'INDEHOLDER GLUTEN',
  [STATUS.TRACES]: 'KAN INDEHOLDE SPOR',
  [STATUS.FREE]: 'MÆRKET GLUTENFRI',
  [STATUS.GRAIN]: 'KORN I LISTEN',
  [STATUS.NO_GRAIN]: 'INGEN KORN I LISTEN',
  [STATUS.UNKNOWN]: 'DATA MANGLER',
};

/** Én sætning der siger hvad brugeren skal gøre. */
export const STATUS_ACTION = {
  [STATUS.CONTAINS]: 'Lad den stå.',
  [STATUS.TRACES]: 'Ikke sikker ved cøliaki. Læs emballagen.',
  [STATUS.FREE]: 'Ser fin ud — bekræft på emballagen.',
  [STATUS.GRAIN]: 'Ingredienserne peger på korn. Læs emballagen før du køber.',
  [STATUS.NO_GRAIN]: 'Ingen kornsorter i ingredienserne. Spor er ikke udelukket.',
  [STATUS.UNKNOWN]: 'Vi ved det ikke. Læs varens emballage selv.',
};
