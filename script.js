// ================= CONFIG =================
const sheetURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSfUYEYX8MIGIYW5hTWf2hz_j0VT7TBiZlAWkB183PuT25msmPFtizLvmD9ktXgV4aMj2e8E6IACs6U/pub?gid=0&single=true&output=csv";

const bannedURL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vREhew_r4KSC5plsfCVyKtmCp98MIINzoR-ZGdFYjNXbKCaiEf8GkYEwEvMvYAphrZB5ipDeSvqyVhr/pub?gid=0&single=true&output=csv";

const LOG_API = "https://script.google.com/macros/s/AKfycbze3yVdySjDVy2MOi9SuZgzAOGe09VMx5d8RruXMemn7_IdG8B7LLDLOPDa1ApNvDmvvQ/exec";

// ================= STATE =================
let knowledgeBase = [];
let bannedWords = [];
let lastLoaded = 0;

// ================= LOAD DATA =================
async function loadSheetData(force = false) {
  const now = Date.now();

  // prevent too frequent reload
  if (!force && now - lastLoaded < 10000) return;

  try {
    const response = await fetch(sheetURL);
    const csv = await response.text();

    const parsed = Papa.parse(csv, {
      header: true,
      skipEmptyLines: true
    });

    knowledgeBase = parsed.data;
    lastLoaded = now;

    console.log("✅ Sheet data loaded:", knowledgeBase.length);
  } catch (err) {
    console.error("❌ Error loading sheet:", err);
  }
}

async function loadBannedWords() {
  try {
    const response = await fetch(bannedURL);
    const csv = await response.text();

    const parsed = Papa.parse(csv, {
      header: true,
      skipEmptyLines: true
    });

    if (parsed.data.length === 0) return;

    const header = Object.keys(parsed.data[0]);
    const bannedColumn = header.find(h =>
      h.toLowerCase().includes("banned")
    );

    if (!bannedColumn) return;

    bannedWords = parsed.data
      .map(row => row[bannedColumn])
      .filter(Boolean)
      .map(word => word.toLowerCase());

    console.log("🚫 Banned words loaded:", bannedWords.length);
  } catch (err) {
    console.error("❌ Error loading banned words:", err);
  }
}

// ================= AUTO REFRESH =================
setInterval(() => {
  loadSheetData();
  loadBannedWords();
  console.log("🔄 Auto-refresh triggered");
}, 30000);

// Initial load
loadSheetData(true);
loadBannedWords();

// ================= UI =================
function addMessage(text, sender) {
  const chat = document.getElementById("chat");
  const div = document.createElement("div");
  div.className = "message " + sender;
  div.innerText = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

// ================= SEARCH =================
function searchSheet(question) {
  const input = question.toLowerCase();

  let bestMatch = null;
  let bestScore = 0;

  for (const row of knowledgeBase) {
    if (!row["User Question"]) continue;

    const q = row["User Question"].toLowerCase();
    let score = 0;

    if (input.includes(q)) score += 3;
    if (q.includes(input)) score += 2;

    const inputWords = input.split(/\W+/);
    const qWords = q.split(/\W+/);

    inputWords.forEach(word => {
      if (qWords.includes(word)) score++;
    });

    if (score > bestScore) {
      bestScore = score;
      bestMatch = row;
    }
  }

  return bestScore > 1 ? bestMatch["Bot Answer"] : null;
}

// ================= BANNED WORD CHECK =================
function containsBannedWord(text) {
  const words = text.toLowerCase().split(/\W+/);
  return bannedWords.some(banned => words.includes(banned));
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
  } catch (error) {
    console.log("Logging error:", error);
  }
}

// ================= MAIN CHAT =================
async function sendMessage() {
  const input = document.getElementById("userInput");
  const message = input.value.trim();
  if (!message) return;

  // Refresh latest data before answering
  await loadSheetData(true);
  await loadBannedWords();

  // Check banned words
  if (containsBannedWord(message)) {
    addMessage("⚠️ Your message contains banned words and cannot be sent.", "bot");
    input.value = "";
    input.focus();
    return;
  }

  addMessage(message, "user");
  input.value = "";
  input.focus();

  // Typing indicator
  const chat = document.getElementById("chat");
  const typingDiv = document.createElement("div");
  typingDiv.className = "message bot";
  typingDiv.innerText = "Typing...";
  chat.appendChild(typingDiv);
  chat.scrollTop = chat.scrollHeight;

  // Search
  let sheetAnswer = searchSheet(message);
  let finalAnswer;

  if (sheetAnswer) {
    finalAnswer = sheetAnswer;
    logQuestion(message, "Yes", finalAnswer);
  } else {
    finalAnswer = "Sorry, I don't have an answer for that yet.";
    logQuestion(message, "No", finalAnswer);
  }

  // Replace typing with real answer
  setTimeout(() => {
    typingDiv.innerText = finalAnswer;
  }, 500);
}

// ================= EVENTS =================
document.getElementById("userInput").addEventListener("keypress", function(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    sendMessage();
  }
});

// Dark mode
document.getElementById("darkToggle").addEventListener("click", () => {
  document.body.classList.toggle("dark-mode");
});
