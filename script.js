// ===== CONFIG =====
const sheetURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSfUYEYX8MIGIYW5hTWf2hz_j0VT7TBiZlAWkB183PuT25msmPFtizLvmD9ktXgV4aMj2e8E6IACs6U/pub?gid=0&single=true&output=csv";

const bannedURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vREhew_r4KSC5plsfCVyKtmCp98MIINzoR-ZGdFYjNXbKCaiEf8GkYEwEvMvYAphrZB5ipDeSvqyVhr/pub?gid=0&single=true&output=csv";

const LOG_API = "https://script.google.com/macros/s/AKfycbze3yVdySjDVy2MOi9SuZgzAOGe09VMx5d8RruXMemn7_IdG8B7LLDLOPDa1ApNvDmvvQ/exec";

// ===== DATA =====
let knowledgeBase = [];
let bannedWords = [];
let chatHistory = JSON.parse(localStorage.getItem("chatHistory")) || [];

// ===== LOAD DATA =====
async function loadSheetData() {
  const res = await fetch(sheetURL);
  const csv = await res.text();
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });
  knowledgeBase = parsed.data;
}

async function loadBannedWords() {
  const res = await fetch(bannedURL);
  const csv = await res.text();
  const parsed = Papa.parse(csv, { header: true, skipEmptyLines: true });

  const headers = Object.keys(parsed.data[0]);
  const bannedCol = headers.find(h => h.toLowerCase().includes("banned"));

  bannedWords = parsed.data
    .map(row => row[bannedCol])
    .filter(Boolean)
    .map(word => word.trim().toLowerCase()); // FIXED
}

loadSheetData();
loadBannedWords();

// ===== UI =====
function addMessage(text, sender) {
  const chat = document.getElementById("chat");

  const wrapper = document.createElement("div");
  wrapper.className = "message " + sender;

  const msg = document.createElement("div");
  msg.className = "msg-text";

  const time = document.createElement("div");
  time.className = "timestamp";
  time.innerText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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

// ===== SEARCH =====
function searchSheet(question) {
  question = question.toLowerCase();

  let bestMatch = null;
  let highestScore = 0;

  for (const row of knowledgeBase) {
    if (!row["User Question"]) continue;

    const q = row["User Question"].toLowerCase();
    let score = 0;

    if (question === q) score += 5;
    if (question.includes(q) || q.includes(question)) score += 3;

    question.split(" ").forEach(word => {
      if (q.includes(word)) score++;
    });

    if (score > highestScore) {
      highestScore = score;
      bestMatch = row["Bot Answer"];
    }
  }

  return highestScore > 1 ? bestMatch : null;
}

// ===== BANNED WORD CHECK (FIXED) =====
function containsBannedWord(text) {
  return bannedWords.some(word => {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    return regex.test(text);
  });
}

// ===== LOG =====
async function logQuestion(question, found, answer) {
  fetch(LOG_API, {
    method: "POST",
    mode: "no-cors",
    body: JSON.stringify({ question, found, answer })
  });
}

// ===== SUGGESTIONS =====
function showSuggestions(inputText) {
  const box = document.getElementById("suggestions");
  box.innerHTML = "";

  if (!inputText) return;

  const matches = knowledgeBase
    .map(r => r["User Question"])
    .filter(q => q && q.toLowerCase().includes(inputText.toLowerCase()))
    .slice(0, 5);

  matches.forEach(match => {
    const div = document.createElement("div");
    div.className = "suggestion-item";
    div.innerText = match;

    div.onclick = () => {
      document.getElementById("userInput").value = match;
      box.innerHTML = "";
      sendMessage();
    };

    box.appendChild(div);
  });
}

// ===== SEND =====
function sendMessage() {
  const input = document.getElementById("userInput");
  const message = input.value.trim();
  if (!message) return;

  document.getElementById("suggestions").innerHTML = "";

  if (containsBannedWord(message)) {
    addMessage("⚠️ Your message contains banned words.", "bot");
    input.value = "";
    return;
  }

  addMessage(message, "user");
  input.value = "";

  addMessage("Typing...", "bot");

  setTimeout(() => {
    document.querySelectorAll(".bot").forEach(el => {
      if (el.innerText === "Typing...") el.remove();
    });

    const answer = searchSheet(message) || "Sorry, I don't have an answer yet.";
    addMessage(answer, "bot");

    logQuestion(message, answer ? "Yes" : "No", answer);

  }, 500);
}

// ===== EVENTS =====
document.getElementById("userInput").addEventListener("keypress", e => {
  if (e.key === "Enter") sendMessage();
});

document.getElementById("userInput").addEventListener("input", e => {
  showSuggestions(e.target.value);
});

// Dark mode
if (localStorage.getItem("darkMode") === "true") {
  document.body.classList.add("dark-mode");
}

document.getElementById("darkToggle").onclick = () => {
  document.body.classList.toggle("dark-mode");
  localStorage.setItem("darkMode", document.body.classList.contains("dark-mode"));
};

// Load history
window.onload = () => {
  chatHistory.forEach(m => addMessage(m.text, m.sender));
};
