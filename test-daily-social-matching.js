// Test Daily Social Trends matching

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const dailySocialPrompt = `Send me an interactive, visually engaging HTML email research report every day at 9am, summarizing exactly 5 trending social media topics specifically from the past 24 hours that align closely with my artist's brand or niche. For each topic, explicitly confirm it originated or peaked within the last 24 hours. Clearly structure each topic with:
	•	Topic Title: Short, engaging headline.
	•	Description: Brief explanation (e.g., news, meme, event).
	•	Platform: Clearly state exactly where it's trending (X, TikTok, IG, etc.).
	•	Brand Alignment: Concisely explain why this aligns specifically with my artist's niche, fan segments, or brand identity.
	•	Recommended Action: Give one actionable suggestion (post, comment, shoutout, collab) that my artist could authentically perform within 5 minutes or less.`;

console.log('=== DAILY SOCIAL TRENDS TEMPLATE ===');
console.log('Template length:', dailySocialPrompt.length, 'characters');
console.log('Normalized template:');
console.log(normalizeText(dailySocialPrompt));

console.log('\n=== TESTING MATCHES ===');

// Test obvious non-matches
const testInputs = [
  "Send me daily social trends",
  "I want social media reports", 
  "Daily trends please",
  "Social media trends",
  "Send me an email report",
  // Exact match test
  dailySocialPrompt,
  // Partial match test
  "Send me an interactive, visually engaging HTML email research report"
];

function isExactMatch(memory, template) {
  const normalizedMemory = normalizeText(memory);
  const normalizedTemplate = normalizeText(template);
  
  if (normalizedMemory === normalizedTemplate) {
    return "EXACT MATCH";
  }
  
  if (normalizedMemory.includes(normalizedTemplate)) {
    return "TEMPLATE CONTAINED IN MEMORY";
  }
  
  return "NO MATCH";
}

testInputs.forEach((input, i) => {
  console.log(`\n--- Test ${i + 1} ---`);
  console.log(`Input: "${input.substring(0, 60)}${input.length > 60 ? '...' : ''}"`);
  console.log(`Result: ${isExactMatch(input, dailySocialPrompt)}`);
});

console.log('\n=== ANALYSIS ===');
console.log('If 196 users have exact matches, it means they either:');
console.log('1. Typed this 500+ character prompt exactly');
console.log('2. Copy-pasted it from somewhere');
console.log('3. The app auto-inserted it when clicking the template');
console.log('4. There is still a matching bug'); 