/**
 * trace_call_chain 多 schema → prepareTraceWaterfall 可用的 flame_chart / sequence_diagram。
 */

function timeBaseMs(model) {
  const s = model?.time_range?.start || model?.time_window?.start;
  if (!s) return null;
  const ms = Date.parse(String(s));
  return Number.isFinite(ms) ? ms : null;
}

function offsetToHms(baseMs, offsetMs) {
  if (!Number.isFinite(baseMs) || !Number.isFinite(offsetMs)) return null;
  const d = new Date(baseMs + offsetMs);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const sec = d.getUTCSeconds();
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function nodeMapFromServices(services) {
  const map = new Map();
  for (const svc of services) {
    const id = String(svc || "").trim();
    if (!id || map.has(id)) continue;
    map.set(id, { id, name: id, type: "service", status: "normal", depth: 0 });
  }
  return [...map.values()];
}

function buildFromCallChain(model) {
  const baseMs = timeBaseMs(model);
  const chain = Array.isArray(model.call_chain) ? model.call_chain : [];
  if (!chain.length || !Number.isFinite(baseMs)) return null;
  const byId = new Map(chain.map((x) => [String(x?.span_id || ""), x]));
  const services = [];
  for (const it of chain) {
    if (it?.service) services.push(String(it.service));
  }
  const nodes = nodeMapFromServices(services);
  const edges = [];
  for (const it of chain) {
    const pid = it?.parent_span_id != null ? String(it.parent_span_id) : "";
    const par = pid ? byId.get(pid) : null;
    const fromSvc = par ? String(par.service || par.span_id || "") : "";
    const toSvc = String(it.service || it.span_id || "");
    if (!toSvc) continue;
    const off = Number(it.start_time_offset_ms ?? it.start_offset_ms ?? 0);
    const time = offsetToHms(baseMs, off);
    if (!time) continue;
    if (fromSvc) {
      edges.push({
        from: fromSvc,
        to: toSvc,
        label: String(it.operation || it.anomaly || "").trim(),
        time,
      });
    }
  }
  const sequence = chain
    .map((it, i) => {
      const par = it?.parent_span_id != null ? byId.get(String(it.parent_span_id)) : null;
      const off = Number(it.start_time_offset_ms ?? it.start_offset_ms ?? i * 1000);
      const time = offsetToHms(baseMs, off);
      if (!time) return null;
      return {
        time,
        from: par ? String(par.service || par.span_id || "") : String(it.service || ""),
        to: String(it.service || it.span_id || ""),
        msg: String(it.anomaly || it.operation || it.error || "").trim(),
        type: String(it.status || "seq").toLowerCase().replace(/_/g, "-"),
        trace_id: it.trace_id || null,
      };
    })
    .filter(Boolean);
  return { nodes, edges, sequence };
}

function buildFromSpans(model) {
  const baseMs = timeBaseMs(model);
  const spans = Array.isArray(model.flame_chart?.spans) ? model.flame_chart.spans : [];
  if (!spans.length || !Number.isFinite(baseMs)) return null;
  const bySp = new Map(spans.map((s) => [String(s?.span_id || ""), s]));
  const services = spans.map((s) => String(s?.service || "").trim()).filter(Boolean);
  const nodes = nodeMapFromServices(services);
  const edges = [];
  const sorted = [...spans].sort((a, b) => (Number(a.start_offset_ms) || 0) - (Number(b.start_offset_ms) || 0));
  const sequence = [];
  for (const sp of sorted) {
    const pid = sp?.parent_id != null ? String(sp.parent_id) : "";
    const par = pid ? bySp.get(pid) : null;
    const off = Number(sp.start_offset_ms ?? 0);
    const time = offsetToHms(baseMs, off);
    if (!time) continue;
    const toSvc = String(sp.service || "").trim();
    if (!toSvc) continue;
    const fromSvc = par ? String(par.service || "").trim() : toSvc;
    if (par && fromSvc && toSvc) {
      edges.push({
        from: fromSvc,
        to: toSvc,
        label: String(sp.operation || sp.anomaly_type || "").trim(),
        time,
      });
    }
    sequence.push({
      time,
      from: fromSvc || toSvc,
      to: toSvc,
      msg: String(sp.operation || sp.anomaly_type || sp.error || "").trim(),
      type: String(sp.status || "seq").toLowerCase().replace(/_/g, "-"),
      trace_id: sp.trace_id || null,
    });
  }
  return { nodes, edges, sequence };
}

function buildSequenceFromDiagramEdges(model) {
  const baseMs = timeBaseMs(model);
  const eds = model?.sequence_diagram?.edges;
  if (!Array.isArray(eds) || !eds.length || !Number.isFinite(baseMs)) return [];
  return eds
    .map((ed, i) => ({
      time: offsetToHms(baseMs, i * 1000),
      from: String(ed?.from || ""),
      to: String(ed?.to || ""),
      msg: String(ed?.label || ed?.description || "").trim(),
      type: String(ed?.status || "seq").toLowerCase().replace(/_/g, "-"),
      trace_id: ed?.trace_id || null,
    }))
    .filter((s) => s.time && s.from && s.to);
}

function diagramNodesToFlameNodes(seqNodes) {
  if (!Array.isArray(seqNodes)) return [];
  return seqNodes
    .map((n) => {
      if (!n || typeof n !== "object") return null;
      const id = String(n.id || "").trim();
      if (!id) return null;
      return {
        id,
        name: String(n.label || n.name || id).trim() || id,
        type: String(n.type || "ref"),
        status: String(n.status || "normal").toLowerCase(),
        depth: Number(n.depth) || 0,
      };
    })
    .filter(Boolean);
}

/**
 * @param {object} raw
 * @returns {object}
 */
export function normalizeTraceCallChainModel(raw) {
  const m = raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  if (m.type && String(m.type) !== "trace_call_chain") return m;

  const seqDiag = m.sequence_diagram && typeof m.sequence_diagram === "object" ? { ...m.sequence_diagram } : {};
  const flame = m.flame_chart && typeof m.flame_chart === "object" ? { ...m.flame_chart } : {};

  if (Array.isArray(m.call_chain) && m.call_chain.length) {
    const built = buildFromCallChain(m);
    if (built) {
      m.flame_chart = { ...flame, nodes: built.nodes, edges: built.edges };
      m.sequence_diagram = { ...seqDiag, sequence: built.sequence || [] };
      return m;
    }
  }

  if (Array.isArray(flame.spans) && flame.spans.length) {
    const built = buildFromSpans(m);
    if (built) {
      const seqNodes = diagramNodesToFlameNodes(seqDiag.nodes);
      const mergedNodes = [...built.nodes];
      for (const n of seqNodes) {
        if (!mergedNodes.some((x) => x.id === n.id)) mergedNodes.push(n);
      }
      m.flame_chart = { ...flame, nodes: mergedNodes, edges: built.edges };
      if (!Array.isArray(seqDiag.sequence) || !seqDiag.sequence.length) {
        const seq = buildSequenceFromDiagramEdges({ ...m, sequence_diagram: seqDiag });
        const useSeq = seq.length ? seq : built.sequence || [];
        m.sequence_diagram = { ...seqDiag, sequence: useSeq };
      } else {
        m.sequence_diagram = seqDiag;
      }
      return m;
    }
  }

  const seqEmpty = !Array.isArray(seqDiag.sequence) || seqDiag.sequence.length === 0;
  if (seqDiag.edges?.length && seqEmpty) {
    const seq = buildSequenceFromDiagramEdges({ ...m, sequence_diagram: seqDiag });
    if (seq.length) {
      m.sequence_diagram = { ...seqDiag, sequence: seq };
      const fn = diagramNodesToFlameNodes(seqDiag.nodes);
      const fc0 = m.flame_chart && typeof m.flame_chart === "object" ? m.flame_chart : {};
      const noNodes = !Array.isArray(fc0.nodes) || !fc0.nodes.length;
      const noEdges = !Array.isArray(fc0.edges) || !fc0.edges.length;
      if (fn.length && (noNodes || noEdges)) {
        m.flame_chart = { ...flame, ...fc0, nodes: fn.length ? fn : fc0.nodes || [], edges: fc0.edges || [] };
      }
    }
  }

  return m;
}
