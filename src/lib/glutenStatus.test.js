import { describe, expect, it } from 'vitest';

import {
  assessGluten,
  assessIngredientsText,
  ingredientQuality,
  QUALITY,
  scanIngredientsForGrains,
  scanIngredientTags,
  STATUS,
} from './glutenStatus.js';

/** En ost som den ser ud i Open Food Facts: fuld liste, mælk i allergenfeltet. */
const CHEESE = {
  product_name: 'Ost 45+',
  ingredients_text_da: 'Pasteuriseret komælk, salt, syrningskultur, osteløbe, farve (annatto)',
  ingredients_n: 5,
  allergens_tags: ['en:milk'],
  traces_tags: [],
  labels_tags: [],
};

describe('assessGluten', () => {
  it('stempler deklareret gluten som INDEHOLDER', () => {
    const result = assessGluten({ allergens_tags: ['en:gluten', 'en:milk'] });
    expect(result.status).toBe(STATUS.CONTAINS);
    expect(result.heuristic).toBe(false);
  });

  it('regner kornsorter i allergenfeltet som gluten', () => {
    for (const tag of ['en:wheat', 'en:rye', 'en:barley', 'en:spelt', 'en:malt']) {
      expect(assessGluten({ allergens_tags: [tag] }).status).toBe(STATUS.CONTAINS);
    }
  });

  it('lader deklareret gluten vinde over en glutenfri-mærkning', () => {
    const result = assessGluten({
      allergens_tags: ['en:gluten'],
      labels_tags: ['en:gluten-free'],
    });
    expect(result.status).toBe(STATUS.CONTAINS);
    expect(result.notes.join(' ')).toMatch(/modstridende/i);
  });

  it('stempler spor som SPOR', () => {
    expect(assessGluten({ traces_tags: ['en:gluten'] }).status).toBe(STATUS.TRACES);
  });

  it('hæver havre til SPOR frem for INDEHOLDER', () => {
    expect(assessGluten({ allergens_tags: ['en:oats'] }).status).toBe(STATUS.TRACES);
    expect(assessGluten({ traces_tags: ['en:oats'] }).status).toBe(STATUS.TRACES);
  });

  it('lader spor vinde over en glutenfri-mærkning', () => {
    const result = assessGluten({
      traces_tags: ['en:gluten'],
      labels_tags: ['en:gluten-free'],
    });
    expect(result.status).toBe(STATUS.TRACES);
  });

  it('accepterer glutenfri-mærkning, men med forbehold', () => {
    const result = assessGluten({ labels_tags: ['en:gluten-free'], allergens_tags: [] });
    expect(result.status).toBe(STATUS.FREE);
    expect(result.notes.join(' ')).toMatch(/bruger/i);
  });

  it('bliver ved UKENDT når alt er tomt — aldrig "sikker"', () => {
    for (const product of [{}, { allergens_tags: [], traces_tags: [], labels_tags: [] }, null]) {
      const result = assessGluten(product);
      expect(result.status).toBe(STATUS.UNKNOWN);
      expect(result.heuristic).toBe(false);
    }
  });

  it('bliver ved UKENDT når allergenfeltet står alene og der ingen liste er', () => {
    const result = assessGluten({ allergens_tags: ['en:milk', 'en:soybeans'] });
    expect(result.status).toBe(STATUS.UNKNOWN);
    expect(result.notes.join(' ')).toMatch(/ikke et bevis/i);
  });

  it('siger et kornfund lige ud, men markerer det som læst og ikke deklareret', () => {
    const result = assessGluten({
      allergens_tags: [],
      lang: 'da',
      ingredients_text: 'Hvedemel, vand, salt, gær',
    });
    expect(result.status).toBe(STATUS.GRAIN);
    expect(result.heuristic).toBe(true);
    expect(result.evidence.grains).toContain('hvede');
  });

  it('tier ikke om hvede i ingredienslisten, selv om allergenfeltet er udfyldt med andet', () => {
    const result = assessGluten({
      allergens_tags: ['en:milk'],
      lang: 'da',
      ingredients_text: 'Hvedemel, mælk',
    });
    expect(result.status).toBe(STATUS.GRAIN);
    expect(result.heuristic).toBe(true);
    expect(result.notes.join(' ')).toMatch(/ufuldstændigt/i);
  });

  it('holder et kornfund adskilt fra en deklaration', () => {
    // Samme vare, to kilder: den deklarerede vinder og er ikke en formodning.
    const read = assessGluten({ lang: 'da', ingredients_text: 'Hvedemel, vand' });
    const declared = assessGluten({ allergens_tags: ['en:gluten'], ingredients_text: 'Hvedemel' });
    expect(read.status).toBe(STATUS.GRAIN);
    expect(read.heuristic).toBe(true);
    expect(declared.status).toBe(STATUS.CONTAINS);
    expect(declared.heuristic).toBe(false);
  });

  it('lader et kornfund i ingredienslisten stå selv om listen er ulæselig i øvrigt', () => {
    // Fund er fund: at resten af listen er på italiensk, gør ikke durummen væk.
    const result = assessGluten({ lang: 'it', ingredients_text: 'Semola di grano duro, acqua' });
    expect(result.status).toBe(STATUS.GRAIN);
    expect(result.evidence.grains).toContain('durum');
  });

  it('lader ikke heuristikken overtrumfe et allergenfelt der allerede har svaret', () => {
    const result = assessGluten({
      allergens_tags: ['en:gluten'],
      ingredients_text: 'Hvedemel',
    });
    expect(result.heuristic).toBe(false);
  });

  it('nævner hvede i en glutenfri-mærket vare uden at ændre stemplet', () => {
    const result = assessGluten({
      labels_tags: ['en:gluten-free'],
      ingredients_text: 'Hvedestivelse, vand',
    });
    expect(result.status).toBe(STATUS.FREE);
    expect(result.heuristic).toBe(false);
    expect(result.notes.join(' ')).toMatch(/hvede/i);
  });

  it('søger også i de oversatte ingrediensfelter', () => {
    const result = assessGluten({ ingredients_text_da: 'Fuldkornshvedemel, vand' });
    expect(result.heuristic).toBe(true);
    expect(result.evidence.grains).toContain('hvede');
  });
});

describe('assessGluten — når listen er der, men allergenfeltet tier', () => {
  it('siger ikke "data mangler" om en ost med hel ingrediens- og allergenliste', () => {
    const result = assessGluten(CHEESE);
    expect(result.status).toBe(STATUS.NO_GRAIN);
    expect(result.heuristic).toBe(true);
    expect(result.evidence.ingredientQuality).toBe(QUALITY.FULL);
    expect(result.notes.join(' ')).toMatch(/ingen kornsorter/i);
  });

  it('minder altid om at spor ikke kan læses ud af en ingrediensliste', () => {
    expect(assessGluten(CHEESE).notes.join(' ')).toMatch(/spor/i);
  });

  it('gælder også uden allergenfelt, men siger at listen står alene', () => {
    const result = assessGluten({
      ingredients_text_da: 'Vand, sukker, citronsaft, farve',
      ingredients_n: 4,
    });
    expect(result.status).toBe(STATUS.NO_GRAIN);
    expect(result.notes.join(' ')).toMatch(/eneste kilde/i);
  });

  it('lader et fund af korn vinde over "ingen korn"', () => {
    const result = assessGluten({ ...CHEESE, ingredients_text_da: 'Komælk, salt, hvedestivelse' });
    expect(result.status).toBe(STATUS.GRAIN);
    expect(result.heuristic).toBe(true);
  });

  it('holder fast i DATA MANGLER når listen er en stump', () => {
    const result = assessGluten({ allergens_tags: ['en:milk'], ingredients_text_da: 'Ost' });
    expect(result.status).toBe(STATUS.UNKNOWN);
    expect(result.notes.join(' ')).toMatch(/ikke nok til en hel deklaration/i);
  });

  it('accepterer en enkeltingrediensvare når listen er markeret færdig', () => {
    const bare = { ingredients_text_da: 'Ris' };
    expect(assessGluten(bare).status).toBe(STATUS.UNKNOWN);
    expect(assessGluten({ ...bare, states_tags: ['en:ingredients-completed'] }).status).toBe(
      STATUS.NO_GRAIN,
    );
  });

  it('stempler ikke "ingen korn" når listen nævner noget flertydigt', () => {
    for (const text of [
      'Mel, vand, salt, gær',
      'Kartofler, rasp, solsikkeolie, salt',
      'Vand, sojasauce, eddike, sukker',
      'Sukker, lakrids, glukosesirup, gelatine',
    ]) {
      const result = assessGluten({ ingredients_text_da: text, allergens_tags: ['en:milk'] });
      expect(result.status).toBe(STATUS.UNKNOWN);
      expect(result.notes.join(' ')).toMatch(/uden at sige hvilken kornsort/i);
    }
  });

  it('forveksler ikke sammensatte melsorter med bart "mel"', () => {
    const result = assessGluten({
      ingredients_text_da: 'Rismel, mandelmel, vand, salt',
      ingredients_n: 4,
    });
    expect(result.status).toBe(STATUS.NO_GRAIN);
    expect(result.evidence.ambiguous).toEqual([]);
  });

  it('rører ikke de tre autoritative tilstande', () => {
    const full = { ingredients_text_da: 'Vand, salt, sukker, eddike', ingredients_n: 4 };
    expect(assessGluten({ ...full, allergens_tags: ['en:gluten'] }).status).toBe(STATUS.CONTAINS);
    expect(assessGluten({ ...full, traces_tags: ['en:gluten'] }).status).toBe(STATUS.TRACES);
    expect(assessGluten({ ...full, labels_tags: ['en:gluten-free'] }).status).toBe(STATUS.FREE);
  });

  it('siger ikke "ingen korn" om en liste på et sprog vi ikke læser', () => {
    const italian = {
      ingredients_text: 'Acqua, zucchero, succo di limone, aroma naturale',
      lang: 'it',
      ingredients_n: 4,
    };
    const result = assessGluten(italian);
    expect(result.status).toBe(STATUS.UNKNOWN);
    expect(result.evidence.ingredientQuality).toBe(QUALITY.FOREIGN);
    expect(result.notes.join(' ')).toMatch(/sprog appen ikke læser/i);

    // Har Open Food Facts selv delt listen op, kan vi læse med alligevel.
    const parsed = {
      ...italian,
      ingredients_tags: ['en:water', 'en:sugar', 'en:lemon-juice', 'en:natural-flavouring'],
      unknown_ingredients_n: 0,
    };
    expect(assessGluten(parsed).status).toBe(STATUS.NO_GRAIN);
  });

  it('regner et dansk originalsprogsfelt for læsbart', () => {
    const result = assessGluten({
      ingredients_text: 'Vand, sukker, citronsaft, aroma',
      lang: 'da',
      ingredients_n: 4,
    });
    expect(result.status).toBe(STATUS.NO_GRAIN);
  });

  it('advarer når Open Food Facts ikke kunne genkende det meste af listen', () => {
    const result = assessGluten({
      ingredients_text_da: 'Xyz, qwe, asd, zxc',
      ingredients_n: 4,
      unknown_ingredients_n: 3,
    });
    expect(result.status).toBe(STATUS.NO_GRAIN);
    expect(result.notes.join(' ')).toMatch(/kunne ikke genkende 3 af 4/i);
  });
});

describe('assessIngredientsText — tekst læst med kameraet', () => {
  it('siger et kornfund lige ud, som læsning', () => {
    const result = assessIngredientsText('Hvedemel, vand, gær, salt');
    expect(result.status).toBe(STATUS.GRAIN);
    expect(result.heuristic).toBe(true);
    expect(result.evidence.grains).toContain('hvede');
    expect(result.notes.join(' ')).toMatch(/billede/i);
  });

  it('finder kornet selv om kameraet har læst resten af linjen skævt', () => {
    // Typisk OCR-output: støj, forkerte mellemrum, tabte tegn — men kornet står der.
    const result = assessIngredientsText('lngredienser: FULDKORNSHVEDEMEL (32 7o), vand. sa|t');
    expect(result.status).toBe(STATUS.GRAIN);
    expect(result.evidence.grains).toContain('hvede');
  });

  it('melder ingen korn i en hel liste uden fund — med forbehold for læsefejl', () => {
    const result = assessIngredientsText('Pasteuriseret komælk, salt, syrningskultur, osteløbe');
    expect(result.status).toBe(STATUS.NO_GRAIN);
    expect(result.heuristic).toBe(true);
    expect(result.notes.join(' ')).toMatch(/stave forkert/i);
    expect(result.notes.join(' ')).toMatch(/spor/i);
  });

  it('lader flertydige led spærre for "ingen korn", præcis som i API-vejen', () => {
    const result = assessIngredientsText('Kartofler, rasp, solsikkeolie, salt');
    expect(result.status).toBe(STATUS.UNKNOWN);
    expect(result.notes.join(' ')).toMatch(/uden at sige hvilken kornsort/i);
  });

  it('bygger ikke en vurdering på en stump', () => {
    const result = assessIngredientsText('Ost');
    expect(result.status).toBe(STATUS.UNKNOWN);
    expect(result.notes.join(' ')).toMatch(/ikke nok/i);
  });

  it('bliver ved UKENDT når der ingen tekst er', () => {
    for (const text of ['', '   ', undefined, null]) {
      const result = assessIngredientsText(text);
      expect(result.status).toBe(STATUS.UNKNOWN);
      expect(result.heuristic).toBe(false);
    }
  });

  it('lader sig ikke narre af "glutenfri hvedestivelse" i et billede', () => {
    const result = assessIngredientsText('Majsstivelse, glutenfri hvedestivelse, vand, salt');
    expect(result.status).toBe(STATUS.NO_GRAIN);
  });

  it('markerer altid svaret som foto-kilde', () => {
    expect(assessIngredientsText('Hvedemel, vand').evidence.source).toBe('photo');
    expect(assessIngredientsText('').evidence.source).toBe('photo');
  });
});

describe('scanIngredientTags', () => {
  it('skelner mellem tom og manglende tagliste', () => {
    expect(scanIngredientTags(undefined)).toBeNull();
    expect(scanIngredientTags([])).toBeNull();
    expect(scanIngredientTags(['en:water', 'en:salt']).grains).toEqual([]);
  });

  it('finder korn i tags på sprog ordbogen ikke dækker', () => {
    // 'harina de trigo' og 'farina di frumento' normaliseres begge hertil.
    expect(scanIngredientTags(['en:wheat-flour', 'en:water']).grains).toContain('hvede');
    expect(scanIngredientTags(['en:barley-malt-extract']).grains).toEqual(
      expect.arrayContaining(['byg', 'malt']),
    );
  });

  it('lader ikke en negation i ét tag æde det næste', () => {
    const found = scanIngredientTags(['en:gluten-free-wheat-starch', 'en:rye-flour']);
    expect(found.grains).toEqual(['rug']);
  });

  it('bruges af vurderingen, også når fritekstfeltet er på et fremmed sprog', () => {
    const result = assessGluten({
      lang: 'es',
      ingredients_text: 'Harina de trigo, agua, sal',
      ingredients_tags: ['en:wheat-flour', 'en:water', 'en:salt'],
      ingredients_n: 3,
    });
    expect(result.status).toBe(STATUS.GRAIN);
    expect(result.heuristic).toBe(true);
    expect(result.evidence.grains).toContain('hvede');
  });
});

describe('ingredientQuality', () => {
  it('kalder en manglende liste for ingenting', () => {
    expect(ingredientQuality({})).toBe(QUALITY.NONE);
    expect(ingredientQuality({ ingredients_text: '   ' })).toBe(QUALITY.NONE);
  });

  it('kalder en enkelt stump for tynd', () => {
    expect(ingredientQuality({ ingredients_text_da: 'Ost' })).toBe(QUALITY.THIN);
    expect(ingredientQuality({ ingredients_text_da: '.' })).toBe(QUALITY.NONE);
  });

  it('kalder en deklaration med flere led for hel', () => {
    expect(ingredientQuality({ ingredients_text_da: 'Vand, salt, sukker' })).toBe(QUALITY.FULL);
  });

  it('tæller også Open Food Facts egen opsplitning med', () => {
    expect(ingredientQuality({ ingredients_text_da: 'Vand og salt', ingredients_n: 2 })).toBe(
      QUALITY.FULL,
    );
  });
});

describe('scanIngredientsForGrains', () => {
  it('skelner mellem tom liste og manglende liste', () => {
    expect(scanIngredientsForGrains(undefined)).toBeNull();
    expect(scanIngredientsForGrains('  ')).toBeNull();
    expect(scanIngredientsForGrains('Vand, salt').grains).toEqual([]);
  });

  it('finder kornsorter på flere sprog', () => {
    expect(scanIngredientsForGrains('Farine de blé').grains).toContain('hvede');
    expect(scanIngredientsForGrains('Weizenmehl, Roggen').grains).toEqual(
      expect.arrayContaining(['hvede', 'rug']),
    );
    expect(scanIngredientsForGrains('barley malt extract').grains).toContain('byg');
  });

  it('finder også kornet i importsprogene', () => {
    expect(scanIngredientsForGrains('Harina de trigo, agua').grains).toContain('hvede');
    expect(scanIngredientsForGrains('Farina di frumento, acqua').grains).toContain('hvede');
    expect(scanIngredientsForGrains('Mąka pszenna, woda').grains).toContain('hvede');
    expect(scanIngredientsForGrains('Tarwebloem, water').grains).toContain('hvede');
    expect(scanIngredientsForGrains('Farina di segale').grains).toContain('rug');
    expect(scanIngredientsForGrains('Cebada malteada').grains).toContain('byg');
    expect(scanIngredientsForGrains('Copos de avena').grains).toContain('havre');
  });

  it('lader sig ikke narre af "glutenfri hvedestivelse"', () => {
    expect(scanIngredientsForGrains('Glutenfri hvedestivelse, vand').grains).toEqual([]);
  });

  it('finder kornet inde i danske sammensatte ord', () => {
    expect(scanIngredientsForGrains('Fuldkornshvedemel').grains).toContain('hvede');
    expect(scanIngredientsForGrains('Havregryn').grains).toContain('havre');
    expect(scanIngredientsForGrains('Fuldkornsrugmel').grains).toContain('rug');
    expect(scanIngredientsForGrains('Valset byg').grains).toContain('byg');
  });

  it('forveksler ikke harmløse ord med kornsorter', () => {
    // "frugt" og "brug" indeholder bogstaverne i "rug", "goat" indeholder "oat".
    expect(scanIngredientsForGrains('Frugtsaft, sukker').grains).toEqual([]);
    expect(scanIngredientsForGrains('Goat cheese, salt').grains).toEqual([]);
    expect(scanIngredientsForGrains('Klar til brug efter opvarmning').grains).toEqual([]);
  });

  it('flager ikke maltodextrin og maltitol som malt', () => {
    expect(scanIngredientsForGrains('Maltodextrin, maltitol, vand').grains).toEqual([]);
    expect(scanIngredientsForGrains('Maltekstrakt').grains).toContain('malt');
  });

  it('markerer havre-kun-fund særskilt', () => {
    const oats = scanIngredientsForGrains('Havregryn, vand');
    expect(oats.grains).toEqual(['havre']);
    expect(oats.oatOnly).toBe(true);

    const mixed = scanIngredientsForGrains('Havregryn, hvedemel');
    expect(mixed.oatOnly).toBe(false);
  });
});
