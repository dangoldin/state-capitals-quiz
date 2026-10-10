# Data sources and checks

The quiz data is in `data.js`. This file tells where each field comes from, which choices we made, and which facts can change soon.

**Last full check: 10 October 2026.**

## How the data was checked

1. We took the list of countries from Wikidata ("member of the United Nations") and from [mledoze/countries](https://github.com/mledoze/countries).
2. We compared the capital, currency, and language of each country in both sources with the old quiz data.
3. We examined each difference by hand, and we searched current news for changes from 2024 to 2026.
4. `node scripts/check-data.js` checks the rules that keep the quiz fair. Run it after each change to `data.js`.

## Countries

The quiz has the 193 UN member states. It does not have observer states (Vatican City, Palestine) or areas with limited recognition (Kosovo, Taiwan, Western Sahara).

Recent name changes:

- **Naoero** (before: Nauru). The official name changed on 3 August 2026. `aka` keeps "Nauru".
- **Türkiye** (before: Turkey). This is the UN name since 2022. `aka` keeps "Turkey".

## Capitals

Source: Wikidata (property P36) and mledoze/countries. The coordinates come from Wikidata (P625).

Recent changes:

- **Equatorial Guinea:** the capital moved from Malabo to Ciudad de la Paz by decree in January 2026. The migration from the old progress format removes the old Malabo streak.
- **Indonesia:** Jakarta is still the capital. The Constitutional Court confirmed this in May 2026. The move to Nusantara needs a presidential decree. The target date for that decree is no later than August 2028. **Check this again.**

Rules for countries with more than one capital:

- `capital` is the main answer. `capitalAlso` lists other capitals that official or standard reference sources commonly give. The quiz accepts these as correct. This applies to South Africa (Pretoria, Cape Town, Bloemfontein), Bolivia (Sucre, La Paz), and Eswatini (Mbabane, Lobamba). The constitutions do not always name all of them. For example, Bolivia's constitution names only Sucre.
- A city where the government works, but that is not an official capital, is only in `capitalNote`. Examples are Cotonou, The Hague, Putrajaya, Aden, and Egypt's "The New Capital".

Choices about politically disputed capitals:

- **Israel:** Jerusalem, with a note that many countries keep their embassies in Tel Aviv.
- **Yemen:** Sana'a, with a note that the government works from Aden because of the war.

## Continents

The decks keep the grouping of the old quiz, with one change: **Cyprus** is in Europe, because it is an EU member that uses the euro. Türkiye, Georgia, Armenia, Azerbaijan, Kazakhstan, and Russia keep their old decks (Russia in Europe, the others in Asia).

## Currencies

Source: mledoze/countries. Wikidata has gaps for this field (for example, many euro countries have no value).

Corrections and checks:

- **Bulgaria** uses the euro since January 2026.
- **Zimbabwe** uses the ZiG (Zimbabwe Gold) since 2024. The US dollar is still widely used, so the quiz accepts both.
- **Cuba:** the convertible peso ended in 2021, so only the Cuban peso remains.
- **Syria:** new Syrian pound notes started in January 2026. The name of the currency did not change.
- **Burkina Faso, Mali, Niger** still use the West African CFA franc. A new Sahel currency is only a plan (September 2026). **Check this again.**
- **Iran:** in 2025, parliament approved a plan to remove four zeros from the rial. It was not possible to confirm that the change has started. The currency is still the rial. **Check this again.**

`currency.also` lists other money in everyday legal use. A quiz never shows these as wrong options. Examples:

- the South African rand in Lesotho, Namibia, Eswatini, and Zimbabwe
- the US dollar in Lebanon, Venezuela, Cuba, Cambodia, and Liberia
- the Indian rupee in Bhutan and Nepal

## Languages

Source: Wikidata (P37) and mledoze/countries. The two sources often disagree, so this field was selected by hand.

- `languages` are the main languages. Each one is a correct answer.
- `otherLanguages` are other official, regionally official, or widely spoken languages. A quiz never shows these as wrong options. Examples:
  - regional languages, such as Croatian, Slovene, and Hungarian in Austria
  - large minorities, such as Turkish in Bulgaria and Germany
  - close varieties, such as Croatian for Serbia, Indonesian for Malaysia, Czech for Slovakia, and Lao for Thailand
- An independent review on 10 October 2026 checked all 193 rows. It found 9 missing items in these lists, and we added them.

Recent changes:

- **Mali (2023)** and **Burkina Faso:** French is now a "working language". National languages are the official languages.
- **Niger (2025):** Hausa is the national language. French and English are "working languages".
- **United States (2025):** Executive Order 14224 made English the official language.

## Flags

Source: Wikimedia Commons. Each file is the one that Wikidata names for the country (P41), downloaded on 10 October 2026. The files keep their real shape (for example, the square flag of Switzerland and the non-rectangle flag of Nepal).

Recent changes that the files include:

- **Syria:** new flag (green, white and black with three red stars), 2025.
- **Honduras:** back to dark blue, January 2026.

Not included:

- **North Korea:** Wikipedia and a flag blog report new proportions (1:1.65) from March 2026. No independent news report confirms it, and the Commons file still uses the old 1:2 shape. The colors and design are the same. **Check this again.**

Look-alike flags: the flags of **Monaco and Indonesia** (red over white) and of **Chad and Romania** (blue, yellow, red) look almost the same. In the Flags topic, the quiz accepts either name and shows a note, and never offers the twin as a wrong option.

Choice about a disputed flag:

- **Afghanistan:** the black, red and green flag (2013–2021). The UN still uses this flag. The government inside the country uses a white flag.

Licenses: 191 files are in the public domain. Two files need attribution:

- `flags/ye.svg`: "Flag of Yemen.svg" by 愛喝奶茶, [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0), from Wikimedia Commons.
- `flags/om.svg`: "Flag of Oman.svg", vectorized from qanoon.om, [Open Government Licence – Oman 1.0](https://www.oman.om/en/home-footer-level/faq/open-government-licence-oman), from Wikimedia Commons.

## Maps

- **World:** [Natural Earth](https://www.naturalearthdata.com/) 1:10m Admin 0 – Countries, **USA point of view**, version 5.1.1. Public domain.
  - The default Natural Earth file shows who controls an area. The USA version follows US policy. For example, Crimea is part of Ukraine, and Abkhazia and South Ossetia are part of Georgia.
  - Areas that are not UN members (for example Kosovo, Taiwan, Western Sahara, and Palestine) show as plain land. They are never highlighted.
  - `scripts/build-map.sh` simplifies the shapes, with finer detail for smaller countries. Every capital stays within 9 km of its country, the same as in the full-detail data. `scripts/check-data.js` checks this for all 193 capitals.
- **US states:** [us-atlas](https://github.com/topojson/us-atlas) 3.0.1, from the US Census Bureau cartographic boundaries. ISC license.
- **State capital coordinates:** Wikidata (P625), 10 October 2026. Juneau was added by hand (58.30, −134.42), and the check confirms it is inside Alaska.
- **Libraries:** [d3-geo](https://github.com/d3/d3-geo) 3.1.1 and d3-array 3.2.4 (ISC license), [topojson-client](https://github.com/topojson/topojson-client) 3.1.0 (ISC license). They are copied into `site/vendor/`.
- **Projection:** Equal Earth for the world. It keeps the true size of each area, so Africa is not drawn smaller than Greenland. The US map uses Albers USA, with Alaska and Hawaii as insets.

## Chase facts (`site/facts.js`)

Checked on 10 October 2026.

- **Population:** World Bank, 2025 (`SP.POP.TOTL`). Wikidata often has old census numbers (for example Somalia 11 million, against 19.7 million in 2025), so it was not used.
- **Area:** the median of three sources: World Bank surface area (`AG.SRF.TOTL.K2`), Wikidata (P2046), and mledoze/countries. Each source has outliers. For example, the World Bank gives Monaco 74.9 km² and Canada 15.6 million km², because it includes sea areas, and Wikidata includes territorial sea for Sweden. The median removes one bad value. Only France and Norway still disagree, because the sources count overseas departments and Svalbard differently.
- **Neighbors:** land borders computed from the shared borders in the map data (Natural Earth, USA point of view), and checked against mledoze/countries.
  - Added by hand: **Botswana – Zambia**, a border of about 150 m at Kazungula, too short for the map.
  - Not a neighbor: **India – Sri Lanka**. mledoze lists it, but it is a sea border.
  - Correct, and a good clue: **France – Brazil** and **France – Suriname**, through French Guiana.
- **Landlocked:** mledoze/countries. The map agrees for 189 of 193 countries. The four exceptions are Azerbaijan, Kazakhstan, and Turkmenistan, which touch only the Caspian Sea (a lake), and South Sudan, where the map has a gap at a disputed area.

**"Largest / smallest / most / fewest" clues** come from the data at run time, one winner for each continent deck. A clue is used only when the winner leads the runner-up by at least 20%, so a newer number cannot change the answer. Not used:

- **Too close:** largest in Africa (Algeria 2% ahead of DR Congo), most people in Asia (India 4% ahead of China), fewest people in Asia and in Europe, largest in North America (Canada 2% ahead of the US), smallest in South America, and smallest in Oceania.
- **Excluded by hand:** largest in Asia. In these decks Russia is in Europe, so the answer would be China, but a child could fairly answer Russia.
- **"Smallest in Europe"** means among UN members, so the answer is Monaco, not Vatican City.

## Facts to check again

| Fact | Why | When to check |
|---|---|---|
| Capital of Indonesia | The Nusantara decree is expected by August 2028 | Every 6 months |
| Currency of Iran | A plan to remove four zeros from the rial | Every 6 months |
| Currency of Burkina Faso, Mali, Niger | A plan for a new Sahel currency | Every 6 months |
| Currency of Zimbabwe | A plan to use only the ZiG by 2030 | Every year |
| New euro countries | Countries join the euro on 1 January | Every January |
| Flag of North Korea | Reported change of proportions, March 2026 | Next update |
