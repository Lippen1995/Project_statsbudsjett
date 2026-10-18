import { BENCHMARK_VIEWS } from "../geo/benchmark";
import { useCity } from "../state/store";

export default function BenchmarkViews() {
  const view = useCity((s) => s.viewBenchmark);
  return (
    <nav className="benchmark-views" aria-label="Bryggen benchmark views">
      <span>BRYGGEN / VÅGEN</span>
      {BENCHMARK_VIEWS.map((v) => (
        <button key={v.id} onClick={() => view(v.id)}>
          {v.name}
        </button>
      ))}
    </nav>
  );
}
