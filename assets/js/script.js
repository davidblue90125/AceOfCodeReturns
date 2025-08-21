"use strict";                           // Enforce stricter JS parsing/rules (catches silent errors).

/* ---------- State ---------- */
let dealerSum = 0;                       // Dealer’s running total (with aces possibly 11 until reduced).
let yourSum = 0;                         // Player’s running total.

let dealerAceCount = 0;                  // Count of aces in dealer’s hand (for later reduction from 11→1).
let yourAceCount = 0;                    // Count of aces in player’s hand.

let hidden;                              // The dealer’s hidden card code (e.g., "A-S").
let deck = [];                           // Array of remaining card codes in the shoe.

let canHit = true;                       // Flag: player is allowed to draw more cards.
let gameOver = false;                    // Flag: round has finished (prevents further actions).
let playerNatural21 = false;             // Flag: player got a natural blackjack (two-card 21).
let dealerCardCount = 0;                 // Number of cards dealt to dealer (to detect dealer natural 21).
let playerCardCount = 0;                 // Number of cards dealt to player (to detect player natural 21).

let wins = 0, losses = 0, ties = 0;      // Session scoreboard counters.

/* ---------- DOM ---------- */
const $ = (s) => document.querySelector(s);   // Helper: short selector function.

const dealerSumEl = $("#dealer-sum");         // <span> that shows dealer’s total (revealed at round end).
const yourSumEl = $("#your-sum");             // <span> that shows player’s total (updates live).

const dealerCardsEl = $("#dealer-cards");     // Container for dealer’s visible cards.
const yourCardsEl = $("#your-cards");         // Container for player’s cards.

const resultsEl = $("#results");              // <p> that displays outcome text (aria-live polite).
const winsEl = $("#wins");                    // <span> wins counter in tally line.
const lossesEl = $("#losses");                // <span> losses counter in tally line.
const tiesEl = $("#ties");                    // <span> ties counter in tally line.

const hitBtn = $("#hit");                     // Hit button element.
const stayBtn = $("#stay");                   // Stay button element.
const resetBtn = $("#reset");                 // Reset round button element.
const resetScoreBtn = $("#resetScore");       // Reset scoreboard button element.

const hiddenImg = $("#hidden");               // <img> element for dealer’s face-down card back.

/* ---------- Persistence ---------- */
const SCORE_KEY = "blackjack_score_v1";       // localStorage key for scoreboard persistence.

function loadScore() {                        // Load scoreboard from localStorage (if available).
  try {
    const raw = localStorage.getItem(SCORE_KEY); // Read JSON string.
    if (!raw) return;                          // If nothing saved yet, leave defaults.
    const { w = 0, l = 0, t = 0 } = JSON.parse(raw); // Parse and destructure with fallbacks.
    wins = w; losses = l; ties = t;           // Apply saved values to state.
  } catch {}                                   // Swallow errors (private mode / blocked storage).
  updateTally();                               // Reflect loaded values in the UI.
}

function saveScore() {                         // Save scoreboard to localStorage (best-effort).
  try {
    localStorage.setItem(SCORE_KEY, JSON.stringify({ w: wins, l: losses, t: ties })); // Persist.
  } catch {}                                   // Ignore storage errors to avoid breaking the app.
}

/* ---------- Init ---------- */
window.addEventListener("load", () => {        // Run after the page finishes loading.
  loadScore();                                  // Initialize scoreboard from storage.
  newRound();                                   // Deal the first round.

  hitBtn.addEventListener("click", onHit);      // Clicking Hit triggers drawing logic.
  stayBtn.addEventListener("click", onStay);    // Clicking Stay triggers round resolution.
  resetBtn.addEventListener("click", newRound); // Clicking Reset starts a fresh round.
  resetScoreBtn.addEventListener("click", () => { // Clicking Reset Score clears scoreboard.
    wins = losses = ties = 0;                   // Zero out counters.
    updateTally();                              // Update the tally UI immediately.
    saveScore();                                // Persist the reset.
  });

  // Keyboard shortcuts: H / S / R / E
  document.addEventListener("keydown", (e) => { // Global key handler for accessibility/speed.
    const k = e.key.toLowerCase();              // Normalize key to lowercase.
    
    // E: reset scoreboard
if (k === "e" && !resetScoreBtn.disabled) {
  if (document.activeElement === resetScoreBtn) {
    e.preventDefault(); // avoid double-activation when the button is focused
  }
  wins = losses = ties = 0;
  updateTally();
  saveScore();
  resultsEl.textContent = "Scoreboard reset.";
  return;
}
    
    if (k === "h" && !hitBtn.disabled) {
        if (document.activeElement === hitBtn) {
          e.preventDefault(); // Prevent button's default click on keypress
        }
        onHit(); // Always call onHit only once
        return;
      }
    if (k === "s" && !stayBtn.disabled) onStay(); // S acts like clicking Stay (if enabled).
    if (k === "r") newRound();                  // R always starts a new round.
  });
});

/* ---------- Round flow ---------- */
function newRound() {                           // Prepare and deal a brand-new round.
  // Reset UI
  resultsEl.textContent = "";                   // Clear last round’s outcome text.
  dealerCardsEl.innerHTML = "";                 // Remove dealer’s visible cards.
  yourCardsEl.innerHTML = "";                   // Remove player cards.
  dealerCardsEl.appendChild(hiddenImg);         // Put the face-down placeholder back into dealer area.
  hiddenImg.src = "assets/cards/BACK.png";      // Show the card back image.
  hiddenImg.alt = "Face-down card";             // Accessible description for the hidden card.

  // Reset state
  dealerSum = yourSum = 0;                      // Zero both totals.
  dealerAceCount = yourAceCount = 0;            // Zero ace counts.
  canHit = true; gameOver = false;              // Allow hits; mark round as active.
  playerNatural21 = false;                      // Reset natural blackjack flag.
  dealerCardCount = 0; playerCardCount = 0;     // Reset card counters.

  // Ensure deck
  if (deck.length < 15) {                       // If the deck is running low…
    buildDeck();                                // …create a fresh 52-card deck.
    shuffleDeck();                              // …shuffle it with Fisher–Yates.
  }

  // Dealer hidden
  hidden = deck.pop();                          // Take one card for the dealer (kept hidden).
  dealerSum += getValue(hidden);                // Add its nominal value (Ace=11 for now).
  dealerAceCount += checkAce(hidden);           // Track if the card is an Ace.
  dealerCardCount++;                            // Count a dealer card dealt.

// American- dealer starts with 2 cards (1 hidden + 1 upcard), then stops.
const upcard = deck.pop();
dealerSum += getValue(upcard);
dealerAceCount += checkAce(upcard);
dealerCardCount++;
dealerCardsEl.appendChild(makeCardImg(upcard, "Dealer upcard"));

  // Player initial two
  for (let i = 0; i < 2; i++) drawToPlayer();   // Deal two cards to the player (rendered).

  // Detect player natural 21 (two-card 21)
  if (playerCardCount === 2 && reduceAce(yourSum, yourAceCount) === 21) {
    playerNatural21 = true;                     // Mark natural blackjack for +2 payout on win.
  }

  updateSums(false);                            // Update player total; keep dealer total hidden.
  setControls({ hit: true, stay: true, reset: true }); // Enable buttons for a new round.
  hitBtn.focus();                               // Move focus to Hit for quick keyboard play.
}

function onHit() {                               // Handle the Hit action.
  if (!canHit || gameOver) return;               // Ignore if hits are disabled or round is over.
  drawToPlayer();                                // Draw a card and render it to the player area.

  // After more than 2 cards, no longer a "natural" 21
  if (playerCardCount > 2) playerNatural21 = false; // Natural blackjack only applies to first two cards.

  if (reduceAce(yourSum, yourAceCount) > 21) {  // If best total exceeds 21 (even after ace reductions)…
    canHit = false;                              // …stop further hits…
    concludeRound();                             // …and immediately resolve the round (bust).
  } else {
    updateSums(false);                           // Otherwise, just refresh the displayed player total.
  }
}

function onStay() {                               // Handle the Stay action.
  if (gameOver) return;                           // If round already ended, do nothing.
  canHit = false;                                 // Disable hits once the player stays.
  concludeRound();                                // Reveal dealer and compute outcome.
}

/* ---------- Helpers ---------- */
function drawToPlayer() {                         // Draw a single card for the player and render it.
  const card = deck.pop();                        // Take the top card from the deck.
  yourSum += getValue(card);                      // Add its nominal value to player total.
  yourAceCount += checkAce(card);                 // Track aces for later reduction.
  playerCardCount++;                              // Increment player’s card count.
  yourCardsEl.appendChild(                        // Render a card image into the player area.
    makeCardImg(card, "Your card")
  );
}

function concludeRound() {                        // Reveal hidden card, finalize totals, decide outcome.
  // Reveal dealer hidden card
  hiddenImg.src = getCardImageSrc(hidden);        // Flip the dealer’s hidden image to the real card face.
  hiddenImg.alt = cardAlt(hidden);                // Update alt text to the actual card name.

  // After player reveal & stay, dealer plays face-up to 17+
  while (reduceAce(dealerSum, dealerAceCount) < 17) { // While best total is below 17…
    const card = deck.pop();                    // Draw a face-up card.
    dealerSum += getValue(card);                // Add its nominal value.
    dealerAceCount += checkAce(card);           // Track aces for later reduction.
    dealerCardCount++;                          // Count another dealer card.
    dealerCardsEl.appendChild(                   // Render the face-up card in the dealer’s area.
      makeCardImg(card, "Dealer card")
    );
  }

  // Final totals
  dealerSum = reduceAce(dealerSum, dealerAceCount); // Convert aces 11→1 as needed for dealer.
  yourSum = reduceAce(yourSum, yourAceCount);       // Convert aces 11→1 as needed for player.
  updateSums(true);                                // Now show dealer total in the UI.

  const dealerNatural21 = (dealerCardCount === 2 && dealerSum === 21); // Detect dealer natural blackjack.

  let msg = "";                                    // Prepare outcome message.
  if (yourSum > 21) {                              // Player busts.
    msg = "You bust. Dealer wins.";
    losses++;                                      // Increment losses.
  } else if (dealerSum > 21) {                     // Dealer busts.
    msg = "Dealer busts. You win!";
    wins++;                                        // Increment wins.
  } else if (yourSum === dealerSum) {              // Same totals: tie.
    msg = "Push! It’s a tie.";
    ties++;                                        // Increment ties.
  } else if (yourSum > dealerSum) {                // Player higher than dealer.
    if (playerNatural21 && !dealerNatural21) {     // Player natural wins against non-natural dealer.
      msg = "Blackjack! You win (+2).";
      wins += 2;                                   // Award +2 for natural blackjack.
    } else {
      msg = "You win!";
      wins++;                                      // Standard win +1.
    }
  } else {                                         // Dealer higher than player.
    msg = "You lose.";
    losses++;                                      // Increment losses.
  }

  resultsEl.textContent = msg;                     // Show outcome text (announced via aria-live).
  updateTally();                                   // Refresh scoreboard numbers in UI.
  saveScore();                                     // Persist updated scoreboard.
  gameOver = true;                                 // Mark round as finished.
  setControls({ hit: false, stay: false, reset: true }); // Disable Hit/Stay; keep Reset active.
}

function setControls({ hit, stay, reset }) {      // Enable/disable control buttons in one place.
  hitBtn.disabled = !hit;                          // Toggle Hit button state.
  stayBtn.disabled = !stay;                        // Toggle Stay button state.
  resetBtn.disabled = !reset;                      // Toggle Reset button state.
}

function updateSums(showDealer = false) {          // Update sum displays (dealer hidden until reveal).
  yourSumEl.textContent = reduceAce(yourSum, yourAceCount); // Show best player total.
  // Defensive: if dealerSumEl exists, update it; else warn in console
  if (dealerSumEl) {
    dealerSumEl.textContent = showDealer ? reduceAce(dealerSum, dealerAceCount) : "";
  } else {
    console.warn("Dealer sum element (#dealer-sum) not found in the DOM.");
  }
}

/* ---------- Deck & Cards ---------- */
function buildDeck() {                             // Create a standard 52-card deck of codes.
  const values = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"]; // Card ranks.
  const suits  = ["C","D","H","S"];               // Suits: Clubs, Diamonds, Hearts, Spades.
  deck = [];                                      // Reset the deck array.
  for (const s of suits)                          // For each suit…
    for (const v of values)                       // …for each rank…
      deck.push(`${v}-${s}`);                     // …push a code like "Q-H".
}

function shuffleDeck() {                           // Shuffle deck in place using Fisher–Yates.
  for (let i = deck.length - 1; i > 0; i--) {     // Walk from end to start…
    const j = Math.floor(Math.random() * (i + 1)); // Pick a random index ≤ i.
    [deck[i], deck[j]] = [deck[j], deck[i]];      // Swap elements at i and j.
  }
}

function getCardImageSrc(card) {                   // Map a card code to its image path on disk.
  return `assets/cards/${card}.png`;               // Use your folder: assets/cards/<code>.png
}

function makeCardImg(card, labelPrefix = "Card") { // Create an <img> element for a card.
  const img = document.createElement("img");      // Make an image element.
  img.src = getCardImageSrc(card);                // Point to the correct PNG file.
  img.alt = `${labelPrefix}: ${cardAlt(card)}`;   // Accessible alt text (e.g., “Your card: Ace of Spades”).
  img.decoding = "async";                         // Hint: decode asynchronously for performance.
  img.loading = "eager";                          // Load immediately so cards appear promptly.
  return img;                                     // Return the ready image element.
}

function cardAlt(card) {                           // Build a human-readable name for a card code.
  const [v, s] = card.split("-");                  // Split "Q-H" → ["Q","H"].
  const suitName = { C: "Clubs", D: "Diamonds", H: "Hearts", S: "Spades" }[s] || s; // Suit mapping.
  const valueName = isNaN(v) ? (v === "A" ? "Ace" : v === "K" ? "King" : v === "Q" ? "Queen" : "Jack") : v; // Rank mapping.
  return `${valueName} of ${suitName}`;            // e.g., "Queen of Hearts".
}

function getValue(card) {                          // Nominal numeric value (Ace=11, face=10).
  const value = card.split("-")[0];                // Extract rank part.
  if (isNaN(value)) return value === "A" ? 11 : 10; // A=11; J/Q/K=10.
  return parseInt(value, 10);                      // Number cards 2–10 parse to their int value.
}

function checkAce(card) {                          // Return 1 if the card is an Ace, else 0.
  return card.startsWith("A") ? 1 : 0;             // Quick check by leading character.
}

function reduceAce(sum, aceCount) {                // Reduce some Aces 11→1 to avoid busting.
  while (sum > 21 && aceCount > 0) {               // While we’re busting and have Aces to downgrade…
    sum -= 10;                                     // Subtract 10 (turn 11 into 1).
    aceCount--;                                    // Consume one available Ace reduction.
  }
  return sum;                                      // Return the best (highest non-busting) total.
}

/* ---------- UI helpers ---------- */
function updateTally() {                           // Push scoreboard numbers into the UI.
  winsEl.textContent = String(wins);               // Show wins count.
  lossesEl.textContent = String(losses);           // Show losses count.
  tiesEl.textContent = String(ties);               // Show ties count.
}
