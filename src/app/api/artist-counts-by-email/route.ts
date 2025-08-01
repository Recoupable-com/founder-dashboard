import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Define cache data type
interface ArtistCountsData {
  [key: string]: unknown;
}

// In-memory cache for artist counts data (cache for 2 minutes)
const artistCountsCache = new Map<string, { data: ArtistCountsData, timestamp: number }>();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

// Get cached data if still valid
function getCachedData(cacheKey: string) {
  const cached = artistCountsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  return null;
}

// Set cached data
function setCachedData(cacheKey: string, data: ArtistCountsData) {
  artistCountsCache.set(cacheKey, { data, timestamp: Date.now() });
  
  // Clean up old cache entries (simple cleanup)
  if (artistCountsCache.size > 50) {
    const oldestKey = artistCountsCache.keys().next().value;
    if (oldestKey) {
      artistCountsCache.delete(oldestKey);
    }
  }
}

export async function GET() {
  const startTime = Date.now();
  console.log('🔄 [ARTIST-COUNTS-API] Starting artist counts fetch');
  
  try {
    // Create cache key (artist counts don't change frequently, so hourly cache is fine)
    const now = new Date();
    const cacheEnd = new Date(now);
    cacheEnd.setMinutes(0, 0, 0);
    const cacheKey = `artist-counts-${cacheEnd.toISOString()}`;
    console.log(`🔍 [ARTIST-COUNTS-API] Cache key: ${cacheKey}`);
    
    // Check cache first
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
      const endTime = Date.now();
      console.log(`⚡ [ARTIST-COUNTS-API] COMPLETED (CACHED) in ${endTime - startTime}ms`);
      return NextResponse.json(cachedData);
    }
    
    console.log(`🔍 [ARTIST-COUNTS-API] Cache miss, fetching from database`);
    console.log('🎨 Artist counts by email API: Starting...');

    // NEW APPROACH: Get users from a working API that bypasses RLS issues
    // Use the message counts API which we know works and contains active users
    const messageCountsResponse = await fetch('http://localhost:3000/api/conversations/message-counts');
    const messageCountsData = await messageCountsResponse.json();
    
    console.log(`📧 Found ${messageCountsData?.length || 0} users from message counts`);

    // Step 1: Get artist counts for users who have sent messages (these bypass RLS)
    const artistCountsByEmail: Record<string, number> = {};
    
    for (const userMessage of messageCountsData || []) {
      const email = userMessage.account_email;
      if (!email) continue;

      // Get account_id for this email
      const { data: emailData } = await supabaseAdmin
        .from('account_emails')
        .select('account_id')
        .eq('email', email);

      if (emailData && emailData.length > 0) {
        const accountId = emailData[0].account_id;
        
        // Get artist count for this account
        const { data: artistData } = await supabaseAdmin
          .from('account_artist_ids')
          .select('account_id')
          .eq('account_id', accountId);
        
        if (artistData && artistData.length > 0) {
          artistCountsByEmail[email] = artistData.length;
        }
      }
    }

    // Step 2: Also check for users who might have artists but no messages
    // Get additional artist accounts that aren't in the message counts
    console.log(`🎨 Found artists for ${Object.keys(artistCountsByEmail).length} message-active users`);

    // Step 3: Create the final mapping (already done above)
    const emailMappingsData = messageCountsData;

    console.log(`📧 Found ${emailMappingsData?.length || 0} email mappings`);
    console.log(`🎯 Final mapping: ${Object.keys(artistCountsByEmail).length} users with artist counts`);

    // Step 5: Also provide detailed information for debugging
    const userArtistCounts = Object.entries(artistCountsByEmail)
      .map(([email, count]) => ({ email, artistCount: count }))
      .sort((a, b) => b.artistCount - a.artistCount);

    const totalArtists = Object.values(artistCountsByEmail).reduce((sum, count) => sum + count, 0);
    const totalUsers = userArtistCounts.length;

    console.log(`📈 Artist counts summary:`);
    console.log(`   Total artists: ${totalArtists}`);
    console.log(`   Total users with artists: ${totalUsers}`);
    console.log(`   Average artists per user: ${totalUsers > 0 ? (totalArtists / totalUsers).toFixed(2) : 0}`);

    const result = {
      success: true,
      data: {
        artistCountsByEmail,
        userArtistCounts,
        summary: {
          totalArtists,
          totalUsers,
          averageArtistsPerUser: totalUsers > 0 ? Math.round((totalArtists / totalUsers) * 100) / 100 : 0
        }
      }
    };

    // Cache the result
    setCachedData(cacheKey, result);
    
    const endTime = Date.now();
    console.log(`⚡ [ARTIST-COUNTS-API] COMPLETED in ${endTime - startTime}ms`);
    return NextResponse.json(result);

  } catch (error) {
    console.error('❌ Exception in artist-counts-by-email API:', error);
    return NextResponse.json(
      { error: 'Failed to fetch artist counts by email' }, 
      { status: 500 }
    );
  }
} 