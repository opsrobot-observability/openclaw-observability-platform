import { uid } from "./agui.js";
import { SRE_VIZ_TYPES } from "./sreMessageVizExtract.js";

/**
 * @param {object} model
 * @returns {object | null}
 */
export function sreVizModelToPanel(model) {
  if (!model || typeof model !== "object" || Array.isArray(model)) return null;
  const t = model.type;
  if (typeof t !== "string" || !SRE_VIZ_TYPES.has(t)) return null;
  return {
    id: `msg-viz-${t}-${uid("p")}`,
    type: `sre_viz_${t}`,
    payload: model,
  };
}
