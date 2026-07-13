/* GeoRanker for socials — dashboard renderer.
   Fetches /api/dashboard and paints themed cards. No build step / framework. */

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
};
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );
const num = (n) => (typeof n === "number" ? n.toLocaleString() : n);

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const monthLabel = (ym) => {
  const [y, m] = String(ym).split("-").map(Number);
  return `${MONTHS[(m || 1) - 1]} ${y}`;
};
const prettyDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};

function card(title, tag, colour, bodyNode) {
  const c = el("section", `card ${colour}`);
  c.append(el("div", "accent-bar"));
  c.append(el("h2", null, `<span class="tag">${tag}</span> ${esc(title)}`));
  c.append(bodyNode);
  return c;
}

function emptyBody(msg) {
  return el("p", "empty", esc(msg));
}

/* ── Card builders ────────────────────────────────────────────────────── */

function standingsCard(rows) {
  if (!rows.length) return card("Standings", "🏆", "c-gold", emptyBody("No games decided yet."));
  const t = el("table");
  t.innerHTML =
    "<thead><tr><th>#</th><th>Player</th><th class='num'>Points</th></tr></thead>";
  const tb = el("tbody");
  for (const r of rows) {
    const tr = el("tr", r.position === 1 ? "leader" : "");
    tr.innerHTML = `<td><span class="pos">${r.position}</span></td><td>${esc(r.displayName)}</td><td class="num">${num(r.points)}</td>`;
    tb.append(tr);
  }
  t.append(tb);
  return card("Standings — daily wins", "🏆", "c-gold", t);
}

function hoarderCard(data) {
  const { leaders, table } = data;
  if (!table.length) return card("Point Hoarder", "📈", "c-blue", emptyBody("No scores recorded yet."));
  const wrap = el("div");
  if (leaders.length) {
    wrap.append(
      el("div", "big-callout", `👑 <strong>${esc(leaders.join(" & "))}</strong> ${leaders.length > 1 ? "lead" : "leads"} on cumulative GeoRankl score.`),
    );
  }
  const t = el("table");
  t.style.marginTop = "12px";
  t.innerHTML =
    "<thead><tr><th>#</th><th>Player</th><th class='num'>Total</th><th class='num'>Games</th><th class='num'>Avg</th></tr></thead>";
  const tb = el("tbody");
  for (const r of table) {
    const tr = el("tr", r.position === 1 ? "leader" : "");
    tr.innerHTML = `<td><span class="pos">${r.position}</span></td><td>${esc(r.displayName)}</td><td class="num">${num(r.total)}</td><td class="num">${num(r.games)}</td><td class="num">${num(r.average)}</td>`;
    tb.append(tr);
  }
  t.append(tb);
  wrap.append(t);
  return card("Point Hoarder — cumulative score", "📈", "c-blue", wrap);
}

function recordsCard(records) {
  if (!records.length) return card("Hall of records", "🏅", "c-purple", emptyBody("No records set yet."));
  const ul = el("ul", "record-list");
  for (const r of records) {
    const li = el("li");
    li.innerHTML =
      `<span class="emoji">${esc(r.emoji)}</span>` +
      `<span><span class="label">${esc(r.label)}</span><br><span class="holder">${esc(r.holder ?? "—")}</span></span>` +
      `<span class="detail">${esc(r.detail)}</span>`;
    ul.append(li);
  }
  return card("Hall of records", "🏅", "c-purple", ul);
}

function streaksCard(s) {
  const wrap = el("div");
  if (s.hot) {
    wrap.append(el("div", "big-callout", `🔥 <strong>${esc(s.hot.displayName)}</strong> is on a <strong>${s.hot.current}</strong>-win streak.`));
  }
  if (s.longest) {
    const g = el("div", "big-callout");
    g.style.marginTop = s.hot ? "10px" : "0";
    g.innerHTML = `📏 Longest streak ever: <strong>${esc(s.longest.displayName)}</strong> (${s.longest.longest} wins).`;
    wrap.append(g);
  }
  if (!s.hot && !s.longest) wrap.append(emptyBody("No streaks going yet."));
  return card("Streaks", "🔥", "c-amber", wrap);
}

function listCountCard(title, tag, colour, rows, unit) {
  if (!rows.length) return card(title, tag, colour, emptyBody("Nothing here yet."));
  const t = el("table");
  t.innerHTML = "<thead><tr><th>Player</th><th class='num'>" + esc(unit) + "</th></tr></thead>";
  const tb = el("tbody");
  for (const r of rows) {
    const tr = el("tr");
    tr.innerHTML = `<td>${esc(r.displayName)}</td><td class="num">${num(r.count ?? r.wins)}</td>`;
    tb.append(tr);
  }
  t.append(tb);
  return card(title, tag, colour, t);
}

function averagesCard(rows) {
  if (!rows.length) return card("Scoring averages", "📊", "c-green", emptyBody("No scores yet."));
  const t = el("table");
  t.innerHTML =
    "<thead><tr><th>#</th><th>Player</th><th class='num'>Avg</th><th class='num'>Best</th><th class='num'>Worst</th></tr></thead>";
  const tb = el("tbody");
  for (const r of rows) {
    const tr = el("tr", r.position === 1 ? "leader" : "");
    tr.innerHTML = `<td><span class="pos">${r.position}</span></td><td>${esc(r.displayName)}</td><td class="num">${num(r.average)}</td><td class="num">${num(r.best)}</td><td class="num">${num(r.worst)}</td>`;
    tb.append(tr);
  }
  t.append(tb);
  return card("Scoring averages", "📊", "c-green", t);
}

function playerOfMonthCard(pom, champions) {
  const wrap = el("div");
  if (pom) {
    wrap.append(
      el("div", "big-callout", `🗓️ <strong>${esc(pom.displayName)}</strong> is Player of the Month for <strong>${esc(monthLabel(pom.month))}</strong> (${pom.wins} wins).`),
    );
  } else {
    wrap.append(emptyBody("No monthly champion yet."));
  }
  if (champions.length > 1) {
    const t = el("table");
    t.style.marginTop = "12px";
    t.innerHTML = "<thead><tr><th>Month</th><th>Champion</th><th class='num'>Wins</th></tr></thead>";
    const tb = el("tbody");
    for (const c of [...champions].reverse()) {
      const tr = el("tr");
      tr.innerHTML = `<td>${esc(monthLabel(c.month))}</td><td>${esc(c.displayName)}</td><td class="num">${c.wins}</td>`;
      tb.append(tr);
    }
    t.append(tb);
    wrap.append(t);
  }
  return card("Player of the Month", "🗓️", "c-yellow", wrap);
}

function groupPBCard(pb) {
  if (!pb) return card("Group PB", "🌟", "c-green", emptyBody("No group best yet."));
  const wrap = el("div");
  wrap.append(el("div", "big-callout", `🌟 Highest combined day: <strong>${num(pb.total)}</strong> on <strong>${esc(prettyDate(pb.gameDate))}</strong>.`));
  const t = el("table");
  t.style.marginTop = "12px";
  t.innerHTML = "<thead><tr><th>Player</th><th class='num'>Score</th></tr></thead>";
  const tb = el("tbody");
  for (const c of pb.contributors) {
    const tr = el("tr");
    tr.innerHTML = `<td>${esc(c.displayName)}</td><td class="num">${num(c.score)}</td>`;
    tb.append(tr);
  }
  t.append(tb);
  wrap.append(t);
  return card("Group PB", "🌟", "c-green", wrap);
}

function fingerCard(rows) {
  if (!rows.length) return card("Fastest finger league", "⏱️", "c-blue", emptyBody("No submission times yet."));
  const t = el("table");
  t.innerHTML =
    "<thead><tr><th>#</th><th>Player</th><th class='num'>Avg time</th><th class='num'>Games</th></tr></thead>";
  const tb = el("tbody");
  for (const r of rows) {
    const tr = el("tr", r.position === 1 ? "leader" : "");
    tr.innerHTML = `<td><span class="pos">${r.position}</span></td><td>${esc(r.displayName)}</td><td class="num">${esc(r.averageTime)}</td><td class="num">${r.games}</td>`;
    tb.append(tr);
  }
  t.append(tb);
  return card("Fastest finger league", "⏱️", "c-blue", t);
}

function droughtCard(d) {
  const body = d
    ? el("div", "big-callout", `🏜️ Longest win drought: <strong>${esc(d.displayName)}</strong> went <strong>${d.drought}</strong> games without a win.`)
    : emptyBody("No droughts recorded yet.");
  return card("Win drought", "🏜️", "c-amber", body);
}

function recentCard(rows) {
  if (!rows.length) return card("Recent results", "📅", "c-purple", emptyBody("No results yet."));
  const wrap = el("div", "results");
  for (const r of rows) {
    const row = el("div", "result-row");
    const others = r.scores
      .slice()
      .sort((a, b) => b.score - a.score)
      .map((s) => `${esc(s.displayName)} ${num(s.score)}`)
      .join(" · ");
    row.innerHTML =
      `<span class="date">${esc(prettyDate(r.gameDate))}</span>` +
      `<span class="winner">🏆 ${esc(r.winnerName)}${r.topScore != null ? ` (${num(r.topScore)})` : ""}</span>` +
      `<span class="scores">${others}</span>`;
    wrap.append(row);
  }
  return card("Recent results", "📅", "c-purple", wrap);
}

/* ── Boot ─────────────────────────────────────────────────────────────── */

function summaryChips(s) {
  const strip = $("summary");
  strip.innerHTML = "";
  const chips = [
    { num: s.gameDays, lbl: "Game days" },
    { num: s.players, lbl: "Players" },
    { num: s.submissions, lbl: "Scores logged" },
    { num: s.latestGameDate ? prettyDate(s.latestGameDate) : "—", lbl: "Latest game" },
  ];
  for (const c of chips) {
    const chip = el("div", "chip");
    chip.innerHTML = `<div class="num">${esc(num(c.num))}</div><div class="lbl">${esc(c.lbl)}</div>`;
    strip.append(chip);
  }
  strip.hidden = false;
}

function render(data) {
  summaryChips(data.summary);
  const cards = $("cards");
  cards.innerHTML = "";
  cards.append(standingsCard(data.standings));
  cards.append(hoarderCard(data.pointHoarder));
  cards.append(recordsCard(data.records));
  cards.append(streaksCard(data.streaks));
  cards.append(playerOfMonthCard(data.playerOfMonth, data.monthlyChampions));
  cards.append(averagesCard(data.averages));
  cards.append(fingerCard(data.fingerLeague));
  cards.append(listCountCard("Wooden spoons", "🥄", "c-amber", data.woodenSpoons, "Spoons"));
  cards.append(listCountCard("Bridesmaids", "🥈", "c-blue", data.bridesmaids, "2nds"));
  cards.append(listCountCard("7-day form", "⚡", "c-green", data.form, "Wins"));
  cards.append(groupPBCard(data.groupPB));
  cards.append(droughtCard(data.drought));
  const recent = recentCard(data.recentResults);
  recent.classList.add("wide");
  cards.append(recent);
  cards.hidden = false;

  $("updated").textContent = "Updated " + new Date(data.generatedAt).toLocaleString();
  $("tz").textContent = data.timezone;
}

async function boot() {
  try {
    const res = await fetch("/api/dashboard", { cache: "no-store" });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    $("loading").hidden = true;
    render(data);
  } catch (err) {
    $("loading").hidden = true;
    const e = $("error");
    e.hidden = false;
    e.textContent = "Couldn't load the dashboard. " + err.message;
  }
}

boot();
