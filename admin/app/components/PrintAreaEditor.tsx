import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, BlockStack, Box, Button, InlineStack, Text } from "@shopify/polaris";
import { detectFrame, type Frame } from "../lib/frame";

type Status = "idle" | "detecting" | "unreadable" | "not-found" | "done";

// The studio's own print-zone maths, loaded from the deployed bundle rather than reimplemented,
// so what this draws is literally what the studio will enforce.
type Layout = {
  areas: { id: string; label: string; kind: string; rect: { x: number; y: number; w: number; h: number } }[];
  spots: { id: string; label: string; areaId: string; cx: number; cy: number; width: number }[];
};
type Placements = {
  garmentPrintLayout: (o: { category: string; name: string; fit: string; side: string; frame?: Frame; mirrored?: boolean }) => Layout;
  STAGE_PAD_FRAC: number;
};

let placementsPromise: Promise<Placements> | null = null;
function loadPlacements(host: string): Promise<Placements> {
  placementsPromise ??= import(/* @vite-ignore */ `${host}/piobox-customizer/placements.js`) as Promise<Placements>;
  return placementsPromise;
}

type Props = {
  host: string;
  photoUrl: string | null;
  side: "front" | "back";
  category: string;
  fit: string;
  productName: string;
  frame: Frame | null;
  onChange: (frame: Frame | null) => void;
};

/**
 * Shows the garment photo with its detected bounding box and the print zones that follow from
 * it. The box is draggable because detection cannot know, for instance, that a hanger or a
 * shadow is not part of the garment.
 */
export function PrintAreaEditor({ host, photoUrl, side, category, fit, productName, frame, onChange }: Props) {
  const [placements, setPlacements] = useState<Placements | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [drag, setDrag] = useState<null | { mode: "move" | "resize"; startX: number; startY: number; start: Frame }>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadPlacements(host).then(setPlacements).catch(() => setPlacements(null));
  }, [host]);

  const detect = useCallback(async () => {
    if (!photoUrl) return;
    setStatus("detecting");
    try {
      const r = await detectFrame(photoUrl);
      if (r.ok) { onChange(r.frame); setStatus("done"); } else setStatus(r.reason);
    } catch {
      setStatus("not-found");
    }
  }, [photoUrl, onChange]);

  // Detect once per photo, but never overwrite a frame someone has already adjusted.
  useEffect(() => {
    if (photoUrl && !frame) void detect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoUrl]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const el = boxRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - drag.startX) / r.width;
      const dy = (e.clientY - drag.startY) / r.height;
      const s = drag.start;
      if (drag.mode === "move") {
        onChange({ ...s, cx: clamp(s.cx + dx, s.w / 2, 1 - s.w / 2), cy: clamp(s.cy + dy, s.h / 2, 1 - s.h / 2) });
      } else {
        const w = clamp(s.w + dx * 2, 0.05, Math.min(1, 2 * Math.min(s.cx, 1 - s.cx)));
        const h = clamp(s.h + dy * 2, 0.05, Math.min(1, 2 * Math.min(s.cy, 1 - s.cy)));
        onChange({ ...s, w: r4(w), h: r4(h) });
      }
    };
    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [drag, onChange]);

  if (!photoUrl) {
    return (
      <Box background="bg-surface-secondary" padding="600" borderRadius="200">
        <Text as="p" tone="subdued" alignment="center">Choose a {side} photo to set its print area.</Text>
      </Box>
    );
  }

  const layout = placements && frame
    ? placements.garmentPrintLayout({ category, name: productName, fit, side, frame })
    : null;

  // Zone rects are in stage coordinates; the photo fills the same square stage, so they map 1:1.
  return (
    <BlockStack gap="300">
      <Box position="relative" background="bg-surface-secondary" borderRadius="200">
        <div ref={boxRef} style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", overflow: "hidden", borderRadius: 8 }}>
          <img src={photoUrl} alt="" style={{ position: "absolute", inset: "2.2%", width: "95.6%", height: "95.6%", objectFit: "contain" }} />

          {frame ? (
            <div
              onPointerDown={(e) => { e.preventDefault(); setDrag({ mode: "move", startX: e.clientX, startY: e.clientY, start: frame }); }}
              style={{
                position: "absolute",
                left: `${pct(frameLeft(frame))}%`, top: `${pct(frameTop(frame))}%`,
                width: `${pct(frame.w * inner())}%`, height: `${pct(frame.h * inner())}%`,
                border: "1.5px dashed #5c5f62", borderRadius: 4, cursor: drag?.mode === "move" ? "grabbing" : "grab",
              }}
            >
              <div
                onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); setDrag({ mode: "resize", startX: e.clientX, startY: e.clientY, start: frame }); }}
                style={{ position: "absolute", right: -7, bottom: -7, width: 14, height: 14, borderRadius: 3, background: "#fff", border: "1.5px solid #5c5f62", cursor: "nwse-resize" }}
              />
            </div>
          ) : null}

          {layout?.areas.map((a) => (
            <div
              key={a.id}
              title={a.label}
              style={{
                position: "absolute", pointerEvents: "none",
                left: `${a.rect.x * 100}%`, top: `${a.rect.y * 100}%`,
                width: `${a.rect.w * 100}%`, height: `${a.rect.h * 100}%`,
                border: "1.5px solid rgba(0,128,96,.9)", background: "rgba(0,128,96,.08)", borderRadius: 2,
              }}
            />
          ))}
          {layout?.spots.map((s) => (
            <div
              key={s.id}
              title={s.label}
              style={{
                position: "absolute", pointerEvents: "none",
                left: `${(s.cx - s.width / 2) * 100}%`, top: `${(s.cy - s.width / 2) * 100}%`,
                width: `${s.width * 100}%`, height: `${s.width * 100}%`,
                border: "1px dashed rgba(0,128,96,.55)", borderRadius: 2,
              }}
            />
          ))}
        </div>
      </Box>

      <InlineStack gap="200" align="space-between" blockAlign="center">
        <InlineStack gap="200" blockAlign="center">
          {status === "detecting" ? <Badge tone="attention">Finding the garment…</Badge>
            : status === "unreadable" ? <Badge tone="critical">Image blocked reading — set the box by hand</Badge>
            : status === "not-found" ? <Badge tone="warning">No garment found — set the box by hand</Badge>
            : frame ? <Badge tone="success">{`${layout?.areas.length ?? 0} print areas`}</Badge>
            : <Badge>No area set</Badge>}
          {!placements && frame ? <Text as="span" tone="subdued" variant="bodySm">Loading zone maths…</Text> : null}
        </InlineStack>
        <InlineStack gap="200">
          <Button size="slim" onClick={detect} loading={status === "detecting"}>Re-detect</Button>
          {frame ? <Button size="slim" tone="critical" variant="tertiary" onClick={() => { onChange(null); setStatus("idle"); }}>Clear</Button> : null}
        </InlineStack>
      </InlineStack>

      <Text as="p" tone="subdued" variant="bodySm">
        The dashed box is the garment. Green is where customers may place artwork — drag or resize the
        box until the green sits where you would actually print.
      </Text>
    </BlockStack>
  );
}

// Mirrors stageBoxFromFrame(): the photo is inset by the stage padding, so the overlay must be too.
const PAD = 12 / 544;
const inner = () => 1 - 2 * PAD;
const frameLeft = (f: Frame) => PAD + (f.cx - f.w / 2) * inner();
const frameTop = (f: Frame) => PAD + (f.cy - f.h / 2) * inner();
const pct = (v: number) => v * 100;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r4 = (v: number) => Math.round(v * 10000) / 10000;
