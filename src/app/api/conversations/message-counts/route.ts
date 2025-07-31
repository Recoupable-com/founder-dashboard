import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// In-memory cache for message counts (cache for 2 minutes)
const messageCountsCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

// Get cached data if still valid
function getCachedData(cacheKey: string) {
  const cached = messageCountsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  return null;
}

// Set cached data
function setCachedData(cacheKey: string, data: any) {
  messageCountsCache.set(cacheKey, { data, timestamp: Date.now() });
  
  // Clean up old cache entries (simple cleanup)
  if (messageCountsCache.size > 50) {
    const oldestKey = messageCountsCache.keys().next().value;
    if (oldestKey) {
      messageCountsCache.delete(oldestKey);
    }
  }
}

export async function GET(request: Request) {
  const startTime = Date.now();
  console.log('🔄 [MESSAGE-COUNTS-API] Starting message counts fetch');
  const { searchParams } = new URL(request.url);
  const start_date = searchParams.get('start_date');
  const end_date = searchParams.get('end_date');

  // If start_date is not provided, use a very early date for "All Time"
  const now = new Date();
  const allTimeStartDate = '1970-01-01T00:00:00.000Z'; 
  const defaultCurrentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // If a start_date is explicitly passed, use it.
  // Otherwise, if it was intentionally omitted by the client (for All Time), use allTimeStartDate.
  // This specific API isn't directly selecting "Month", but keeping a monthly default if old clients call without params.
  const start = start_date ? start_date : (request.url.includes('start_date=') ? defaultCurrentMonthStart : allTimeStartDate);
  
  // For caching consistency, always round end time to nearest hour for cache key
  const actualEnd = end_date || now.toISOString();
  const cacheEnd = new Date(actualEnd);
  cacheEnd.setMinutes(0, 0, 0); // Round to start of current hour for consistent cache keys
  
  // Use actual end time for database queries, rounded end time for cache key
  const end = actualEnd;
  const cacheKey = `message-counts-${start}-${cacheEnd.toISOString()}`;
  console.log(`🔍 [MESSAGE-COUNTS-API] Cache key: ${cacheKey}`);
  
  // Check cache first
  const cachedData = getCachedData(cacheKey);
  if (cachedData) {
    const endTime = Date.now();
    console.log(`⚡ [MESSAGE-COUNTS-API] COMPLETED (CACHED) in ${endTime - startTime}ms`);
    return NextResponse.json(cachedData);
  }
  
  console.log(`🔍 [MESSAGE-COUNTS-API] Cache miss, fetching from database`);

  // Query Supabase for messages sent by users in the period
  const { data, error } = await supabaseAdmin.rpc('get_message_counts_by_user', { start_date: start, end_date: end });
  if (error) {
    console.error('Error fetching message counts by user:', error);
    return NextResponse.json({ error: 'Failed to fetch message counts by user' }, { status: 500 });
  }
  
  // Cache the result
  setCachedData(cacheKey, data);
  
  const endTime = Date.now();
  console.log(`⚡ [MESSAGE-COUNTS-API] COMPLETED in ${endTime - startTime}ms`);
  return NextResponse.json(data);
} 