// ====== CONFIG ======
const sheetURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSfUYEYX8MIGIYW5hTWf2hz_j0VT7TBiZlAWkB183PuT25msmPFtizLvmD9ktXgV4aMj2e8E6IACs6U/pub?gid=0&single=true&output=csv";
const bannedURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vREhew_r4KSC5plsfCVyKtmCp98MIINzoR-ZGdFYjNXbKCaiEf8GkYEwEvMvYAphrZB5ipDeSvqyVhr/pub?gid=0&single=true&output=csv";
const LOG_API = "https://docs.google.com/spreadsheets/d/e/2PACX-1vShPvjxX5IxL_XiZrkzP4mTQjNmVGF3lQ-IV01Ri95GkYgg1BlGl2QO4C3Na0ERHsGU1OPGaZ5MdIWj/pub?gid=0&single=true&output=csv";

// ====== DATA ======
let knowledgeBase = [];
let bannedWords = [];
let chatHistory = JSON.parse(localStorage.getItem("chatHistory")) || [];

// ====== LOAD DATA ======
async function loadSheetData() {
  const res = await fetch(sheetURL);
  const csv = await res.text();
  const parsed = Papa.parse(csv, { header: true });
  knowledgeBase = parsed.data;
}

async function loadBannedWords() {
  const res = await fetch(bannedURL);
  const csv = await res.text();
  const parsed = Papa.parse(csv, { header: true });

  const col = Object.keys(parsed.data[0]).find(h => h.toLowerCase().includes("banned"));

  bannedWords = parsed.data.map(r => r[col]).filter(Boolean);
}

loadSheetData();
loadBannedWords();

// ====== UI ======
function addMessage(text, sender) {
  const chat = document.getElementById("chat");

  const wrapper = document.createElement("div");
  wrapper.className = "message " + sender;

  const msg = document.createElement("div");
  msg.className = "msg-text";

  const time = document.createElement("div");
  time.className = "timestamp";
  time.innerText = new Date().toLocaleTimeString();

  wrapper.appendChild(msg);
  wrapper.appendChild(time);
  chat.appendChild(wrapper);

  if (sender === "bot") {
    let i = 0;
    function type() {
      if (i < text.length) {
        msg.innerHTML += text[i++];
        setTimeout(type, 10);
      }
    }
    type();
  } else {
    msg.innerText = text;
  }

  chat.scrollTop = chat.scrollHeight;

  chatHistory.push({ text, sender });
  localStorage.setItem("chatHistory", JSON.stringify(chatHistory));
}

// ====== SEARCH ======
function searchSheet(q) {
  q = q.toLowerCase();
  let best = null, score = 0;

  for (const row of knowledgeBase) {
    if (!row["User Question"]) continue;

    let s = 0;
    const question = row["User Question"].toLowerCase();

    if (q === question) s += 5;
    if (q.includes(question)) s += 3;

    q.split(" ").forEach(w => {
      if (question.includes(w)) s++;
    });

    if (s > score) {
      score = s;
      best = row["Bot Answer"];
    }
  }

  return score > 1 ? best : null;
}

// ====== BANNED ======
function containsBanned(text) {
  return bannedWords.some(w => new RegExp(`\\b${w}\\b`, "i").test(text));
}

// ====== LOG ======
function logQ(q, found, ans) {
  fetch(LOG_API, {
    method: "POST",
    mode: "no-cors",
    body: JSON.stringify({ question: q, found, answer: ans })
  });
}

// ====== SUGGESTIONS ======
function showSuggestions(input) {
  const box = document.getElementById("suggestions");
  box.innerHTML = "";

  if (!input) return;

  const matches = knowledgeBase
    .map(r => r["User Question"])
    .filter(q => q && q.toLowerCase().includes(input.toLowerCase()))
    .slice(0, 5);

  matches.forEach(m => {
    const div = document.createElement("div");
    div.className = "suggestion-item";
    div.innerText = m;

    div.onclick = () => {
      document.getElementById("userInput").value = m;
      box.innerHTML = "";
      sendMessage();
    };

    box.appendChild(div);
  });
}

// ====== SEND ======
function sendMessage() {
  const input = document.getElementById("userInput");
  const msg = input.value.trim();
  if (!msg) return;

  document.getElementById("suggestions").innerHTML = "";

  if (containsBanned(msg)) {
    addMessage("⚠️ Banned words detected.", "bot");
    input.value = "";
    return;
  }

  addMessage(msg, "user");
  input.value = "";

  addMessage("Typing...", "bot");

  setTimeout(() => {
    document.querySelectorAll(".bot").forEach(e => {
      if (e.innerText === "Typing...") e.remove();
    });

    const ans = searchSheet(msg) || "No answer found.";
    addMessage(ans, "bot");
    logQ(msg, ans !== "No answer found.", ans);

  }, 500);
}

// ====== EVENTS ======
document.getElementById("userInput").addEventListener("keypress", e => {
  if (e.key === "Enter") sendMessage();
});

document.getElementById("userInput").addEventListener("input", e => {
  showSuggestions(e.target.value);
});

// Dark mode
if (localStorage.getItem("dark") === "true") {
  document.body.classList.add("dark-mode");
}

document.getElementById("darkToggle").onclick = () => {
  document.body.classList.toggle("dark-mode");
  localStorage.setItem("dark", document.body.classList.contains("dark-mode"));
};

// Load history
window.onload = () => {
  chatHistory.forEach(m => addMessage(m.text, m.sender));
};
