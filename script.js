// ================= CONFIG =================
const sheetURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSfUYEYX8MIGIYW5hTWf2hz_j0VT7TBiZlAWkB183PuT25msmPFtizLvmD9ktXgV4aMj2e8E6IACs6U/pub?gid=0&single=true&output=csv";
const bannedURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vREhew_r4KSC5plsfCVyKtmCp98MIINzoR-ZGdFYjNXbKCaiEf8GkYEwEvMvYAphrZB5ipDeSvqyVhr/pub?gid=0&single=true&output=csv";
const LOG_API = "https://script.google.com/macros/s/AKfycbze3yVdySjDVy2MOi9SuZgzAOGe09VMx5d8RruXMemn7_IdG8B7LLDLOPDa1ApNvDmvvQ/exec";

// ================= STATE =================
let knowledgeBase = [];
let bannedWords = [];
let isLoaded = false;
let lastLoaded = 0;
const CACHE_TIME = 5 * 60 * 1000; // 5 minutes

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
    if (!response.ok) throw new Error("Sheet fetch failed");

    const csv = await response.text();
    const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });

    knowledgeBase = parsed.data.map(row => ({
      ...row,
      normalized: normalizeThai(row["User Question"] || "")
    }));

    console.log("✅ Sheet loaded:", knowledgeBase.length);

  } catch (err) {
    console.error("❌ Sheet error:", err);
    addMessage("⚠️ Failed to load chatbot data. Please try again later.", "bot");
  }
}

async function loadBannedWords() {
  try {
    const response = await fetch(bannedURL);
    if (!response.ok) throw new Error("Banned words fetch failed");

    const csv = await response.text();
    const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });

    if (!parsed.data.length) return;

    const firstColumn = Object.keys(parsed.data[0])[0];

    bannedWords = parsed.data
      .map(row => row[firstColumn])
      .filter(Boolean)
      .map(word => normalizeThai(word));

    console.log("🚫 Banned words loaded:", bannedWords);

  } catch (err) {
    console.error("❌ Error loading banned words:", err);
    addMessage("⚠️ Failed to load filter system.", "bot");
  }
}

// ================= INIT WITH CACHE =================
async function initData(force = false) {
  const now = Date.now();

  if (!force && now - lastLoaded < CACHE_TIME) {
    console.log("⏳ Using cached data");
    isLoaded = true;
    return;
  }

  isLoaded = false;

  await loadSheetData();
  await loadBannedWords();

  lastLoaded = now;
  isLoaded = true;

  console.log("✅ Data ready");
}

initData();

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
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function similarity(a, b) {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  if (longer.length === 0) return 1.0;

  return (longer.length - editDistance(longer, shorter)) / longer.length;
}

function searchSheet(question) {
  const input = normalizeThai(question);

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

  if (bestScore >= 0.7) {
    console.log("🎯 Match score:", bestScore);
    return bestMatch["Bot Answer"];
  }

  return null;
}

// ================= BANNED WORD CHECK =================
function containsBannedWord(text) {
  const cleanText = normalizeThai(text);
  return bannedWords.some(word => cleanText.includes(word));
}

// ================= LOGGING =================
async function logQuestion(question, found, answer) {
  try {
    await fetch(LOG_API, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, found, answer })
    });
  } catch (err) {
    console.log("Logging error:", err);
  }
}

// ================= CHAT =================
async function sendMessage() {
  const input = document.getElementById("userInput");
  const rawMessage = input.value.trim();

  if (!rawMessage) return;

  if (!isLoaded) {
    addMessage("⏳ Loading data, please wait...", "bot");
    return;
  }

  if (containsBannedWord(rawMessage)) {
    addMessage("⚠️ Message contains banned words.", "bot");
    input.value = "";
    return;
  }

  addMessage(rawMessage, "user");
  input.value = "";

  const typing = addTyping();

  let answer = searchSheet(rawMessage);

  if (!answer) {
    answer = "Sorry, I don't have an answer for that yet.";
    logQuestion(rawMessage, "No", answer);
  } else {
    logQuestion(rawMessage, "Yes", answer);
  }

  setTimeout(() => {
    typing.innerText = answer;
  }, 400);
}

// ================= EVENTS =================
const inputBox = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");

inputBox.addEventListener("keydown", function(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener("click", sendMessage);

document.getElementById("darkToggle").addEventListener("click", () => {
  document.body.classList.toggle("dark-mode");
});
