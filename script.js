// ===== CONFIG =====
const sheetURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSfUYEYX8MIGIYW5hTWf2hz_j0VT7TBiZlAWkB183PuT25msmPFtizLvmD9ktXgV4aMj2e8E6IACs6U/pub?gid=0&single=true&output=csv";
const bannedURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vREhew_r4KSC5plsfCVyKtmCp98MIINzoR-ZGdFYjNXbKCaiEf8GkYEwEvMvYAphrZB5ipDeSvqyVhr/pub?gid=0&single=true&output=csv";
const LOG_API = "https://script.google.com/macros/s/AKfycbwP9vx2DO_jt3AhxTZSijG4ALs8Pa_gNHg289v9yiUAU3qZViwSifVIx_r4V8hrlnO9/exec";

// ===== DATA =====
let knowledgeBase = [];
let bannedWords = [];

// ===== LOAD Q&A =====
async function loadSheetData() {
  const res = await fetch(sheetURL);
  const csv = await res.text();
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
  knowledgeBase = parsed.data;
  console.log("Q&A Loaded:", knowledgeBase.length);
}

// ===== LOAD BANNED WORDS =====
async function loadBannedWords() {
  const res = await fetch(bannedURL);
  const csv = await res.text();
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });

  bannedWords = parsed.data
    .map(row => row["BannedWord"])
    .filter(word => word && word.trim() !== "")
    .map(word => word.trim().toLowerCase());

  console.log("Banned Words Loaded:", bannedWords);
}

loadSheetData();
loadBannedWords();

// ===== CHECK BANNED =====
function containsBannedWord(text) {
  const cleanText = text.toLowerCase();
  return bannedWords.some(word => new RegExp(`\\b${word}\\b`, "i").test(cleanText));
}

// ===== UI =====
function addMessage(text, sender) {
  const chat = document.getElementById("chat");
  const div = document.createElement("div");
  div.className = "message " + sender;
  div.innerText = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

// ===== SEARCH =====
function searchSheet(q) {
  q = q.toLowerCase();
  for (const row of knowledgeBase) {
    if (!row["User Question"]) continue;
    const question = row["User Question"].toLowerCase();
    if (q.includes(question) || question.includes(q)) return row["Bot Answer"];
  }
  return null;
}

// ===== SEND =====
async function sendMessage() {
  const input = document.getElementById("userInput");
  const msg = input.value.trim();
  if (!msg) return;

  if (containsBannedWord(msg)) {
    addMessage("⚠️ Your message contains a banned word.", "bot");
    input.value = "";
    return;
  }

  addMessage(msg, "user");
  input.value = "";

  let answer = searchSheet(msg);

  // AI fallback
  if (!answer) {
    try {
      const res = await fetch(LOG_API, {
        method: "POST",
        body: JSON.stringify({ type: "ai", question: msg })
      });
      const data = await res.json();
      answer = data.answer;
    } catch {
      answer = "⚠️ AI unavailable.";
    }
  }

  addMessage(answer, "bot");

  // Log
  fetch(LOG_API, {
    method: "POST",
    mode: "no-cors",
    body: JSON.stringify({
      question: msg,
      found: answer ? "Yes" : "No",
      answer: answer
    })
  });
}

// ===== EVENTS =====
document.getElementById("userInput").addEventListener("keypress", e => {
  if (e.key === "Enter") sendMessage();
});

// Dark mode toggle
document.getElementById("darkToggle").onclick = () => {
  document.body.classList.toggle("dark-mode");
};
