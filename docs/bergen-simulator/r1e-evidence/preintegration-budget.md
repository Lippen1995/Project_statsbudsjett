# R1E — port før renderintegrasjon

Fastlagt før runtime-integrasjonen, 21.10.2026. Baseline er gren-HEAD
`c87db8bfe73e4e73a49bc0160a91116615274893`, renderer R1C.

- Høyst 16 eksisterende, høydeukjente kildebygg i én avgrenset Bryggen-flis.
  Ingen endring av de sju tidligere R1B/R1C-assets, snapshots eller spilltilstander.
- Kun støtte fra låst native 25 cm DOM/DTM, prosjekt 6266 / NN2000.
  Rastertilpassede tak er ANSLÅTT; ingen uavhengig survey- eller fasadepåstand.
- Kompilert GLB ≤256 KiB, ≤2 500 nye trekanter, ingen nye teksturer.
- Høyst én ekstra draw call i et ferdig tegnet bilde; rendering på etterspørsel.
- Ny indeksvisning og takbatch samlet ≤4 MiB ekstra observerte attributt-/indeksdata.
  Dette er bufferstørrelser, ikke målt fysisk VRAM.
- Slått av som standard. Toggle, lav effekt, feil, eviksjon og reset til opprinnelig
  visning må gi trygg fallback. Ingen ny konstruksjon eller ukjent bygg blir fakta.
- Lokale, like kameraer/viewport/DPR/CSP før/etter, desktop og emulert touch.
  Sammenlign GL-finish-kameraprobe, median/P95, idle og ressursretensjon.
- Veiledende programvare-regresjonsgrense: median/P95 øker høyst 20 % eller 25 ms
  (største toleranse), initial scene høyst 15 % eller 300 ms. Undersøk brudd,
  behold råmålinger; ikke fremstill SwiftShader som iPhone-/native-GPU-ytelse.
- Null ferdigstilte idle-frames etter innlasting og avsluttet kamerabevegelse.
  Fem av/på-runder må ikke gi voksende beholdt geometri/teksturer.
- Geografi, object-ID/picking, lag, tilgjengelighet, legacy saves og eksisterende
  spilltester beholdes. Mislykket kilde-/asset-gate beholder originalvisningen.
