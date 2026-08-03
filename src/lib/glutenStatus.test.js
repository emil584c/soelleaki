import { describe, expect, it } from 'vitest';

import { assessGluten, scanIngredientsForGrains, STATUS } from './glutenStatus.js';

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

  it('bliver ved UKENDT når andre allergener er udfyldt uden gluten', () => {
    const result = assessGluten({ allergens_tags: ['en:milk', 'en:soybeans'] });
    expect(result.status).toBe(STATUS.UNKNOWN);
    expect(result.notes.join(' ')).toMatch(/ikke et bevis/i);
  });

  it('markerer ingrediens-fund som formodning, ikke som en tilstand for sig', () => {
    const result = assessGluten({
      allergens_tags: [],
      ingredients_text: 'Hvedemel, vand, salt, gær',
    });
    expect(result.status).toBe(STATUS.UNKNOWN);
    expect(result.heuristic).toBe(true);
    expect(result.evidence.grains).toContain('hvede');
  });

  it('tier ikke om hvede i ingredienslisten, selv om allergenfeltet er udfyldt med andet', () => {
    const result = assessGluten({
      allergens_tags: ['en:milk'],
      ingredients_text: 'Hvedemel, mælk',
    });
    expect(result.status).toBe(STATUS.UNKNOWN);
    expect(result.heuristic).toBe(true);
    expect(result.notes.join(' ')).toMatch(/ufuldstændigt/i);
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
