// ================= CONFIG =================
const sheetURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSfUYEYX8MIGIYW5hTWf2hz_j0VT7TBiZlAWkB183PuT25msmPFtizLvmD9ktXgV4aMj2e8E6IACs6U/pub?gid=0&single=true&output=csv";
const bannedURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vREhew_r4KSC5plsfCVyKtmCp98MIINzoR-ZGdFYjNXbKCaiEf8GkYEwEvMvYAphrZB5ipDeSvqyVhr/pub?gid=0&single=true&output=csv";
const LOG_API = "https://script.google.com/macros/s/AKfycbze3yVdySjDVy2MOi9SuZgzAOGe09VMx5d8RruXMemn7_IdG8B7LLDLOPDa1ApNvDmvvQ/exec";

const MIN_FUZZY_INPUT_LENGTH = 5; // Minimum input length to allow fuzzy search

// ================= STATE =================
let knowledgeBase = [];
let bannedWords = [];
let isLoaded = false;

// ================= NORMALIZATION =================
function normalizeThai(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
}

// ================= LOAD DATA =================
async function loadSheetData() {
  try {
    const response = await fetch(sheetURL);
    const csv = await response.text();
    const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });

    knowledgeBase = parsed.data.map(row => ({
      ...row,
      normalized: normalizeThai(row["User Question"] || "")
    }));

    console.log("✅ Sheet loaded:", knowledgeBase.length);
  } catch (err) {
    console.error("❌ Sheet error:", err);
  }
}

async function loadBannedWords() {
  try {
    const response = await fetch(bannedURL);
    const csv = await response.text();
    const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });

    bannedWords = parsed.data
      .map(row => row["BannedWord"])
      .filter(Boolean)
      .map(word => normalizeThai(word));

    console.log("🚫 Banned words loaded:", bannedWords);
  } catch (err) {
    console.error("❌ Error loading banned words:", err);
  }
}

// ================= INIT =================
async function initData() {
  await loadSheetData();
  await loadBannedWords();
  isLoaded = true;
}
initData();
setInterval(initData, 30000);

// ================= UI =================
function addMessage(text, sender) {
  const chat = document.getElementById("chat");
  const div = document.createElement("div");
  div.className = "message " + sender;
  div.innerText = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

function addTyping() {
  const chat = document.getElementById("chat");
  const div = document.createElement("div");
  div.className = "message bot";
  div.innerText = "Typing...";
  chat.appendChild(div);
  return div;
}

// ================= FUZZY SEARCH =================
function editDistance(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i - 1] === a[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
    }
  }
  return matrix[b.length][a.length];
}

function similarity(a, b) {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;
  return (longer.length - editDistance(longer, shorter)) / longer.length;
}

// ================= SEARCH =================
function searchSheet(question) {
  const input = normalizeThai(question);

  // Prevent fuzzy search for short inputs
  if (input.length < MIN_FUZZY_INPUT_LENGTH) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const row of knowledgeBase) {
    if (!row.normalized) continue;

    const score = similarity(input, row.normalized);

    if (score > bestScore) {
      bestScore = score;
      bestMatch = row;
    }
  }

  if (bestScore >= 0.7) return bestMatch;
  return null;
}

// ================= BANNED =================
function isExactBannedWord(text) {
  const cleanText = normalizeThai(text);
  return bannedWords.includes(cleanText);
}

// ================= LOG =================
async function logQuestion(question, found, answer) {
  try {
    await fetch(LOG_API, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, found, answer })
    });
  } catch (err) {}
}

// ================= CHAT =================
async function sendMessage(msg = null) {
  const input = document.getElementById("userInput");
  const message = msg !== null ? msg : input.value.trim();
  if (!message) return;

  if (!isLoaded) {
    addMessage("⏳ Loading...", "bot");
    return;
  }

  const matchedRow = searchSheet(message);

  // Block exact banned words only if no knowledge base match
  if (!matchedRow && isExactBannedWord(message)) {
    addMessage("⚠️ Message contains banned words.", "bot");
    if (!msg) input.value = "";
    return;
  }

  addMessage(message, "user");
  if (!msg) input.value = "";

  const typing = addTyping();

  let answer = matchedRow ? matchedRow["Bot Answer"] : null;
  if (!answer) answer = "Sorry, I don't have an answer for that yet.";

  setTimeout(() => typing.innerText = answer, 400);

  logQuestion(message, !!matchedRow, answer);
}

// ================= SMART SUGGESTIONS =================
const inputBox = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");

const suggestionBox = document.createElement("div");
suggestionBox.style.position = "absolute";
suggestionBox.style.background = "#fff";
suggestionBox.style.border = "1px solid #ccc";
suggestionBox.style.zIndex = "999";
suggestionBox.style.display = "none";
suggestionBox.style.maxHeight = "150px";
suggestionBox.style.overflowY = "auto";

document.body.appendChild(suggestionBox);

inputBox.addEventListener("input", () => {
  if (!isLoaded || !knowledgeBase.length) return;

  const input = normalizeThai(inputBox.value);
  if (!input || input.length < MIN_FUZZY_INPUT_LENGTH) {
    suggestionBox.style.display = "none";
    return;
  }

  let scored = knowledgeBase.map(row => {
    const score = similarity(input, row.normalized);
    return {
      text: row["User Question"],
      score
    };
  });

  scored = scored
    .filter(item => item.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (!scored.length) {
    suggestionBox.style.display = "none";
    return;
  }

  suggestionBox.innerHTML = "";

  scored.forEach(item => {
    const div = document.createElement("div");
    div.innerText = item.text;
    div.style.padding = "8px";
    div.style.cursor = "pointer";

    div.onclick = () => {
      inputBox.value = item.text;
      suggestionBox.style.display = "none";
      sendMessage(item.text);
    };

    suggestionBox.appendChild(div);
  });

  const rect = inputBox.getBoundingClientRect();
  suggestionBox.style.left = rect.left + "px";
  suggestionBox.style.top = rect.bottom + window.scrollY + "px";
  suggestionBox.style.width = inputBox.offsetWidth + "px";
  suggestionBox.style.display = "block";
});

document.addEventListener("click", e => {
  if (e.target !== inputBox) suggestionBox.style.display = "none";
});

// ================= EVENTS =================
inputBox.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    e.preventDefault();
    sendMessage();
    suggestionBox.style.display = "none";
  }
});

sendBtn.addEventListener("click", sendMessage);

document.getElementById("darkToggle").addEventListener("click", () => {
  document.body.classList.toggle("dark-mode");
});
