/* pure utilities — no app state */

export const uid = () => Math.random().toString(36).slice(2,9);

export const esc = s => s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

export const arrows = s => s.replace(/->/g, "→"); // typed "->" becomes a real arrow

/* first letter of the first three words: "Service for Outfits" -> "SFO" */
export const abbrev = name => name.trim().split(/\s+/).slice(0,3).map(w=>w[0]).join("").toUpperCase();

/* person initials, max two letters */
export const initials = name => name.trim().split(/\s+/).map(w=>w[0]).join("").slice(0,2).toUpperCase();
