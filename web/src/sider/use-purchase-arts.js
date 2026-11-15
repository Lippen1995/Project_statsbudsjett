import { useEffect, useState } from "react";

const requests = new Map();

export function usePurchaseArts(functionCode) {
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!functionCode) return;
    let request = requests.get(functionCode);
    if (request?.result) return;
    let active = true;
    if (!request) {
      request = {};
      request.promise = fetch(`/data/kostra/purchase-arts/${functionCode}.json`)
        .then((response) => {
          if (!response.ok) throw new Error("Mangler KOSTRA-uttrekk");
          return response.json();
        })
        .then((data) => {
          if (!Array.isArray(data?.columns) || !data.rows) throw new Error("Ugyldig KOSTRA-uttrekk");
          request.result = { functionCode, data };
          return request.result;
        })
        .catch((error) => {
          requests.delete(functionCode);
          throw error;
        });
      requests.set(functionCode, request);
    }
    request.promise.then((result) => {
      if (active) setResult(result);
    }).catch(() => {
      if (active) setResult({ functionCode, error: true });
    });
    return () => { active = false; };
  }, [functionCode, attempt]);

  const cached = requests.get(functionCode)?.result;
  const current = cached ?? (result?.functionCode === functionCode ? result : null);
  return {
    purchaseArts: current?.data ? current : null,
    pending: Boolean(functionCode && !current),
    error: current?.error,
    retry: () => {
      setResult(null);
      setAttempt((n) => n + 1);
    },
  };
}

export function withPurchaseArts(detail, purchaseArts) {
  return detail && purchaseArts ? { ...detail, purchaseArts } : detail;
}
