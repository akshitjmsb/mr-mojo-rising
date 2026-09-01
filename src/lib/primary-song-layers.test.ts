import assert from "node:assert/strict";
import test from "node:test";
import type { StemLayer } from "./database.types";
import { selectPrimarySongLayers } from "./primary-song-layers";

function layer(
  layerKey: string,
  instrument: StemLayer["instrument"],
  role: string,
): StemLayer {
  return {
    id: layerKey,
    song_id: "song",
    layer_key: layerKey,
    label: layerKey,
    instrument,
    role,
    url: `https://example.com/${layerKey}.mp3`,
    source_model: null,
    quality_status: "ready",
    is_learnable: instrument === "guitar" ? 1 : 0,
    sort_order: 0,
    updated_at: 0,
  };
}

test("keeps exactly the four intentional song layers", () => {
  const selected = selectPrimarySongLayers([
    layer("drums", "drums", "all"),
    layer("all-guitars", "guitar", "all"),
    layer("vocals", "vocals", "all"),
    layer("bass", "bass", "all"),
    layer("lead", "guitar", "lead"),
    layer("full", "full", "all"),
    layer("rhythm", "guitar", "rhythm"),
  ]);

  assert.deepEqual(
    selected.map(({ kind, layer: selectedLayer }) => [
      kind,
      selectedLayer.layer_key,
    ]),
    [
      ["full", "full"],
      ["vocals", "vocals"],
      ["rhythm", "rhythm"],
      ["lead", "lead"],
    ],
  );
});

test("uses the combined guitar only as a hidden fallback", () => {
  const selected = selectPrimarySongLayers([
    layer("full", "full", "all"),
    layer("vocals", "vocals", "all"),
    layer("all-guitars", "guitar", "all"),
  ]);

  assert.deepEqual(
    selected.map(({ kind, layer: selectedLayer, dedicated }) => ({
      kind,
      key: selectedLayer.layer_key,
      dedicated,
    })),
    [
      { kind: "full", key: "full", dedicated: true },
      { kind: "vocals", key: "vocals", dedicated: true },
      { kind: "rhythm", key: "all-guitars", dedicated: false },
      { kind: "lead", key: "all-guitars", dedicated: false },
    ],
  );
});
