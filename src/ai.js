/* the AI player: one person whose dots are placed by the model.
   Rates all ideas in a single request — payoff grounded in the stored
   feasibility research when available, hype by a "fun to build for a
   small indie team" rubric. */

import { uid } from "./helpers.js";
import { state, getPl, touched } from "./store.js";
import { view, render } from "./view.js";
import { getKey } from "./feasibility.js";

const AI_NAME = "Kimi AI";

let status = null; // label shown on the tab button while rating
export const aiStatus = () => status;

const aiPerson = () => state.people.find(p=>p.isAI);

export async function runAiRating(){
  if(status) return;
  if(!state.ideas.length){ alert("Add some ideas first — the AI needs something to rate."); return; }
  const existing = aiPerson();
  if(!confirm(existing
    ? "Let the AI re-rate every idea on its matrix? This uses your OpenRouter credits."
    : "Add an AI player that rates every idea on its own matrix? This uses your OpenRouter credits.")) return;
  const key = getKey();
  if(!key) return;

  const started = Date.now();
  const ticker = setInterval(()=>{
    status = "AI is rating… " + Math.round((Date.now() - started) / 1000) + "s";
    render();
  }, 1000);
  status = "AI is rating…";
  render();

  try{
    const { summary, ratings } = await fetchRatings(key);
    const p = existing || { id: uid(), name: AI_NAME, isAI: true };
    if(!existing) state.people.push(p);
    p.aiNote = summary;
    const pl = getPl(p.id);
    const clamp = v => Math.min(0.97, Math.max(0.03, Number(v)));
    ratings.forEach(r=>{
      if(!state.ideas.some(i=>i.id===r.id)) return;
      if(isFinite(r.hype) && isFinite(r.payoff)) pl[r.id] = { x: clamp(r.hype), y: clamp(r.payoff) };
    });
    view.currentTab = p.id;
    touched();
  }catch(err){
    console.error("AI rating failed", err);
    alert("AI rating failed: " + err.message);
  }finally{
    clearInterval(ticker);
    status = null;
    render();
  }
}

async function fetchRatings(key){
  const ideasBlock = state.ideas.map(i=>{
    let b = `id: ${i.id}\nname: ${i.name}`;
    if(i.desc) b += `\ndescription: ${i.desc}`;
    if(i.feasibility) b += `\nresearch notes:\n${i.feasibility.text.slice(0,1500)}`;
    return b;
  }).join("\n---\n");

  const promptText =
`You are rating startup ideas for a 2x2 matrix used by a small indie team (1-3 people, building on the side).

Rate EVERY idea on two axes, each a number from 0.00 to 1.00:

hype — how exciting and fun it would be to BUILD for this team:
- tangible, consumer-facing products with quick visible progress score higher
- feels like a fun side project rather than a company you must commit years to
- heavy bureaucracy, regulation, enterprise sales, or grindy hard-to-crack spaces score lower

payoff — how much it could realistically return:
- use the research notes (market size, similar companies) when provided
- feasibility for a tiny team, willingness to pay, market size
- crowded spaces with strong incumbents score lower

Spread the scores across the whole range so ideas are clearly separated — avoid clustering around 0.5.

Ideas:
${ideasBlock}

Reply with ONLY JSON, no markdown fences, in exactly this shape (one ratings entry per idea):
{"summary":"1-2 sentences explaining how you weighed the ideas and what separated the top from the bottom","ratings":[{"id":"<idea id>","hype":0.72,"payoff":0.35}]}`;

  // no web search here — the research is already in the prompt
  const model = ((typeof OPENROUTER_MODEL !== "undefined" && OPENROUTER_MODEL) || "moonshotai/kimi-k3").replace(":online", "");

  const ctrl = new AbortController();
  const timeout = setTimeout(()=>ctrl.abort(), 180000);
  try{
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: promptText }] })
    });
    if(res.status === 401){
      try{ window.localStorage.removeItem("openrouter-key"); }catch(e){}
      throw new Error("invalid API key — it was cleared, try again to enter it");
    }
    if(!res.ok){
      let msg = "OpenRouter answered " + res.status;
      try{ msg += " — " + (JSON.parse(await res.text()).error?.message || ""); }catch(e){}
      throw new Error(msg);
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    let summary = "", ratings = null;
    try{
      const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
      summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
      ratings = parsed.ratings;
    }catch(e){
      // fall back to a bare array, in case the model skipped the wrapper
      ratings = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1));
    }
    if(!Array.isArray(ratings) || !ratings.length) throw new Error("no ratings in the response");
    return { summary, ratings };
  }catch(err){
    if(err.name === "AbortError") throw new Error("timed out after 3 minutes");
    throw err;
  }finally{
    clearTimeout(timeout);
  }
}
