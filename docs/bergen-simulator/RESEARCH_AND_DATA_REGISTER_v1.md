# Research, regulation and data register v1

**Status:** Investigation plan, not a legal opinion or completed empirical validation. Each proposed rule requires primary-source verification, effective date, jurisdiction and test case before it becomes authoritative game logic.

| Domain | Primary research direction | Required output / blocker |
|---|---|---|
| Bergen political system | Bergen municipality: byråd, bystyre, committee procedure, delegated powers and meeting calendar | Versioned decision authority matrix, quorum/voting workflow, budget dates |
| Municipal finance | Kommuneloven chapter 14, budget/accounting regulations, KOSTRA accounting guides, Bergen budget and annual reports | NOK chart of accounts, annual/four-year constraints, reconciliation tests |
| State grants | Regjeringen/Kommunal- og distriktsdepartementet Grønt hefte by fiscal year, adopted state budget, SSB criteria | Exact formula inputs, effective dates, proposal vs enacted, reproducing official examples |
| Tax and equalization | Tax Directorate/SSB and income system documents | Separate resident/taxpayer bases, lag, distribution, equalization; no simplistic salary-to-revenue multiplier |
| Procurement | Anskaffelsesloven/forskriften, DFØ guidance, municipal procurement rules | Thresholds, tender paths, change-order restrictions, competition exceptions |
| Municipal guarantees | Kommuneloven §14-19, garantiforskriften, state approval and local case records | Validity gate, ceiling, guarantee recipient, duration, contingent risk and approval |
| Project finance | Public project documents, KS1/KS2 where applicable, contracts/OPS documentation | Funding role graph; P50/P85 only where applicable; inflation/base-year comparability |
| Sotrasambandet | Statens vegvesen official project updates and OPS contract material | As-of-date ownership, stage, costs, funding and no undocumented municipal liability |
| Building inventory | Kartverket/Geonorge, OSM, Bergen municipality open data, Matrikkelen access rules | Licensed 3D source, heights, roofs, addresses, municipal building uses and missingness |
| Traffic | Official road geometry and validated traffic counts, Vegvesen sources | Local calibration/coverage; no fake citywide congestion |
| Population | SSB population cohorts, KOSTRA, employment, housing and registered residence | Municipality-wide cohort baseline and flow/stock reconciliation |
| Project uncertainty | NTNU Concept, public audit reports, municipal investment outturn data | Reference class by project type/contract/size; confidence intervals and data limits |
| LIVE real-time layers | Weather/traffic data providers, open licenses and rate terms | Truth labels, polling cadence, permission and fallback |

## Source/versioning standard

Every ingested fact must include source URI, publisher, retrieval date, applicable period, jurisdiction, license, raw hash and transformation version. Preserve historical 'as of' state and explain later corrections. Missing information is NULL/unknown, never silently imputed as fact. Simulated values have scenario ID, seed and model version.

## Required expert research questions

1. Which Bergen byråd actions require a bystyre vote, and which are delegated?
2. Which budget meetings and deadlines are statutory versus conventional?
3. How do state grant criteria change by fiscal year, and how are proposal and adopted appropriations distinguished?
4. What municipal project cost reports are publicly available, with which baselines and revisions?
5. Under what conditions can Bergen legally guarantee a third party's obligations? What happens on default?
6. Which parts of Sotrasambandet fall within Bergen's actual competence and contractual exposure?
7. What open licensed sources can support recognisable roof/facade/landmark geometry at web scale?
8. What empirical evidence supports frequencies of construction delays, cost overruns and mobilization?

## Acceptance of research

A legal or financial rule enters production only after a source-backed specification, effective-date tests, counterexamples, documented uncertainty and review. Project delay/cost calibration must state reference population, years and sample selection; historical state megaproject frequencies are **not** Bergen municipal project frequencies.
