// ===== CONFIG =====
const sheetURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSfUYEYX8MIGIYW5hTWf2hz_j0VT7TBiZlAWkB183PuT25msmPFtizLvmD9ktXgV4aMj2e8E6IACs6U/pub?gid=0&single=true&output=csv";

const bannedURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vREhew_r4KSC5plsfCVyKtmCp98MIINzoR-ZGdFYjNXbKCaiEf8GkYEwEvMvYAphrZB5ipDeSvqyVhr/pub?gid=0&single=true&output=csv";

const LOG_API = "https://script.google.com/macros/s/AKfycbze3yVdySjDVy2MOi9SuZgzAOGe09VMx5d8RruXMemn7_IdG8B7LLDLOPDa1ApNvDmvvQ/exec";

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

// ===== LOAD BANNED WORDS (FIXED) =====
async function loadBannedWords() {
  const res = await fetch(bannedURL);
  const csv = await res.text();
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });

  // ✅ DIRECT COLUMN NAME (NO GUESSING)
  bannedWords = parsed.data
    .map(row => row["BannedWord"])
    .filter(word => word && word.trim() !== "")
    .map(word => word.trim().toLowerCase());

  console.log("BANNED WORDS:", bannedWords);
}

loadSheetData();
loadBannedWords();

// ===== CHECK BANNED =====
function containsBannedWord(text) {
  const cleanText = text.toLowerCase();

  return bannedWords.some(word => {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    return regex.test(cleanText);
  });
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

    if (q.includes(question) || question.includes(q)) {
      return row["Bot Answer"];
    }
  }

  return null;
}

// ===== SEND =====
function sendMessage() {
  const input = document.getElementById("userInput");
  const msg = input.value.trim();
  if (!msg) return;

  // 🔥 DEBUG
  console.log("USER INPUT:", msg);

  if (containsBannedWord(msg)) {
    console.log("❌ BLOCKED");
    addMessage("⚠️ Message blocked (banned word detected)", "bot");
    input.value = "";
    return;
  }

  console.log("✅ ALLOWED");

  addMessage(msg, "user");
  input.value = "";

  const ans = searchSheet(msg) || "No answer found.";
  addMessage(ans, "bot");
}

// ===== EVENTS =====
document.getElementById("userInput").addEventListener("keypress", e => {
  if (e.key === "Enter") sendMessage();
});
