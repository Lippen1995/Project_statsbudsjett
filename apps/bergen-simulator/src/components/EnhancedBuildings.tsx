import { useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";
import type { CityData } from "../geo/types";
import type { EnhancementTile } from "../enhancements/load";
import { useEnhancements } from "../enhancements/state";
import { recordPreparation } from "../geo/diagnostics";

export function useEnhancementTile(data: CityData, eligible: boolean) {
  const enabled = useEnhancements((s) => s.enabled);
  const [tile, setTile] = useState<EnhancementTile | null>(null);
  useEffect(() => {
    if (!enabled || !eligible) {
      setTile(null);
      useEnhancements.setState({ status: enabled ? "paused" : "off" });
      return;
    }
    let stale = false,
      owned: EnhancementTile | null = null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const start = performance.now();
    useEnhancements.setState({ status: "loading" });
    import("../enhancements/load")
      .then(({ loadEnhancements }) => loadEnhancements(data, controller.signal))
      .then((result) => {
        if (stale) {
          result.dispose();
          return;
        }
        owned = result;
        recordPreparation(
          "public-geodata.fetch-decode-batch",
          performance.now() - start,
        );
        setTile(result);
        useEnhancements.setState({ status: "ready" });
      })
      .catch(() => {
        if (!stale) {
          setTile(null);
          useEnhancements.setState({ status: "unavailable" });
        }
      })
      .finally(() => clearTimeout(timer));
    return () => {
      stale = true;
      clearTimeout(timer);
      controller.abort();
      owned?.dispose();
    };
  }, [data, eligible, enabled]);
  return enabled && eligible ? tile : null;
}

export function EnhancementShadows({ tile }: { tile: EnhancementTile | null }) {
  const { gl, invalidate } = useThree();
  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    invalidate();
  }, [gl, invalidate, tile]);
  return null;
}
