import type { StemLayer } from "./database.types";

export type PrimarySongLayerKind = "full" | "vocals" | "rhythm" | "lead";

export type PrimarySongLayer = {
  kind: PrimarySongLayerKind;
  layer: StemLayer;
  dedicated: boolean;
};

function bestLayer(
  layers: StemLayer[],
  predicate: (layer: StemLayer) => boolean,
) {
  return (
    layers.find(
      (layer) => predicate(layer) && layer.quality_status === "ready",
    ) ?? layers.find(predicate)
  );
}

export function selectPrimarySongLayers(
  layers: StemLayer[],
): PrimarySongLayer[] {
  const full = bestLayer(layers, (layer) => layer.instrument === "full");
  const vocals = bestLayer(layers, (layer) => layer.instrument === "vocals");
  const combinedGuitar = bestLayer(
    layers,
    (layer) => layer.instrument === "guitar" && layer.role === "all",
  );
  const rhythm = bestLayer(
    layers,
    (layer) => layer.instrument === "guitar" && layer.role === "rhythm",
  );
  const lead = bestLayer(
    layers,
    (layer) => layer.instrument === "guitar" && layer.role === "lead",
  );

  return [
    full ? { kind: "full" as const, layer: full, dedicated: true } : null,
    vocals ? { kind: "vocals" as const, layer: vocals, dedicated: true } : null,
    rhythm || combinedGuitar
      ? {
          kind: "rhythm" as const,
          layer: rhythm ?? combinedGuitar!,
          dedicated: Boolean(rhythm),
        }
      : null,
    lead || combinedGuitar
      ? {
          kind: "lead" as const,
          layer: lead ?? combinedGuitar!,
          dedicated: Boolean(lead),
        }
      : null,
  ].filter((item): item is PrimarySongLayer => item !== null);
}
