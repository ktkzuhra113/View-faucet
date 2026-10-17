/* ViewFaucet — shared front-end logic. Accounts live in this browser only (localStorage). */
const $ = (id) => document.getElementById(id);
const COINS_PER_DOLLAR = 12000;                 // 1,200 coins = $0.10
const MIN_WD = Math.round(0.3 * COINS_PER_DOLLAR); // $0.30 = 3,600 coins
const FAUCET_REWARD = 25, FAUCET_CD = 5 * 60e3, DAILY_REWARD = 50;
const REFERRAL_BONUS = 300, COPY_BONUS = 200, COPY_DELAY = 10 * 60e3;
const COUPON_CODE = "1234567890123", COUPON_REWARD = 400, COUPON_CD = 5 * 3600e3; // change COUPON_CODE to publish a new coupon
const SITE_URL = "https://view-faucet.netlify.app/";
const ACC_KEY = "viewfaucet_demo_accounts_coins_v2", SES_KEY = "viewfaucet_demo_session_coins_v2";
const B58 = "[1-9A-HJ-NP-Za-km-z]";
const METHODS = [
  { id: "DOGE", name: "Dogecoin (DOGE)", label: "Dogecoin wallet address", ph: "Paste your DOGE address", re: new RegExp(`^D${B58}{25,34}$`), err: "Enter a valid Dogecoin address (starts with D)." },
  { id: "LTC", name: "Litecoin (LTC)", label: "Litecoin wallet address", ph: "Paste your LTC address", re: new RegExp(`^([LM3]${B58}{25,34}|ltc1[0-9a-z]{25,90})$`), err: "Enter a valid Litecoin address (starts with L, M, 3 or ltc1)." },
  { id: "SOL", name: "Solana (SOL)", label: "Solana wallet address", ph: "Paste your SOL address", re: new RegExp(`^${B58}{32,44}$`), err: "Enter a valid Solana address." },
  { id: "EP", name: "Easypaisa (PKR)", label: "Easypaisa mobile number", ph: "03XXXXXXXXX", phone: true, re: /^03\d{9}$/, err: "Enter a valid Easypaisa number like 03XXXXXXXXX." }
];

/* ---- helpers ---- */
const money = (v) => Math.floor(Number(v) || 0).toLocaleString("en-US");
const usd = (v) => ((Number(v) || 0) / COINS_PER_DOLLAR).toFixed(4);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const mmss = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
const hhmmss = (ms) => { const t = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(t / 3600)}h ${String(Math.floor(t % 3600 / 60)).padStart(2, "0")}m ${String(t % 60).padStart(2, "0")}s`; };
let toastT;
function toast(m) { const t = $("toast"); if (!t) return; t.textContent = m; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 3200); }
function msg(id, text, kind) { const el = $(id); if (!el) return; el.textContent = text; el.className = "msg " + (kind || ""); }
const accounts = () => { try { return JSON.parse(localStorage.getItem(ACC_KEY) || "[]"); } catch { return []; } };
const saveAccounts = (a) => localStorage.setItem(ACC_KEY, JSON.stringify(a));
const fresh = (u) => ({ balance: 0, totalEarned: 0, totalWithdrawn: 0, pendingWithdrawals: 0, referralEarnings: 0, faucetLastClaim: 0, dailyLastClaim: "", couponLastClaim: 0, couponCodesUsed: [], withdrawalHistory: [], ...u });
function me() { const id = localStorage.getItem(SES_KEY); const a = accounts().find((x) => x.id === id); return a ? fresh(a) : null; }
function save(u) { const all = accounts(), i = all.findIndex((x) => x.id === u.id); if (i >= 0) { all[i] = u; saveAccounts(all); } }
const sync = (u) => Object.assign(u, me() || {}); // re-read storage before every action so two open tabs never overwrite each other
function reward(u, n) { u.balance += n; u.totalEarned += n; }
function paintWallet(u) { document.querySelectorAll(".js-initial").forEach((e) => e.textContent = (u.username || "?")[0].toUpperCase()); document.querySelectorAll(".js-balance").forEach((e) => e.textContent = money(u.balance)); document.querySelectorAll(".js-usd").forEach((e) => e.textContent = `≈ $${usd(u.balance)}`); }
function referralPayout(u) { // pays the referrer once the invited account has claimed both faucet and daily bonus
  if (!u.referred_by || u.referralBonusPaid || !u.faucetLastClaim || !u.dailyLastClaim) return false;
  const all = accounts(), i = all.findIndex((a) => String(a.referral_code).toUpperCase() === String(u.referred_by).toUpperCase());
  if (i < 0) return false;
  const r = fresh(all[i]); reward(r, REFERRAL_BONUS); r.referralEarnings += REFERRAL_BONUS; all[i] = r; saveAccounts(all);
  u.referralBonusPaid = true; return true;
}

/* ---- page setup ---- */
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
const ref = new URLSearchParams(location.search).get("ref");
if (ref) localStorage.setItem("vf_ref", ref.trim().toUpperCase());
const page = document.body.dataset.page, access = document.body.dataset.access;
const user = me();
if (access === "member" && !user) location.replace("login.html");
else if (access === "guest" && user) location.replace("dashboard.html");
else {
  document.addEventListener("DOMContentLoaded", () => {
    if (user) { paintWallet(user); document.querySelectorAll(".js-name").forEach((n) => n.textContent = user.username); }
    document.querySelectorAll(".js-logout").forEach((b) => b.onclick = () => { localStorage.removeItem(SES_KEY); location.href = "index.html"; });
    if (access === "member") buildMore();
    const y = $("year"); if (y) y.textContent = new Date().getFullYear();
    if (pages[page]) pages[page](user);
  });
}

window.addEventListener("pageshow", (e) => { if (e.persisted) location.reload(); });

/* ---- mobile bottom bar: current page + ⋯ menu with every other page ---- */
const MENU = [["dashboard", "Dashboard"], ["faucet", "Faucet"], ["daily", "Daily bonus"], ["coupon", "Coupon"], ["referral", "Referral"], ["withdrawal", "Withdrawal"], ["profile", "Profile"]];
function buildMore() {
  const side = document.querySelector(".side"); if (!side) return;
  const btn = document.createElement("button"); btn.className = "more"; btn.type = "button"; btn.setAttribute("aria-label", "More pages"); btn.setAttribute("aria-expanded", "false"); btn.textContent = "•••";
  const sheet = document.createElement("div"); sheet.className = "sheet hidden";
  sheet.innerHTML = `<div class="scrim"></div><nav class="sheet-box" aria-label="Pages">${MENU.filter(([k]) => k !== page).map(([k, l]) => `<a href="${k}.html">${l}</a>`).join("")}<button type="button" class="sheet-out js-logout">Log out</button></nav>`;
  const toggle = (open) => { sheet.classList.toggle("hidden", !open); btn.setAttribute("aria-expanded", String(open)); btn.textContent = open ? "×" : "•••"; };
  btn.onclick = () => toggle(sheet.classList.contains("hidden"));
  sheet.querySelector(".scrim").onclick = () => toggle(false);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") toggle(false); });
  sheet.querySelector(".js-logout").onclick = () => { localStorage.removeItem(SES_KEY); location.href = "index.html"; };
  side.appendChild(btn); document.body.appendChild(sheet);
}

/* ---- pages ---- */
const pages = {
  login() {
    $("form").onsubmit = (e) => {
      e.preventDefault();
      const a = accounts().find((x) => x.email === $("email").value.trim().toLowerCase() && x.password === $("password").value);
      if (!a) return msg("m", "Email or password is incorrect.", "err");
      localStorage.setItem(SES_KEY, a.id); location.href = "dashboard.html";
    };
  },
  signup() {
    const code = localStorage.getItem("vf_ref"); if (code) $("refNote").textContent = `Invited with code ${code}`;
    $("form").onsubmit = (e) => {
      e.preventDefault();
      const username = $("username").value.trim(), email = $("email").value.trim().toLowerCase(), password = $("password").value, all = accounts();
      if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) return msg("m", "Username: 3–24 letters, numbers or underscores.", "err");
      if (password.length < 6) return msg("m", "Password must be at least 6 characters.", "err");
      if (all.some((a) => a.email === email)) return msg("m", "This email is already registered. Please log in.", "err");
      if (all.some((a) => a.username.toLowerCase() === username.toLowerCase())) return msg("m", "This username is taken.", "err");
      const u = fresh({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), username, email, password,
        referral_code: "VF" + Math.random().toString(36).slice(2, 8).toUpperCase(), referred_by: code || null, created_at: new Date().toISOString() });
      all.push(u); saveAccounts(all); localStorage.setItem(SES_KEY, u.id);
      msg("m", "Account created! Opening your dashboard…", "ok"); setTimeout(() => location.href = "dashboard.html", 1200);
    };
  },
  forgot() {
    $("form").onsubmit = (e) => {
      e.preventDefault();
      const all = accounts(), email = $("email").value.trim().toLowerCase(), name = $("username").value.trim().toLowerCase(), pw = $("password").value;
      const i = all.findIndex((a) => a.email === email && a.username.toLowerCase() === name);
      if (i < 0) return msg("m", "No account matches this email and username in this browser.", "err");
      if (pw.length < 6) return msg("m", "New password must be at least 6 characters.", "err");
      all[i].password = pw; saveAccounts(all); msg("m", "Password updated. Taking you to log in…", "ok"); setTimeout(() => location.href = "login.html", 1200);
    };
  },
  dashboard(u) {
    const set = (id, text, wait) => { const e = $(id); e.textContent = text; e.classList.toggle("wait", !!wait); };
    const draw = () => {
      sync(u); paintWallet(u);
      const f = Math.max(0, FAUCET_CD - (Date.now() - u.faucetLastClaim)), c = Math.max(0, COUPON_CD - (Date.now() - u.couponLastClaim)), d = u.dailyLastClaim === today();
      set("stFaucet", f ? `in ${mmss(f)}` : "Ready", f);
      set("stDaily", d ? "Claimed" : "Ready", d);
      set("stCoupon", c ? `in ${hhmmss(c)}` : "Ready", c);
      $("fEarned").textContent = `${money(u.totalEarned)} coins`; $("fWithdrawn").textContent = `${money(u.totalWithdrawn)} coins`; $("fPending").textContent = `${money(u.pendingWithdrawals)} coins`;
    };
    draw(); setInterval(draw, 1000); document.addEventListener("visibilitychange", draw);
  },
  faucet(u) {
    const ring = $("ring"), fg = $("ringFg"), btn = $("claim");
    const draw = () => {
      const left = Math.max(0, FAUCET_CD - (Date.now() - u.faucetLastClaim));
      ring.classList.toggle("ready", !left); fg.style.strokeDashoffset = left ? 326.7 * (left / FAUCET_CD) : 0;
      $("time").textContent = left ? mmss(left) : "Ready"; btn.disabled = !!left; btn.textContent = left ? "Please wait…" : `Claim ${FAUCET_REWARD} coins`;
    };
    draw(); setInterval(draw, 1000); document.addEventListener("visibilitychange", draw);
    btn.onclick = () => {
      sync(u); if (Date.now() - u.faucetLastClaim < FAUCET_CD) return draw();
      u.faucetLastClaim = Date.now(); reward(u, FAUCET_REWARD); const paid = referralPayout(u); save(u); paintWallet(u); draw();
      toast(`+${FAUCET_REWARD} coins${paid ? " · your referrer earned 300 coins" : ""}`);
    };
  },
  daily(u) {
    const btn = $("claim"), draw = () => { const done = u.dailyLastClaim === today(); btn.disabled = done; btn.textContent = done ? "Already claimed today" : `Claim ${DAILY_REWARD} coins`; $("state").textContent = done ? "Come back tomorrow for the next bonus." : "Your bonus for today is ready."; };
    draw();
    btn.onclick = () => { sync(u); if (u.dailyLastClaim === today()) return draw(); u.dailyLastClaim = today(); reward(u, DAILY_REWARD); const paid = referralPayout(u); save(u); paintWallet(u); draw(); toast(`+${DAILY_REWARD} coins${paid ? " · your referrer earned 300 coins" : ""}`); };
  },
  coupon(u) {
    const draw = () => {
      const left = Math.max(0, COUPON_CD - (Date.now() - u.couponLastClaim));
      $("couponForm").classList.toggle("hidden", !!left); $("couponWait").classList.toggle("hidden", !left);
      if (left) $("couponLeft").textContent = hhmmss(left);
    };
    draw(); setInterval(draw, 1000); document.addEventListener("visibilitychange", draw);
    $("couponForm").onsubmit = (e) => {
      e.preventDefault(); sync(u); const code = $("code").value.trim();
      if (!/^\d{13,}$/.test(code)) return msg("m", "A coupon code has at least 13 digits (numbers only).", "err");
      if (code !== COUPON_CODE) return msg("m", "Wrong coupon code. Please check and try again.", "err");
      u.couponLastClaim = Date.now(); u.couponCodesUsed.push(code); reward(u, COUPON_REWARD); save(u); paintWallet(u); $("code").value = ""; msg("m", ""); draw(); toast(`+${COUPON_REWARD} coins`);
    };
  },
  referral(u) {
    const link = new URL("signup.html", SITE_URL); link.searchParams.set("ref", u.referral_code);
    $("link").value = link.href; $("count").textContent = accounts().filter((a) => a.referred_by === u.referral_code).length; $("earn").textContent = `${money(u.referralEarnings)} coins`;
    const status = () => {
      sync(u);
      if (u.copyLinkRewardPaid) return msg("m", `Your ${COPY_BONUS}-coin copy reward was already paid.`, "ok");
      if (!u.copyLinkRewardAt) return msg("m", `Copy your link once and get ${COPY_BONUS} coins after 10 minutes.`);
      const left = COPY_DELAY - (Date.now() - u.copyLinkRewardAt);
      if (left > 0) { msg("m", `${COPY_BONUS} coins arrive in ${Math.ceil(left / 60000)} minute(s).`, "ok"); return setTimeout(status, 30000); }
      u.copyLinkRewardPaid = true; reward(u, COPY_BONUS); save(u); paintWallet(u); msg("m", `${COPY_BONUS} coins added for copying your link!`, "ok"); toast(`+${COPY_BONUS} coins`);
    };
    status();
    $("copy").onclick = async () => {
      try { await navigator.clipboard.writeText($("link").value); } catch { $("link").select(); return msg("m", "Link selected — long-press and choose Copy, then tap Copy link again.", "err"); }
      sync(u); if (!u.copyLinkRewardAt && !u.copyLinkRewardPaid) { u.copyLinkRewardAt = Date.now(); save(u); }
      toast("Link copied"); status();
    };
  },
  profile(u) {
    const set = (id, v) => $(id).textContent = v;
    set("pName", u.username); set("pEmail", u.email); set("pCode", u.referral_code);
    set("pJoined", u.created_at ? new Date(u.created_at).toLocaleDateString() : "—");
    set("pEarned", `${money(u.totalEarned)} coins`); set("pWithdrawn", `${money(u.totalWithdrawn)} coins`); set("pPending", `${money(u.pendingWithdrawals)} coins`);
    set("pFriends", accounts().filter((a) => a.referred_by === u.referral_code).length);
    $("pwForm").onsubmit = (e) => {
      e.preventDefault(); sync(u);
      if ($("oldPw").value !== u.password) return msg("m", "Current password is incorrect.", "err");
      if ($("newPw").value.length < 6) return msg("m", "New password must be at least 6 characters.", "err");
      u.password = $("newPw").value; save(u); $("pwForm").reset(); msg("m", "Password changed.", "ok");
    };
  },
  withdrawal(u) {
    $("method").innerHTML = METHODS.map((m) => `<option value="${m.id}">${m.name}</option>`).join("");
    const cur = () => METHODS.find((m) => m.id === $("method").value);
    const apply = () => { const m = cur(), d = $("dest"); $("destLabel").textContent = m.label; d.placeholder = m.ph; d.type = m.phone ? "tel" : "text"; d.value = ""; };
    apply(); $("method").onchange = apply; $("amount").oninput = () => $("preview").textContent = `≈ $${usd($("amount").value)}`;
    const list = () => {
      const h = u.withdrawalHistory;
      $("hist").innerHTML = h.length ? h.slice().reverse().map((x) => `<li><div><b>${esc(x.method)}</b><small>${esc(x.date)} · ${esc(x.destination)}</small><span class="tag ${esc(x.status.toLowerCase())}">${esc(x.status)}</span>${x.status === "Pending" ? ` <small>Estimated processing: ${Math.max(20, +x.etaMinutes || 20)} minutes or more</small>` : ""}</div><div><b>${money(x.amount)}</b><small>≈ $${usd(x.amount)}</small></div></li>`).join("") : '<li class="empty">No withdrawal requests yet.</li>';
    };
    list();
    $("form").onsubmit = (e) => {
      e.preventDefault(); sync(u); const m = cur(), amount = Math.floor(+$("amount").value); let dest = $("dest").value.trim(); if (m.phone) dest = dest.replace(/[\s-]/g, "");
      if (!(amount >= MIN_WD)) return msg("m", `Minimum withdrawal is $0.30 (${money(MIN_WD)} coins).`, "err");
      if (amount > u.balance) return msg("m", "Not enough coins in your balance.", "err");
      if (!m.re.test(dest)) return msg("m", m.err, "err");
      const eta = 20 + Math.floor(Math.random() * 161);
      u.balance -= amount; u.pendingWithdrawals += amount; u.withdrawalHistory.push({ id: Date.now(), amount, method: m.name, destination: dest, date: new Date().toLocaleString(), status: "Pending", etaMinutes: eta });
      save(u); paintWallet(u); list(); $("form").reset(); apply(); $("preview").textContent = "≈ $0.0000"; msg("m", `Request submitted. Estimated processing: ${eta} minutes or more.`, "ok");
    };
  }
};
