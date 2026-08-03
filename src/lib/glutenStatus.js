/**
 * Sikkerhedskritisk logik.
 *
 * Grundreglen: et tomt felt er ALDRIG et bevis på at noget er sikkert.
 * Open Food Facts er crowdsourcet, og et manglende allergenfelt betyder
 * "ingen har udfyldt det", ikke "der er ingen gluten".
 *
 * Funktionen returnerer én af fire tilstande (status) plus et antal
 * uddybende noter. UI'et må kun stemple ud fra `status` — noterne er
 * kontekst, ikke konklusion.
 */

export const STATUS = {
  CONTAINS: 'contains', // 1. Indeholder gluten
  TRACES: 'traces', // 2. Kan indeholde spor
  FREE: 'free', // 3. Mærket glutenfri
  UNKNOWN: 'unknown', // 4. Vi ved det ikke
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
 * Dansk, svensk/norsk, engelsk, tysk og fransk — det er hvad man møder på
 * en dansk hylde.
 *
 * De fleste rødder søges som ren delstreng, fordi danske sammensætninger
 * gemmer kornet inde i ordet: "fuldkornshvedemel", "havregryn". Undtaget
 * er "rug" og "byg", som optræder inde i harmløse ord (frugt, brug,
 * bygning) og derfor kræver ordgrænse plus en liste over de sammensætninger
 * der faktisk står på en varedeklaration.
 */
const COMPOUND_PREFIX = '(?:fuldkorns|hel|hele|grov|groft|valset|valsede|knust|knækket|sigtet)?';

const GRAIN_PATTERNS = [
  { grain: 'hvede', re: /(hvede|hvete|vetemj|wheat|weizen|froment|blé)/i },
  { grain: 'spelt', re: /(spelt|dinkel|épeautre|epeautre)/i },
  { grain: 'durum', re: /(durum|semulje|semolina|semoule|hartweizen)/i },
  { grain: 'kamut', re: /(kamut|khorasan)/i },
  { grain: 'couscous', re: /(couscous|bulgur)/i },
  { grain: 'seitan', re: /seitan/i },
  { grain: 'triticale', re: /triticale/i },
  { grain: 'malt', re: /malt/i },
  {
    grain: 'rug',
    re: new RegExp(`(\\b${COMPOUND_PREFIX}rug|\\brågmj|\\broggen|\\brye\\b|\\bseigle)`, 'i'),
  },
  {
    grain: 'byg',
    re: new RegExp(`(\\b${COMPOUND_PREFIX}byg|\\bbarley|\\bgerste|\\borge\\b)`, 'i'),
  },
  { grain: 'havre', re: /(havre|hafer|avoine|\boat)/i, oat: true },
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

const toTags = (value) => (Array.isArray(value) ? value.filter((t) => typeof t === 'string') : []);

/**
 * Alle ingredienstekster på én gang. Open Food Facts har både et
 * originalsprogsfelt og oversatte felter, og et produkt kan have gluten
 * stavet i det ene og ikke det andet. Vi søger i dem alle.
 */
const ingredientsSource = (product) =>
  [product.ingredients_text_da, product.ingredients_text, product.ingredients_text_en]
    .filter((t) => typeof t === 'string' && t.trim())
    .join(' \n ');

const hasAny = (tags, set) => tags.some((tag) => set.has(tag.toLowerCase()));

const matched = (tags, set) => tags.filter((tag) => set.has(tag.toLowerCase()));

/**
 * Gennemsøger ingredienslisten for glutenholdige kornsorter.
 * Returnerer null hvis der ikke er nogen ingrediensliste at søge i —
 * det er vigtigt at skelne "søgte, fandt intet" fra "der var intet at søge i".
 */
export function scanIngredientsForGrains(ingredientsText) {
  if (typeof ingredientsText !== 'string') return null;
  const raw = ingredientsText.trim();
  if (!raw) return null;

  const cleaned = raw.replace(NEGATION_RE, ' ');
  const grains = [];
  let oatOnly = true;

  for (const { grain, re, oat } of GRAIN_PATTERNS) {
    if (re.test(cleaned)) {
      grains.push(grain);
      if (!oat) oatOnly = false;
    }
  }

  return { grains, oatOnly: grains.length > 0 && oatOnly, searched: true };
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
      evidence: { allergens: [], traces: [], labels: [], grains: [], ingredientsSearched: false },
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

  const evidence = {
    allergens,
    traces,
    labels: freeLabels,
    grains: [],
    ingredientsSearched: false,
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

  // Ingredienslisten som ekstra lag. Den kan aldrig stå alene som konklusion,
  // men den skal heller ikke tie, bare fordi allergenfeltet har fået udfyldt
  // mælk og ikke gluten.
  const ingredientScan = scanIngredientsForGrains(ingredientsSource(product));
  if (ingredientScan) {
    evidence.ingredientsSearched = true;
    evidence.grains = ingredientScan.grains;
  }

  // 3. Mærket glutenfrit. Stadig brugerindsendt data.
  if (freeLabels.length > 0) {
    notes.push('Mærkningen er indtastet af en bruger, ikke af producenten. Tjek emballagen første gang.');
    if (allergens.length === 0 && traces.length === 0) {
      notes.push('Allergenfelterne er tomme, så mærkningen er den eneste kilde.');
    }
    if (ingredientScan?.grains.length > 0) {
      notes.push(
        `Bemærk: ingredienslisten nævner ${ingredientScan.grains.join(', ')}. I glutenfri varer kan det være fx glutenfri hvedestivelse, men det er værd at læse efter.`,
      );
    }
    return { status: STATUS.FREE, heuristic: false, notes, evidence };
  }

  // 4. Ukendt — og kun her bliver ingrediensfundet til en formodning.
  if (ingredientScan?.grains.length > 0) {
    notes.push(
      allergens.length > 0 || traces.length > 0
        ? 'Allergenfeltet nævner ikke gluten, men ingredienslisten gør. Formodningen bygger udelukkende på ord i ingredienslisten — feltet kan være ufuldstændigt.'
        : 'Allergenfeltet er tomt. Formodningen bygger udelukkende på ord fundet i ingredienslisten.',
    );
    if (ingredientScan.oatOnly) {
      notes.push('Kun havre blev fundet — glutenfri af natur, men ofte forurenet.');
    }
    return { status: STATUS.UNKNOWN, heuristic: true, notes, evidence };
  }

  if (allergens.length > 0 || traces.length > 0) {
    notes.push(
      'Allergenfelterne er udfyldt med andre allergener og nævner ikke gluten. Det er et tegn, men ikke et bevis — feltet kan være ufuldstændigt.',
    );
  } else if (ingredientScan) {
    notes.push(
      'Ingredienslisten nævner ingen kendte kornsorter, men allergenfelterne er tomme. Det er ikke det samme som glutenfri.',
    );
  } else {
    notes.push('Hverken allergenfelter eller ingrediensliste er udfyldt for dette produkt.');
  }

  return { status: STATUS.UNKNOWN, heuristic: false, notes, evidence };
}

/** Kort, entydig overskrift til stemplet. */
export const STATUS_LABEL = {
  [STATUS.CONTAINS]: 'INDEHOLDER GLUTEN',
  [STATUS.TRACES]: 'KAN INDEHOLDE SPOR',
  [STATUS.FREE]: 'MÆRKET GLUTENFRI',
  [STATUS.UNKNOWN]: 'DATA MANGLER',
};

/** Én sætning der siger hvad brugeren skal gøre. */
export const STATUS_ACTION = {
  [STATUS.CONTAINS]: 'Lad den stå.',
  [STATUS.TRACES]: 'Ikke sikker ved cøliaki. Læs emballagen.',
  [STATUS.FREE]: 'Ser fin ud — bekræft på emballagen.',
  [STATUS.UNKNOWN]: 'Vi ved det ikke. Læs varens emballage selv.',
};
