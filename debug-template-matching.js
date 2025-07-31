// Debug script to test template matching algorithm

function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTemplateMatch(memoryContent, templatePrompt) {
  try {
    let textContent = '';
    
    if (typeof memoryContent === 'string') {
      textContent = memoryContent;
    } else if (memoryContent && typeof memoryContent === 'object') {
      if (memoryContent.text) {
        textContent = memoryContent.text;
      } else if (memoryContent.content) {
        textContent = memoryContent.content;
      } else if (Array.isArray(memoryContent)) {
        textContent = memoryContent
          .map(part => {
            if (typeof part === 'string') return part;
            if (part.text) return part.text;
            if (part.content) return part.content;
            return '';
          })
          .join(' ');
      } else {
        textContent = JSON.stringify(memoryContent);
      }
    }

    if (!textContent) return false;

    const normalizedMemory = normalizeText(textContent);
    const normalizedTemplate = normalizeText(templatePrompt);

    console.log('🔍 Testing match:');
    console.log('Memory:', normalizedMemory.substring(0, 100) + '...');
    console.log('Template:', normalizedTemplate.substring(0, 100) + '...');

    // Check for exact match first
    if (normalizedMemory === normalizedTemplate) {
      console.log('✅ EXACT MATCH');
      return true;
    }

    // Check for substantial overlap
    if (normalizedMemory.includes(normalizedTemplate)) {
      console.log('✅ TEMPLATE CONTAINED IN MEMORY');
      return true;
    }

    if (normalizedTemplate.includes(normalizedMemory) && normalizedMemory.length > 10) {
      console.log('✅ MEMORY CONTAINED IN TEMPLATE');
      return true;
    }

    // Check for high similarity using word overlap
    const memoryWords = new Set(normalizedMemory.split(' ').filter(w => w.length > 2));
    const templateWords = new Set(normalizedTemplate.split(' ').filter(w => w.length > 2));
    
    if (templateWords.size === 0 || memoryWords.size === 0) {
      console.log('❌ NO WORDS TO COMPARE');
      return false;
    }
    
    const intersection = new Set([...memoryWords].filter(w => templateWords.has(w)));
    const similarity = intersection.size / Math.min(memoryWords.size, templateWords.size);
    
    console.log(`📊 Word overlap: ${intersection.size}/${Math.min(memoryWords.size, templateWords.size)} = ${(similarity * 100).toFixed(1)}%`);
    console.log(`📋 Common words: ${Array.from(intersection).join(', ')}`);
    
    if (similarity >= 0.8) {
      console.log('✅ HIGH WORD OVERLAP MATCH');
      return true;
    }
    
    console.log('❌ NO MATCH');
    return false;

  } catch (error) {
    console.error('Error comparing:', error);
    return false;
  }
}

// Test cases
const strengthenPrompt = "My artist is ready for a brand refresh. Analyze our current perception across platforms, identify opportunities to evolve while staying authentic, and create visual mockups of what our refreshed identity could look like with implementation steps. Then turn it into a fun interactive HTML email That includes the new brand identity and send it to me.";

const dailySocialPrompt = "Send me an interactive, visually engaging HTML email research report every day at 9am, summarizing exactly 5 trending social media topics specifically from the past 24 hours that align closely with my artist's brand or niche...";

console.log('\n=== TESTING STRENGTHEN YOUR BRAND POSITION ===');

// Test some potential problematic matches
const testInputs = [
  "Help me with my artist brand",
  "I need to refresh my brand identity", 
  "Create visual mockups for my artist",
  "Analyze my brand across platforms",
  "My artist needs a brand refresh",
  "Send me an HTML email with brand analysis",
  "I want to evolve my artist's brand authentically"
];

testInputs.forEach((input, i) => {
  console.log(`\n--- Test ${i + 1}: "${input}" ---`);
  const isMatch = isTemplateMatch(input, strengthenPrompt);
  console.log(`Result: ${isMatch ? 'MATCH' : 'NO MATCH'}\n`);
}); 