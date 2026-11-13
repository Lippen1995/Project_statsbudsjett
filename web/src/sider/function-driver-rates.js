// Volumes without a more direct activity or population measure use the
// municipality's published population for the same year.
const perThousandResidents = [
  "adminFte", "buildingArea", "officeArea", "adultLearners", "adultSpecial",
  "sfoFte", "adviceFte", "adviceExternal", "welfareAdvice", "addictionFte",
  "addictionInterim", "addictionExternal", "childProtectionStaff", "childSupportFte",
  "childPlacementFte", "careDays", "careHighNeed", "staffedHousing", "carePlaces",
  "welfareCases", "planCases", "planPrivate", "planAppeals", "buildingCases",
  "buildingInspection", "sectionCases", "surveyCases", "surveyIncomplete",
  "sectionIncomplete", "sectionAppeal", "farmProperties", "accessibleStops",
  "roadLength", "recreationArea", "recreationSites", "fireInspection", "waterPlants",
  "sewagePlants", "sewageNetworkLength", "sewagePumps", "recreationTrails",
  "recreationAccessible", "recreationSki", "heritageRegistered", "heritageSupport",
  "heritageOrders", "libraryEvents", "librarySites", "cinemaScreens", "cinemaShows",
  "sportsArea", "cultureArea", "churchServices", "churchParishes", "faithMembers", "deaths",
];

export const DRIVER_RATES = {
  ...Object.fromEntries(perThousandResidents.map((key) => [
    key, { denominator: "population", scale: 1000, suffix: "per 1 000 innb." },
  ])),
  ...Object.fromEntries(["agePreschool", "ageSchool", "ageYouth", "ageOlder"].map((key) => [
    key, { denominator: "population", scale: 100, unit: "% av befolkningen" },
  ])),
  ...Object.fromEntries(["waterConnected", "sewageBioChem", "septicConnected"].map((key) => [
    key, { denominator: "population", scale: 100, suffix: "per 100 innb." },
  ])),
  pupils: { denominator: "ageSchool", scale: 100, suffix: "per 100 innb. 6–15 år",
    note: "Elevtall etter skolekommune, sett opp mot bosatte i skolealder. Elever kan gå på skole i en annen kommune." },
  schoolFte: { denominator: "pupils", scale: 100, suffix: "per 100 elever i kommunale skoler",
    note: "Alle avtalte årsverk ført på funksjon 202, inkludert andre stillinger enn lærere." },
  schoolArea: { denominator: "pupils", scale: 1, suffix: "per elev i kommunal skole" },
  adultFte: { denominator: "adultLearners", scale: 100, suffix: "per 100 deltakere i voksenopplæring" },
  preschoolArea: { denominator: "agePreschool", scale: 1, suffix: "per innb. 1–5 år" },
  kindergartenDisability: { denominator: "agePreschool", scale: 1000, suffix: "per 1 000 innb. 1–5 år" },
  youthFte: { denominator: "ageYouth", scale: 1000, suffix: "per 1 000 innb. 6–20 år" },
  youthGrants: { denominator: "ageYouth", scale: 1000, suffix: "per 1 000 innb. 6–20 år" },
  artsFte: { denominator: "ageSchool", scale: 1000, suffix: "per 1 000 innb. 6–15 år" },
  careDementia: { denominator: "carePlaces", scale: 100, unit: "% av institusjonsplassene" },
  institutionArea: { denominator: "carePlaces", scale: 1, suffix: "per disponibel institusjonsplass",
    note: "Eid og leid kommunalt areal relativt til samlet plasskapasitet, som også kan omfatte private plasser." },
  farmCases: { denominator: "farmProperties", scale: 100, suffix: "per 100 landbrukseiendommer" },
  waterVolume: { denominator: "waterConnected", scale: 1, suffix: "per tilknyttet innb.",
    note: "Samlet vannleveranse per tilknyttet innbygger, inkludert annet forbruk enn husholdningenes." },
  waterNetwork: { denominator: "waterConnected", scale: 1, suffix: "per tilknyttet innb." },
  libraryVisits: { denominator: "population", scale: 1, suffix: "per innb." },
  cinemaVisits: { denominator: "population", scale: 1, suffix: "per innb." },
};

// This percentage is already published by SSB. Keep its matching count as context.
export const PUBLISHED_RATE_COUNTS = { schoolTransport: "schoolTransportCount" };
