import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Define cache interface
interface CacheEntry {
  data: unknown;
  timestamp: number;
}

// Cache for template matching results (5 minutes)
const cache = new Map<string, CacheEntry>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Interface for template usage analytics
interface TemplateUsageResult {
  template_id: string;
  template_title: string;
  template_prompt: string;
  usage_count: number;
  unique_users: number;
  unique_artists: number;
  first_used: string | null;
  last_used: string | null;
  sample_rooms: Array<{
    room_id: string;
    account_id: string;
    artist_id: string;
    created_at: string;
  }>;
}

// Function to normalize text for comparison
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
}

// Define interface for memory content
interface MemoryContentType {
  text?: string;
  content?: string;
  parts?: Array<{text?: string; type?: string}>;
  [key: string]: unknown;
}

// Define interfaces for memory and room objects
interface MemoryObject {
  id: string;
  content: MemoryContentType | string;
  room_id: string;
  updated_at: string;
  [key: string]: unknown;
}

interface RoomObject {
  id: string;
  account_id: string;
  artist_id: string;
  [key: string]: unknown;
}

// Function to check if memory content matches template prompt - EXACT MATCH ONLY
function isTemplateMatch(memoryContent: MemoryContentType | string, templatePrompt: string): boolean {
  try {
    let textContent = '';
    
    // Handle different content formats
    if (typeof memoryContent === 'string') {
      textContent = memoryContent;
    } else if (memoryContent && typeof memoryContent === 'object') {
      // Handle JSONB content - extract text from various formats
      if (memoryContent.text) {
        textContent = memoryContent.text;
      } else if (memoryContent.content) {
        textContent = memoryContent.content;
      } else if (Array.isArray(memoryContent)) {
        // Handle array of content parts
        textContent = memoryContent
          .map(part => {
            if (typeof part === 'string') return part;
            if (part.text) return part.text;
            if (part.content) return part.content;
            return '';
          })
          .join(' ');
      } else {
        // Try to stringify if it's an object
        textContent = JSON.stringify(memoryContent);
      }
    }

    if (!textContent) return false;

    // Normalize both texts for comparison
    const normalizedMemory = normalizeText(textContent);
    const normalizedTemplate = normalizeText(templatePrompt);

    // ONLY exact matches count as template usage
    // This prevents false positives like "create a new artist" matching "Strengthen Your Brand Position"
    if (normalizedMemory === normalizedTemplate) {
      return true;
    }

    // Allow template to be contained in memory (user may have added extra text)
    // But only if memory contains the FULL template text
    if (normalizedMemory.includes(normalizedTemplate)) {
      return true;
    }

    // No partial matches allowed - too many false positives
    return false;

  } catch (error) {
    console.error('Error comparing memory content to template:', error);
    return false;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const timeFilter = searchParams.get('timeFilter') || 'Last 7 Days';
    const templateId = searchParams.get('templateId'); // Optional: analyze specific template
    
    console.log(`🎯 [AGENT-TEMPLATE-USAGE] Starting analysis for ${timeFilter}${templateId ? ` (template: ${templateId})` : ''}`);

    // Check cache first
    const cacheKey = `agent-template-usage-${timeFilter}-${templateId || 'all'}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`🚀 [AGENT-TEMPLATE-USAGE] Returning cached result`);
      return NextResponse.json(cached.data);
    }

    // Helper function to get date range
    function getDateRangeForTimeFilter(filter: string): { start: string | null; end: string } {
      const now = new Date();
      const end = now.toISOString();
      
      switch (filter) {
        case 'Last 24 Hours':
          const start24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          return { start: start24h.toISOString(), end };
        case 'Last 7 Days':
          const start7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          return { start: start7d.toISOString(), end };
        case 'Last 30 Days':
          const start30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          return { start: start30d.toISOString(), end };
        case 'Last 90 Days':
          const start90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          return { start: start90d.toISOString(), end };
        default:
          return { start: null, end };
      }
    }

    const { start: startDate } = getDateRangeForTimeFilter(timeFilter);

    // Step 1: Fetch all agent templates
    console.log(`📋 [AGENT-TEMPLATE-USAGE] Fetching agent templates...`);
    const { data: templates, error: templatesError } = await supabaseAdmin
      .from('agent_templates')
      .select('id, title, prompt');

    if (templatesError) {
      console.error('❌ [AGENT-TEMPLATE-USAGE] Error fetching templates:', templatesError);
      return NextResponse.json({ 
        error: 'Failed to fetch agent templates', 
        details: templatesError.message 
      }, { status: 500 });
    }

    if (!templates || templates.length === 0) {
      console.log('📋 [AGENT-TEMPLATE-USAGE] No agent templates found');
      return NextResponse.json({
        templates: [],
        summary: {
          total_templates: 0,
          total_usage: 0,
          unique_users: 0,
          time_range: timeFilter
        }
      });
    }

    console.log(`📋 [AGENT-TEMPLATE-USAGE] Found ${templates.length} agent templates`);

    // Filter templates if specific template requested
    const templatesToAnalyze = templateId 
      ? templates.filter(t => t.id === templateId)
      : templates;

    if (templateId && templatesToAnalyze.length === 0) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Step 2: Filter out test accounts and fetch rooms
    console.log(`💾 [AGENT-TEMPLATE-USAGE] Fetching rooms and memories...`);
    
    // First, get allowed account IDs (excluding test accounts)
    console.log('🔍 [AGENT-TEMPLATE-USAGE] Filtering out test accounts...');
    
    // Get test emails list
    const { data: testEmailsData } = await supabaseAdmin
      .from('test_emails')
      .select('email');
    const testEmailsList = testEmailsData?.map(item => item.email) || [];
    
    // Get all account data for filtering
    const [emailAccountsResponse, walletAccountsResponse] = await Promise.all([
      supabaseAdmin.from('account_emails').select('account_id, email'),
      supabaseAdmin.from('account_wallets').select('account_id, wallet')
    ]);
    
    const allowedAccountIds = new Set<string>();
    
    // Add non-test email users
    if (emailAccountsResponse.data) {
      for (const account of emailAccountsResponse.data) {
        const email = account.email;
        if (!email) continue;
        if (testEmailsList.includes(email)) continue;
        if (email.includes('@example.com')) continue;
        if (email.includes('+')) continue;
        allowedAccountIds.add(account.account_id);
      }
    }
    
    // List of test wallet account IDs to exclude
    const testWalletAccountIds = ['3cdea198', '5ada04cd', '44b0c8fd', 'c9e86577', '496a071a', 'a3b8a5ba', '2fbe2485'];
    
    // Add wallet users, but filter out test wallet users
    if (walletAccountsResponse.data) {
      for (const account of walletAccountsResponse.data) {
        // Check if this is a test wallet user (by account ID pattern)
        const isTestWallet = testWalletAccountIds.some(testId => account.account_id.startsWith(testId));
        if (isTestWallet) {
          console.log('🔍 [AGENT-TEMPLATE-USAGE] *** EXCLUDING test wallet user:', account.account_id.substring(0, 8));
          continue;
        }
        allowedAccountIds.add(account.account_id);
      }
    }
    
    const allowedAccountIdsArray = Array.from(allowedAccountIds);
    console.log(`🔍 [AGENT-TEMPLATE-USAGE] Filtered to ${allowedAccountIdsArray.length} non-test accounts`);
    
    // Get memories created in time period for non-test accounts - much more accurate approach
    console.log(`📝 [AGENT-TEMPLATE-USAGE] Fetching memories created in time period for ${allowedAccountIdsArray.length} accounts...`);
    
    // Fetch all rooms for non-test accounts first (we need room metadata)
    const allRooms: Array<{id: string; account_id: string; artist_id: string}> = [];
    const roomBatchSize = 100;
    
    for (let i = 0; i < allowedAccountIdsArray.length; i += roomBatchSize) {
      const batchAccountIds = allowedAccountIdsArray.slice(i, i + roomBatchSize);
      
      const { data: batchRooms, error: batchError } = await supabaseAdmin
        .from('rooms')
        .select('id, account_id, artist_id')
        .in('account_id', batchAccountIds);
      
      if (batchError) {
        console.error(`❌ [AGENT-TEMPLATE-USAGE] Error fetching rooms batch ${Math.floor(i/roomBatchSize) + 1}:`, batchError);
        continue;
      }
      
      if (batchRooms) {
        allRooms.push(...batchRooms);
      }
    }
    
    console.log(`🏠 [AGENT-TEMPLATE-USAGE] Found ${allRooms.length} total rooms from non-test accounts`);
    
    // Create room lookup map
    const roomLookup = new Map();
    allRooms.forEach(room => roomLookup.set(room.id, room));
    
    // Now fetch memories created in the time period
    let memoriesQuery = supabaseAdmin
      .from('memories')
      .select('id, room_id, content, updated_at')
      .order('updated_at', { ascending: true });
    
    if (startDate) {
      memoriesQuery = memoriesQuery.gte('updated_at', startDate);
    }
    
    const { data: timeFilteredMemories, error: memoriesError } = await memoriesQuery.limit(10000);
    
    if (memoriesError) {
      console.error('❌ [AGENT-TEMPLATE-USAGE] Error fetching time-filtered memories:', memoriesError);
      return NextResponse.json({ 
        error: 'Failed to fetch memories', 
        details: memoriesError.message 
      }, { status: 500 });
    }
    
    console.log(`📝 [AGENT-TEMPLATE-USAGE] Found ${timeFilteredMemories?.length || 0} memories created in time period`);
    
    // Filter memories to only include rooms from non-test accounts
    const validMemories = (timeFilteredMemories || []).filter(memory => 
      roomLookup.has(memory.room_id)
    );
    
    console.log(`✅ [AGENT-TEMPLATE-USAGE] Filtered to ${validMemories.length} memories from non-test accounts`);
    
    // Group by room and take first memory of each room (within the time period)
    const roomFirstMemory = new Map();
    for (const memory of validMemories) {
      if (!roomFirstMemory.has(memory.room_id)) {
        roomFirstMemory.set(memory.room_id, memory);
      }
    }
    
    const firstMemories = Array.from(roomFirstMemory.values());
    
    // Get room data for the rooms that have first messages in our time period
    const rooms = firstMemories.map(memory => roomLookup.get(memory.room_id)).filter(Boolean);

    console.log(`📝 [AGENT-TEMPLATE-USAGE] Analyzing ${firstMemories.length} first messages`);

    // Step 3: Match memories to templates
    const templateUsage: TemplateUsageResult[] = [];
    const globalStats = {
      totalUsage: 0,
      uniqueUsers: new Set<string>(),
      uniqueArtists: new Set<string>()
    };

    for (const template of templatesToAnalyze) {
      console.log(`🔍 [AGENT-TEMPLATE-USAGE] Analyzing template: "${template.title}"`);
      
              const matches: Array<{memory: MemoryObject; room: RoomObject}> = [];
      
      for (const memory of firstMemories) {
        if (isTemplateMatch(memory.content, template.prompt)) {
          const room = rooms.find(r => r.id === memory.room_id);
          if (room) {
            matches.push({
              memory,
              room
            });
            
            // DEBUG: Log matches for both suspicious templates
            if ((template.title === "Strengthen Your Brand Position" || template.title === "Daily Social Trends ") && matches.length <= 5) {
              console.log(`🚨 [DEBUG] Match #${matches.length} for "${template.title}":`);
              console.log(`🚨 [DEBUG] Memory Content:`, JSON.stringify(memory.content));
              console.log(`🚨 [DEBUG] Memory ID: ${memory.id}, Room ID: ${memory.room_id}`);
              console.log(`🚨 [DEBUG] Created At: ${memory.updated_at}`);
            }
          }
        }
      }

      // Calculate stats for this template
      const uniqueUsersForTemplate = new Set(matches.map(m => m.room.account_id));
      const uniqueArtistsForTemplate = new Set(matches.map(m => m.room.artist_id));
      
      // Update global stats
      globalStats.totalUsage += matches.length;
      matches.forEach(m => {
        globalStats.uniqueUsers.add(m.room.account_id);
        globalStats.uniqueArtists.add(m.room.artist_id);
      });

      // Sort matches by date to get first/last used
      const sortedMatches = matches.sort((a, b) => 
        new Date(a.memory.updated_at).getTime() - new Date(b.memory.updated_at).getTime()
      );

      templateUsage.push({
        template_id: template.id,
        template_title: template.title,
        template_prompt: template.prompt,
        usage_count: matches.length,
        unique_users: uniqueUsersForTemplate.size,
        unique_artists: uniqueArtistsForTemplate.size,
        first_used: sortedMatches.length > 0 ? sortedMatches[0].memory.updated_at : null,
        last_used: sortedMatches.length > 0 ? sortedMatches[sortedMatches.length - 1].memory.updated_at : null,
        sample_rooms: sortedMatches.slice(0, 20).map(m => ({
          room_id: m.room.id,
          account_id: m.room.account_id,
          artist_id: m.room.artist_id,
          created_at: m.memory.updated_at
        }))
      });

      console.log(`✅ [AGENT-TEMPLATE-USAGE] Template "${template.title}": ${matches.length} matches`);
    }

    // Get user emails and artist names for all sample rooms
    console.log('📧 [AGENT-TEMPLATE-USAGE] Fetching user emails and artist names...');
    
    const allAccountIds = Array.from(new Set(
      templateUsage.flatMap(t => t.sample_rooms.map(r => r.account_id).filter(Boolean))
    ));
    
    const allArtistIds = Array.from(new Set(
      templateUsage.flatMap(t => t.sample_rooms.map(r => r.artist_id).filter(Boolean))
    ));
    
    console.log(`📧 [AGENT-TEMPLATE-USAGE] Found ${allAccountIds.length} unique account IDs and ${allArtistIds.length} unique artist IDs`);
    
    let emailsByAccountId: Record<string, string> = {};
    let artistNamesByArtistId: Record<string, string> = {};
    
    // Fetch emails and artist names in parallel
    const [emailsResponse, artistsResponse] = await Promise.all([
      allAccountIds.length > 0 ? supabaseAdmin
        .from('account_emails')
        .select('account_id, email')
        .in('account_id', allAccountIds) : Promise.resolve({ data: null, error: null }),
      
      allArtistIds.length > 0 ? supabaseAdmin
        .from('accounts')
        .select('id, name')
        .in('id', allArtistIds) : Promise.resolve({ data: null, error: null })
    ]);
    
    if (emailsResponse.error) {
      console.error('❌ [AGENT-TEMPLATE-USAGE] Error fetching emails:', emailsResponse.error);
    } else {
      emailsByAccountId = Object.fromEntries((emailsResponse.data || []).map(ae => [ae.account_id, ae.email]));
      console.log(`✅ [AGENT-TEMPLATE-USAGE] Found ${emailsResponse.data?.length || 0} account emails`);
    }
    
    if (artistsResponse.error) {
      console.error('❌ [AGENT-TEMPLATE-USAGE] Error fetching artist names:', artistsResponse.error);
    } else {
      artistNamesByArtistId = Object.fromEntries((artistsResponse.data || []).map(artist => [artist.id, artist.name]));
      console.log(`✅ [AGENT-TEMPLATE-USAGE] Found ${artistsResponse.data?.length || 0} artist names`);
    }
    
    // Add emails and artist names to template usage data
    const templatesWithEmails = templateUsage.map(template => ({
      ...template,
      sample_rooms: template.sample_rooms.map(room => ({
        ...room,
        user_email: emailsByAccountId[room.account_id] || null,
        artist_name: artistNamesByArtistId[room.artist_id] || null
      }))
    }));

    // Sort by usage count (most popular first)
    templatesWithEmails.sort((a, b) => b.usage_count - a.usage_count);

    const result = {
      templates: templatesWithEmails,
      summary: {
        total_templates: templatesToAnalyze.length,
        total_usage: globalStats.totalUsage,
        unique_users: globalStats.uniqueUsers.size,
        unique_artists: globalStats.uniqueArtists.size,
        time_range: timeFilter,
        analyzed_rooms: rooms.length,
        analyzed_messages: firstMemories.length
      }
    };

    // Cache the result
    cache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    console.log(`✅ [AGENT-TEMPLATE-USAGE] Analysis complete: ${globalStats.totalUsage} total usages across ${globalStats.uniqueUsers.size} users`);

    return NextResponse.json(result);

  } catch (error) {
    console.error('❌ [AGENT-TEMPLATE-USAGE] API Error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze agent template usage', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 