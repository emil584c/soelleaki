import { useEffect, useState } from 'react';

import { clearProductCache, storageSummary } from '../lib/db.js';

export default function AboutView() {
  const [summary, setSummary] = useState(null);

  const refresh = () => {
    storageSummary()
      .then(setSummary)
      .catch(() => setSummary(null));
  };

  useEffect(refresh, []);

  return (
    <section className="card">
      <h2 className="card__head">Om</h2>

      <h3 className="sub">Sådan læses vurderingen</h3>
      <dl className="legend">
        <div>
          <dt>Indeholder gluten</dt>
          <dd>Allergenfeltet nævner gluten eller en glutenholdig kornsort.</dd>
        </div>
        <div>
          <dt>Kan indeholde spor</dt>
          <dd>Sporfeltet nævner gluten, eller varen indeholder havre.</dd>
        </div>
        <div>
          <dt>Mærket glutenfri</dt>
          <dd>Nogen har registreret en glutenfri-mærkning. Brugerindsendt, ikke en garanti.</dd>
        </div>
        <div>
          <dt>Korn i listen</dt>
          <dd>
            Ingredienslisten nævner hvede, rug, byg, havre eller lignende, men intet allergenfelt
            bekræfter det. Linjen under vurderingen siger hvad der blev fundet.
          </dd>
        </div>
        <div>
          <dt>Ingen korn i listen</dt>
          <dd>
            Hele ingredienslisten er gennemsøgt, og der er ingen kornsorter i den. Det er en
            vurdering af ingredienserne, ikke en mærkning: spor fra produktionen står sjældent i
            listen.
          </dd>
        </div>
        <div>
          <dt>Data mangler</dt>
          <dd>
            Der er ikke nok at gå efter — ingen allergenfelter, og ingen brugbar ingrediensliste.
            Det betyder <em>ikke</em> at varen er sikker — det betyder at vi ikke ved det.
          </dd>
        </div>
      </dl>
      <p className="body">
        Farven siger hvor alvorligt det er, kanten hvor sikkert vi ved det: <strong>hel kant</strong>{' '}
        betyder at svaret står i et allergenfelt eller en mærkning, <strong>stiplet kant</strong> at
        det er læst ud af ingredienslisten. En ingrediensliste kan mangle noget — et allergenfelt er
        nogen der har taget stilling.
      </p>

      <h3 className="sub">Datakilde</h3>
      <p className="body">
        Produktoplysninger kommer fra{' '}
        <a className="link" href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer">
          Open Food Facts
        </a>
        , en åben database indtastet af frivillige. Data er stillet til rådighed under{' '}
        <a
          className="link"
          href="https://opendatacommons.org/licenses/odbl/1-0/"
          target="_blank"
          rel="noreferrer"
        >
          Open Database License (ODbL) 1.0
        </a>
        . Mangler en vare, kan du selv tilføje den — så er den der næste gang, også for andre.
      </p>

      <h3 className="sub">Hvad der ligger på enheden</h3>
      <p className="body">
        Alt bliver lokalt i browseren. Ingen konto, ingen server, ingen synkronisering, ingen
        analytics eller sporing. Appen taler kun med Open Food Facts, og kun når du slår en
        stregkode op. Kameraet er åbent mens du scanner og lukkes bagefter — billederne forlader
        aldrig telefonen og bliver ikke gemt. Det gælder også fotolæsningen af ingredienslister:
        teksten læses af et modul der ligger på appens eget domæne og kører på enheden.
      </p>

      {summary && (
        <>
          <p className="body">
            Gemt lige nu: <strong>{summary.scans}</strong> scanninger i historikken og{' '}
            <strong>{summary.products}</strong> produkter i den lokale cache.
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => clearProductCache().then(refresh)}
            disabled={summary.products === 0}
          >
            Ryd produktcache
          </button>
        </>
      )}

      <h3 className="sub">Ansvarsfraskrivelse</h3>
      <p className="body">
        Dette er et hjælperedskab til at spare tid ved hylden — ikke en garanti og ikke en
        lægefaglig vurdering. Data er crowdsourcet og kan være forkert, forældet eller
        ufuldstændig. Ved cøliaki eller anden allergi: læs altid varens emballage, og spørg din
        læge eller diætist om det, der har med dit helbred at gøre.
      </p>

      <h3 className="sub">Begrænsninger</h3>
      <ul className="notes">
        <li>
          Stregkodelæsning med kameraet kræver en Chromium-browser, typisk Chrome på Android.
          Fotolæsning af ingredienslisten virker i alle browsere med kamera — også på iPhone.
        </li>
        <li>Opslag kræver internet. Kun varer du selv har scannet, findes i den lokale cache.</li>
        <li>Kun gluten vurderes automatisk. Øvrige allergener vises som rå felter.</li>
        <li>
          Fotolæsning er en læsning af et billede: den kan stave forkert, og resultatet vises
          altid med stiplet kant og skal rettes til, før det vurderes.
        </li>
      </ul>
    </section>
  );
}
