/* AI feasibility check via OpenRouter.
   The API key is asked for once and kept in this browser only —
   it is never written to the shared board or the repo. */

import { esc } from "./helpers.js";
import { state, touched } from "./store.js";
import { render } from "./view.js";

let feasIdeaId = null; // idea currently shown in the modal

/* the one entry point: show the stored result, or run a new check */
export function showFeasibility(idea){
  if(idea.feasibility){
    feasIdeaId = idea.id;
    openModal(idea);
  }else if(confirm(`Run an AI feasibility check for "${idea.name}"? This uses your OpenRouter credits.`)){
    runCheck(idea);
  }
}

function getKey(){
  let k = null;
  try{ k = window.localStorage.getItem("openrouter-key"); }catch(e){}
  if(!k){
    k = prompt("Paste your OpenRouter API key (sk-or-…).\nIt is stored only in this browser.");
    if(!k || !k.trim()) return null;
    k = k.trim();
    try{ window.localStorage.setItem("openrouter-key", k); }catch(e){}
  }
  return k;
}

/* minimal markdown -> HTML: headings, bullets, bold, clickable links */
function mdToHtml(md){
  let h = esc(md);
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // bare URLs become links labeled with their hostname
  h = h.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (m, pre, url)=>{
    let label = "source";
    try{ label = new URL(url).hostname.replace(/^www\./, ""); }catch(e){}
    return pre + '<a href="' + url + '" target="_blank" rel="noopener">' + label + "</a>";
  });
  h = h.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  let out = "", inList = false;
  h.split("\n").forEach(line=>{
    const l = line.trim();
    const isHead = /^#{1,4}\s+/.test(l) || /^[A-Z][A-Z0-9 .&/-]{3,}$/.test(l);
    if(inList && !/^[-*•]\s+/.test(l)){ out += "</ul>"; inList = false; }
    if(isHead) out += "<h4>" + l.replace(/^#{1,4}\s+/, "") + "</h4>";
    else if(/^[-*•]\s+/.test(l)){
      if(!inList){ out += "<ul>"; inList = true; }
      out += "<li>" + l.replace(/^[-*•]\s+/, "") + "</li>";
    }
    else if(l !== "") out += "<p>" + l + "</p>";
  });
  if(inList) out += "</ul>";
  return out;
}

function openModal(idea, status){
  document.getElementById("feasTitle").textContent = idea.name;
  const body = document.getElementById("feasBody");
  if(status){
    body.textContent = status;
  }else if(idea.feasibility){
    body.innerHTML = mdToHtml(idea.feasibility.text) +
      '<p class="feas-date">— checked ' + new Date(idea.feasibility.ts).toLocaleDateString() + "</p>";
  }else{
    body.textContent = "No check yet.";
  }
  document.getElementById("feasModal").hidden = false;
}

function closeModal(){
  document.getElementById("feasModal").hidden = true;
  feasIdeaId = null;
}

const setBody = html => { document.getElementById("feasBody").innerHTML = html; };

async function runCheck(idea){
  const key = getKey();
  if(!key) return;
  feasIdeaId = idea.id;
  openModal(idea, "Researching with web search…");

  /* show elapsed time until the first tokens arrive, and abort if the
     connection stalls — so a dead request never hangs forever */
  const started = Date.now();
  let streamedText = "";
  let lastData = Date.now();
  const ctrl = new AbortController();
  const ticker = setInterval(()=>{
    const secs = Math.round((Date.now() - started) / 1000);
    if(!streamedText && feasIdeaId === idea.id){
      setBody("<p>Researching with web search — " + secs + "s…<br>(the search itself can take 1-2 minutes)</p>");
    }
    if(Date.now() - lastData > 90000) ctrl.abort();
  }, 1000);

  const promptText =
`You are a pragmatic startup analyst. Do a quick feasibility check on this idea:

Idea: ${idea.name}
${idea.desc ? "Description: " + idea.desc : ""}

Use web search to ground your answer in real, current data. Reply in simple markdown: "##" for section headings, "-" for bullet points, **bold** for key numbers, and cite sources as inline markdown links like [Source name](https://…) — never paste bare URLs. Use exactly these sections:

## Market size
TAM, SAM and SOM as bullets with rough numbers, one line of reasoning each, and a source link.

## Similar companies
5-8 companies or products that already do something similar: **name** (linked to their site) — what they do — how this idea could differ.

## Verdict
2-3 sentences on overall feasibility and the single biggest risk.`;

  try{
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: (typeof OPENROUTER_MODEL !== "undefined" && OPENROUTER_MODEL) || "moonshotai/kimi-k3:online",
        messages: [{ role: "user", content: promptText }],
        stream: true,
        max_tokens: 1500
      })
    });
    if(res.status === 401){
      try{ window.localStorage.removeItem("openrouter-key"); }catch(e){}
      throw new Error("invalid API key — it was cleared, click 📈 to enter it again");
    }
    if(!res.ok){
      let msg = "OpenRouter answered " + res.status;
      try{ msg += " — " + (JSON.parse(await res.text()).error?.message || ""); }catch(e){}
      throw new Error(msg);
    }

    /* stream the answer into the modal as it is written */
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for(;;){
      const { done, value } = await reader.read();
      if(done) break;
      lastData = Date.now();
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop();
      for(const line of lines){
        const payload = line.replace(/^data:\s*/, "").trim();
        if(!line.startsWith("data:") || payload === "[DONE]") continue;
        try{
          const delta = JSON.parse(payload).choices?.[0]?.delta?.content;
          if(delta) streamedText += delta;
        }catch(e){ /* keep-alive or partial line */ }
      }
      if(streamedText && feasIdeaId === idea.id) setBody(mdToHtml(streamedText));
    }
    if(!streamedText.trim()) throw new Error("empty response");

    const target = state.ideas.find(i=>i.id===idea.id);
    if(target){
      target.feasibility = { text: streamedText.trim(), ts: Date.now() };
      touched(); render();
      if(feasIdeaId === idea.id) openModal(target);
    }
  }catch(err){
    console.error("feasibility check failed", err);
    const msg = err.name === "AbortError" ? "timed out — no data from OpenRouter for 90s" : err.message;
    if(feasIdeaId === idea.id) openModal(idea, "Check failed: " + msg);
  }finally{
    clearInterval(ticker);
  }
}

/* modal wiring */
document.getElementById("feasClose").onclick = closeModal;
document.getElementById("feasModal").addEventListener("click", e=>{
  if(e.target.id === "feasModal") closeModal();
});
document.getElementById("feasRerun").onclick = ()=>{
  const idea = state.ideas.find(i=>i.id===feasIdeaId);
  if(idea && confirm("Run a new feasibility check? This uses your OpenRouter credits.")) runCheck(idea);
};
