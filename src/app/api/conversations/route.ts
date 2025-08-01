import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Define cache data type
interface ConversationsData {
  [key: string]: unknown;
}

// In-memory cache for conversations data (cache for 2 minutes)
const conversationsCache = new Map<string, { data: ConversationsData, timestamp: number }>();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

// Get cached data if still valid
function getCachedData(cacheKey: string) {
  const cached = conversationsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  return null;
}

// Set cached data
function setCachedData(cacheKey: string, data: ConversationsData) {
  conversationsCache.set(cacheKey, { data, timestamp: Date.now() });
  
  // Clean up old cache entries (simple cleanup)
  if (conversationsCache.size > 50) {
    const oldestKey = conversationsCache.keys().next().value;
    if (oldestKey) {
      conversationsCache.delete(oldestKey);
    }
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  console.log('🔄 [CONVERSATIONS-API] Starting conversations fetch');
  try {
    const { searchParams } = new URL(request.url);
    const searchQuery = searchParams.get('search') || '';
    const excludeTestEmails = searchParams.get('excludeTest') === 'true';
    const timeFilter = searchParams.get('timeFilter') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');
    const userFilter = searchParams.get('userFilter') || '';
    
    // Create cache key (round time to nearest hour for consistency)
    const now = new Date();
    const cacheEnd = new Date(now);
    cacheEnd.setMinutes(0, 0, 0);
    const cacheKey = `conversations-${timeFilter}-${excludeTestEmails}-${userFilter}-${searchQuery}-${page}-${limit}-${cacheEnd.toISOString()}`;
    console.log(`🔍 [CONVERSATIONS-API] Cache key: ${cacheKey}`);
    
    // Check cache first
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
      const endTime = Date.now();
      console.log(`⚡ [CONVERSATIONS-API] COMPLETED (CACHED) in ${endTime - startTime}ms`);
      return NextResponse.json(cachedData);
    }
    
    console.log(`🔍 [CONVERSATIONS-API] Cache miss, fetching from database`);
    console.log(`API ROUTE: Parameters - timeFilter: ${timeFilter}, userFilter: ${userFilter}, excludeTest: ${excludeTestEmails}`);

    // Helper function to get date range for time filter
    function getDateRangeForTimeFilter(filter: string): { start: string | null, end: string } {
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

    // Get total count first for pagination
    const { count: totalRooms, error: countError } = await supabaseAdmin
      .from('rooms')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error('API ROUTE: Error getting room count:', countError);
    }

    // Get total unique users across all conversations
    let totalUniqueUsers = 0;
    let filteredTotalRooms = totalRooms || 0;
    let filteredTotalUniqueUsers = 0;
    
    try {
      // Get users from both account_emails AND account_wallets to include miniapp users
      const [emailUsersResponse, walletUsersResponse] = await Promise.all([
        supabaseAdmin
          .from('account_emails')
          .select('account_id, email')
          .limit(10000),
        supabaseAdmin
          .from('account_wallets')
          .select('account_id, wallet')
          .limit(10000)
      ]);
      
      if (emailUsersResponse.error) {
        console.error('API ROUTE: Error getting account emails:', emailUsersResponse.error);
      }
      if (walletUsersResponse.error) {
        console.error('API ROUTE: Error getting account wallets:', walletUsersResponse.error);
      }
      
      const allAccountEmailsData = emailUsersResponse.data || [];
      const allWalletUsersData = walletUsersResponse.data || [];
      
      // Calculate total unique users from BOTH email and wallet users (exclude accounts with neither)
      const emailAccountIds = new Set(allAccountEmailsData.map(r => r.account_id));
      const walletAccountIds = new Set(allWalletUsersData.map(r => r.account_id));
      const allAccountIds = new Set([...emailAccountIds, ...walletAccountIds]);
      totalUniqueUsers = allAccountIds.size;
      
      if (allAccountEmailsData) {
        // If excluding test emails, we need to filter the totals
        if (excludeTestEmails) {
          // Get test emails list
          const { data: testEmailsData } = await supabaseAdmin
            .from('test_emails')
            .select('email');
          
          const testEmailsList = testEmailsData?.map(item => item.email) || [];
          
          // Filter out test accounts from both email and wallet users
          const nonTestAccountIds = new Set();
          
          // Add non-test email users
          for (const accountEmail of allAccountEmailsData) {
            const email = accountEmail.email;
            if (!email) continue;
            if (testEmailsList.includes(email)) continue;
            if (email.includes('@example.com')) continue;
            if (email.includes('+')) continue;
            nonTestAccountIds.add(accountEmail.account_id);
          }
          
          // List of test wallet account IDs to exclude
          const testWalletAccountIds = ['3cdea198', '5ada04cd', '44b0c8fd', 'c9e86577', '496a071a', 'a3b8a5ba', '2fbe2485'];
          
          // Add wallet users, but ALSO filter out test wallet users
          for (const walletUser of allWalletUsersData) {
            // Check if this is a test wallet user (by account ID pattern)
            const isTestWallet = testWalletAccountIds.some(testId => walletUser.account_id.startsWith(testId));
            if (isTestWallet) {
              console.log('API ROUTE: *** SKIPPING test wallet user in conversations:', walletUser.account_id.substring(0, 8));
              continue;
            }
            
            // Wallet users are considered real users unless their account_id is in some test list
            nonTestAccountIds.add(walletUser.account_id);
          }
          
          // Count filtered users and rooms
          const nonTestAccountIdsArray = Array.from(nonTestAccountIds);
          filteredTotalUniqueUsers = nonTestAccountIdsArray.length;
          
          if (nonTestAccountIdsArray.length > 0) {
            // Keep all rooms, just filter user count
            filteredTotalRooms = totalRooms || 0;
          } else {
            filteredTotalRooms = totalRooms || 0;
          }
        } else {
          // Not excluding test emails, but still exclude no-contact accounts from USER count
          // Keep all rooms in the room count
          filteredTotalRooms = totalRooms || 0;
          filteredTotalUniqueUsers = totalUniqueUsers;
        }
      }
    } catch (error) {
      console.error('API ROUTE: Exception getting unique users:', error);
    }

    // Calculate pagination using filtered totals
    const offset = (page - 1) * limit;

    // Search for rooms with matching message content if search query provided
    let searchFilteredRoomIds: Set<string> | null = null;
    if (searchQuery && searchQuery.trim() !== '') {
      console.log(`[API] Searching for "${searchQuery}" in message content across ALL conversations...`);
      
      try {
        // Search for user messages that contain the search query across all rooms
        const { data: matchingMemories, error: searchError } = await supabaseAdmin
          .from('memories')
          .select('room_id')
          .eq('role', 'user') // Only search user messages
          .ilike('content', `%${searchQuery}%`); // Case-insensitive search
          
        if (searchError) {
          console.error('Error searching memories:', searchError);
        } else if (matchingMemories && matchingMemories.length > 0) {
          searchFilteredRoomIds = new Set(matchingMemories.map(m => m.room_id));
          console.log(`[API] Found ${searchFilteredRoomIds.size} rooms with messages containing "${searchQuery}"`);
        } else {
          console.log(`[API] No rooms found with messages containing "${searchQuery}"`);
          searchFilteredRoomIds = new Set(); // Empty set - no matches
        }
      } catch (error) {
        console.error('Exception searching message content:', error);
      }
    }

    // Handle user filtering - find account ID for the filtered email
    let userFilteredAccountIds: Set<string> | null = null;
    if (userFilter && userFilter.trim() !== '') {
      console.log(`[API] Filtering by user: ${userFilter}`);
      
      // Check if this is a wallet user filter (contains "wallet")
      if (userFilter.includes('(wallet)')) {
        // Extract wallet address from display format like "1a2b3c4d...ef56 (wallet)"
        const walletMatch = userFilter.match(/^([a-fA-F0-9]{8})\.\.\.([a-fA-F0-9]{4})\s*\(wallet\)$/);
        if (walletMatch) {
          const walletStart = walletMatch[1];
          const walletEnd = walletMatch[2];
          
          // Find wallet users that match this pattern
          const { data: walletUsers } = await supabaseAdmin
            .from('account_wallets')
            .select('account_id, wallet');
          
          const matchingAccountIds = new Set<string>();
          if (walletUsers) {
            for (const walletUser of walletUsers) {
              if (walletUser.wallet?.startsWith(walletStart) && walletUser.wallet?.endsWith(walletEnd)) {
                matchingAccountIds.add(walletUser.account_id);
              }
            }
          }
          userFilteredAccountIds = matchingAccountIds;
          console.log(`API ROUTE: Found ${matchingAccountIds.size} accounts for wallet filter ${userFilter}`);
        }
      } else {
        // Regular email filtering
        const { data: emailUsers } = await supabaseAdmin
          .from('account_emails')
          .select('account_id, email')
          .eq('email', userFilter);
        
        if (emailUsers && emailUsers.length > 0) {
          userFilteredAccountIds = new Set(emailUsers.map(user => user.account_id));
          console.log(`API ROUTE: Found ${userFilteredAccountIds.size} accounts for email filter ${userFilter}`);
        } else {
          console.log(`API ROUTE: No accounts found for email filter ${userFilter}`);
          userFilteredAccountIds = new Set(); // Empty set will result in no rooms
        }
      }
    }

    // Type for room objects
    type Room = {
      id: string;
      account_id: string;
      artist_id: string;
      updated_at: string;
      topic: string | null;
    };

    // Fetch rooms - filter by account IDs if excluding test emails
    let roomsData: Room[] | null;
    let roomsError;
    let actualFilteredRoomCount = 0; // Track the actual total count after all filtering
    
    if (excludeTestEmails || userFilteredAccountIds) {
      console.log('API ROUTE: Fetching rooms with filtering (test emails and/or user filter)');
      let allowedAccountIds = new Set<string>();

      if (userFilteredAccountIds) {
        // If filtering by user, skip test email exclusion and use only the filtered user accounts
        allowedAccountIds = new Set(userFilteredAccountIds);
        console.log('[API] Skipping test email exclusion because user filter is active');
      } else if (excludeTestEmails) {
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
        
        // Add wallet users, but ALSO filter out test wallet users
        if (walletAccountsResponse.data) {
          for (const account of walletAccountsResponse.data) {
            // Check if this is a test wallet user (by account ID pattern)
            const isTestWallet = testWalletAccountIds.some(testId => account.account_id.startsWith(testId));
            if (isTestWallet) {
              console.log('API ROUTE: *** EXCLUDING test wallet user from room fetching:', account.account_id.substring(0, 8));
              continue;
            }
            allowedAccountIds.add(account.account_id);
          }
        }
      } else {
        // If not excluding test emails but we have user filter, start with all accounts
        const [emailAccountsResponse, walletAccountsResponse] = await Promise.all([
          supabaseAdmin.from('account_emails').select('account_id, email'),
          supabaseAdmin.from('account_wallets').select('account_id, wallet')
        ]);
        
        if (emailAccountsResponse.data) {
          for (const account of emailAccountsResponse.data) {
            allowedAccountIds.add(account.account_id);
          }
        }
        
        if (walletAccountsResponse.data) {
          for (const account of walletAccountsResponse.data) {
            allowedAccountIds.add(account.account_id);
          }
        }
      }
      
      // Apply user filter if provided
      if (userFilteredAccountIds) {
        // Intersect allowedAccountIds with userFilteredAccountIds
        const intersection = new Set<string>();
        for (const accountId of userFilteredAccountIds) {
          if (allowedAccountIds.has(accountId)) {
            intersection.add(accountId);
          }
        }
        allowedAccountIds = intersection;
        console.log(`API ROUTE: After applying user filter, ${allowedAccountIds.size} accounts remain`);
      }
      
      // Get accounts with test artist names and exclude them (only if excludeTestEmails is true)
      let testArtistAccountIds = new Set<string>();
      if (excludeTestEmails) {
        const { data: testArtistAccounts } = await supabaseAdmin
          .from('accounts')
          .select('id')
          .eq('name', 'sweetman_eth');
        
        testArtistAccountIds = new Set(testArtistAccounts?.map(account => account.id) || []);
        console.log(`API ROUTE: Found ${testArtistAccountIds.size} accounts with test artist name "sweetman_eth"`);
      }
      
      const allowedAccountIdsArray = Array.from(allowedAccountIds);
      console.log(`API ROUTE: Fetching rooms for ${allowedAccountIdsArray.length} allowed accounts`);
      
      console.log('[API] Allowed account IDs count:', allowedAccountIdsArray.length);
      console.log('[API] First 10 allowed account IDs:', allowedAccountIdsArray.slice(0, 10));
      
      if (allowedAccountIdsArray.length > 0) {
        // Check if we need to apply time filtering (when both userFilter and timeFilter are provided)
        const shouldApplyTimeFilter = userFilter && timeFilter && timeFilter !== 'All Time';
        let roomsWithRecentActivity: Set<string> | null = null;
        
        if (shouldApplyTimeFilter) {
          console.log(`[API] Applying time filter: ${timeFilter} for user filter: ${userFilter}`);
          const { start: timeStart, end: timeEnd } = getDateRangeForTimeFilter(timeFilter);
          
          if (timeStart) {
            // Get rooms that had message activity in the specified time period
            const { data: recentMemories } = await supabaseAdmin
              .from('memories')
              .select('room_id')
              .gte('updated_at', timeStart)
              .lte('updated_at', timeEnd);
            
            roomsWithRecentActivity = new Set((recentMemories || []).map(m => m.room_id));
            console.log(`[API] Found ${roomsWithRecentActivity.size} rooms with recent activity in ${timeFilter}`);
          }
        }

        // Batch the .in() queries to avoid hitting Supabase/Postgres limits
        const chunkSize = 100;
        const allRooms: Room[] = [];
        for (let i = 0; i < allowedAccountIdsArray.length; i += chunkSize) {
          const chunk = allowedAccountIdsArray.slice(i, i + chunkSize);
          console.log(`[API] Fetching rooms for chunk ${Math.floor(i/chunkSize) + 1} (${chunk.length} accounts)`);
          const { data, error } = await supabaseAdmin
            .from('rooms')
            .select('id, account_id, artist_id, updated_at, topic')
            .in('account_id', chunk)
            .order('updated_at', { ascending: false });
          if (error) {
            console.error(`[API] Error fetching rooms for chunk ${Math.floor(i/chunkSize) + 1}:`, error);
            continue;
          }
          if (data) {
            allRooms.push(...data);
          }
        }
        
        // Apply time filtering first if needed
        let filteredRooms = allRooms;
        if (shouldApplyTimeFilter && roomsWithRecentActivity) {
          filteredRooms = allRooms.filter(room => roomsWithRecentActivity!.has(room.id));
          console.log(`[API] Filtered to ${filteredRooms.length} rooms with recent activity (from ${allRooms.length} total)`);
        }
        
        // Apply search filtering if provided
        if (searchFilteredRoomIds !== null) {
          const beforeSearchCount = filteredRooms.length;
          filteredRooms = filteredRooms.filter(room => {
            // Include rooms that match search OR match basic criteria (topic, etc.)
            const matchesMessageContent = searchFilteredRoomIds!.has(room.id);
            const matchesBasicCriteria = 
              room.topic?.toLowerCase().includes(searchQuery.toLowerCase()) ||
              false; // We'll check email/artist after fetching account data
            return matchesMessageContent || matchesBasicCriteria;
          });
          console.log(`[API] Applied search filter: ${filteredRooms.length} rooms remain (from ${beforeSearchCount})`);
        }
        
        // Set the actual filtered count before pagination
        actualFilteredRoomCount = filteredRooms.length;
        console.log(`[API] Total filtered rooms for this user: ${actualFilteredRoomCount}`);
        
        // Apply pagination after merging and filtering all results
        const pagedRooms = filteredRooms.slice(offset, offset + limit);
        // Filter out test artist rooms after fetching (only if excludeTestEmails is true)
        if (excludeTestEmails) {
          roomsData = pagedRooms.filter(room => !testArtistAccountIds.has(room.artist_id)) || [];
          console.log(`API ROUTE: Filtered out ${(pagedRooms.length || 0) - roomsData.length} rooms with test artists`);
        } else {
          roomsData = pagedRooms || [];
        }
        roomsError = null;
      } else {
        roomsData = [];
        roomsError = null;
        actualFilteredRoomCount = 0;
      }
    } else {
      console.log('API ROUTE: Fetching all rooms (no filtering)');
      
      // If we have search filtering, we need to get all rooms first then filter
      if (searchFilteredRoomIds !== null) {
        console.log('[API] Search filtering active - fetching all rooms first');
        
        // Get all rooms first
        const { data: allRoomsData, error } = await supabaseAdmin
          .from('rooms')
          .select('id, account_id, artist_id, updated_at, topic')
          .order('updated_at', { ascending: false });
        
        if (error) {
          console.error('Error fetching all rooms for search:', error);
          roomsData = [];
          roomsError = error;
        } else if (allRoomsData) {
          // Apply search filtering
          const searchFilteredRooms = allRoomsData.filter(room => {
            const matchesMessageContent = searchFilteredRoomIds!.has(room.id);
            const matchesBasicCriteria = 
              room.topic?.toLowerCase().includes(searchQuery.toLowerCase()) ||
              false; // We'll check email/artist after fetching account data
            return matchesMessageContent || matchesBasicCriteria;
          });
          
          console.log(`[API] Search filtered ${allRoomsData.length} rooms down to ${searchFilteredRooms.length}`);
          
          // Set the actual filtered count before pagination
          actualFilteredRoomCount = searchFilteredRooms.length;
          
          // Apply pagination to search results
          roomsData = searchFilteredRooms.slice(offset, offset + limit);
          roomsError = null;
        } else {
          roomsData = [];
          roomsError = null;
          actualFilteredRoomCount = 0;
        }
      } else {
        // No search filtering - use original pagination
        const { data, error } = await supabaseAdmin
          .from('rooms')
          .select('id, account_id, artist_id, updated_at, topic')
          .order('updated_at', { ascending: false })
          .range(offset, offset + limit - 1);
        
        roomsData = data;
        roomsError = error;
        // For non-filtered queries, use the original total count
        actualFilteredRoomCount = filteredTotalRooms;
      }
    }

    console.log(`API ROUTE: Fetched ${roomsData?.length || 0} rooms for page ${page}`);

    if (roomsError || !roomsData) {
      console.error('Error fetching rooms:', roomsError);
      return NextResponse.json({ 
        conversations: [createFallbackConversation()],
        totalCount: filteredTotalRooms,
        totalUniqueUsers: filteredTotalUniqueUsers,
        currentPage: page,
        totalPages: Math.ceil(filteredTotalRooms / limit),
        hasMore: false
      });
    }

    // Count messages and get last message dates for each room - with smaller dataset, we can use larger batches
    const roomIds = roomsData.map((room: { id: string }) => room.id);
    console.log(`Fetching message counts and last message dates for ${roomIds.length} rooms`);
    
    // Batch the message count queries - larger batch size since we have fewer rooms
    const messageCountMap = new Map<string, number>();
    const lastMessageDateMap = new Map<string, string>();
    const batchSize = 100; // Larger batch since we only have ~100 rooms per page
    
    for (let i = 0; i < roomIds.length; i += batchSize) {
      const batch = roomIds.slice(i, i + batchSize);
      console.log(`API ROUTE: Fetching message counts for batch ${Math.floor(i/batchSize) + 1}, rooms ${i} to ${Math.min(i + batchSize - 1, roomIds.length - 1)}`);
      
      try {
        const { data: memoriesData, error: memoriesError } = await supabaseAdmin
          .from('memories')
          .select('room_id, updated_at')
          .in('room_id', batch)
          .order('updated_at', { ascending: false });
          
        if (memoriesError) {
          console.error(`Error fetching message counts for batch ${Math.floor(i/batchSize) + 1}:`, memoriesError);
          continue; // Continue with next batch
        }
        
        if (memoriesData && memoriesData.length > 0) {
          // Count occurrences of each room_id and track last message date
          for (const memory of memoriesData as { room_id: string, updated_at: string }[]) {
            const count = messageCountMap.get(memory.room_id) || 0;
            messageCountMap.set(memory.room_id, count + 1);
            
            // Track the latest message date for each room (since we ordered by updated_at desc)
            if (!lastMessageDateMap.has(memory.room_id)) {
              lastMessageDateMap.set(memory.room_id, memory.updated_at);
            }
          }
        }
      } catch (error) {
        console.error(`Exception fetching message counts for batch ${Math.floor(i/batchSize) + 1}:`, error);
      }
    }
    
    console.log(`Found message counts for ${messageCountMap.size} rooms and last message dates for ${lastMessageDateMap.size} rooms`);
    
    // Cast roomsData for type safety
    const typedRoomsData = roomsData as Array<{
      id: string;
      account_id: string;
      artist_id: string;
      updated_at: string;
      topic: string | null;
    }>;
    
    // Fetch account details in parallel (including wallet data for miniapp users)
    const accountIds = typedRoomsData
      .map((room) => room.account_id)
      .filter((id, index, self) => self.indexOf(id) === index);
    
    const [accountsResponse, accountEmailsResponse, accountWalletsResponse, artistAccountsResponse] = await Promise.all([
      // Get account names
      supabaseAdmin
        .from('accounts')
        .select('id, name')
        .in('id', accountIds),
      
      // Get account emails
      supabaseAdmin
        .from('account_emails')
        .select('account_id, email')
        .in('account_id', accountIds),
        
      // Get account wallets for miniapp users
      supabaseAdmin
        .from('account_wallets')
        .select('account_id, wallet')
        .in('account_id', accountIds),
        
      // Get artist names using artist_ids directly from rooms
      supabaseAdmin
        .from('accounts')
        .select('id, name')
        .in('id', typedRoomsData.map(room => room.artist_id).filter(Boolean))
    ]);

    // Create maps for quick lookups
    const accountNamesMap = new Map();
    if (accountsResponse.data) {
      for (const account of accountsResponse.data) {
        accountNamesMap.set(account.id, account.name);
      }
    }

    const accountEmailsMap = new Map();
    if (accountEmailsResponse.data) {
      for (const entry of accountEmailsResponse.data) {
        accountEmailsMap.set(entry.account_id, entry.email);
      }
    }
    
    // Create wallet map for miniapp users
    const accountWalletsMap = new Map();
    if (accountWalletsResponse.data) {
      for (const entry of accountWalletsResponse.data) {
        accountWalletsMap.set(entry.account_id, entry.wallet);
      }
    }
    
    // Create artist names map
    const artistNamesMap = new Map();
    if (artistAccountsResponse.data) {
      for (const artist of artistAccountsResponse.data) {
        artistNamesMap.set(artist.id, artist.name);
      }
    }

    // Transform the data
    const result = typedRoomsData.map((room) => {
      const accountId = room.account_id;
      const accountName = accountNamesMap.get(accountId) || accountId.substring(0, 8);
      
      // Check if user has email or wallet (all users now have at least one)
      const email = accountEmailsMap.get(accountId);
      const wallet = accountWalletsMap.get(accountId);
      
      let displayEmail;
      let isWalletUser = false;
      
      if (email) {
        // Regular email user
        displayEmail = email;
      } else if (wallet) {
        // Wallet user - show truncated wallet as "email"
        displayEmail = `${wallet.substring(0, 8)}...${wallet.slice(-4)} (wallet)`;
        isWalletUser = true;
      } else {
        // Account with neither email nor wallet (artist/project record)
        displayEmail = `${accountName} (no contact)`;
      }
      
      const artistId = room.artist_id || 'Unknown Artist';
      const artistName = artistNamesMap.get(artistId) || artistId;
      
      // Get the actual last message date, fallback to room creation date if no messages
      const lastMessageDate = lastMessageDateMap.get(room.id) || room.updated_at;
      
      return {
        room_id: room.id,
        account_id: room.account_id,
        created_at: room.updated_at,
        last_message_date: lastMessageDate,
        account_email: displayEmail,
        account_name: accountName,
        artist_name: artistName,
        artist_reference: artistId !== 'Unknown Artist' ? `REF-${artistId.substring(0, 5)}` : 'REF-UNKNOWN',
        topic: room.topic || null,
        is_test_account: false,
        id: room.id,
        updatedAt: room.updated_at,
        messageCount: messageCountMap.get(room.id) || 0,
        email: displayEmail,
        artist_id: artistId,
        is_wallet_user: isWalletUser,
        room_created_at: room.updated_at  // Explicitly include room creation date
      };
    });

    // Calculate pagination metadata using actual filtered totals
    const actualTotalForPagination = actualFilteredRoomCount;
    console.log(`[API] Using actual filtered room count for pagination: ${actualTotalForPagination}`);
    
    const totalPages = Math.ceil(actualTotalForPagination / limit);
    const hasMore = page < totalPages;

    // Calculate conversation counts by time period for percentage calculations
    const nowTime = new Date();
    const startOfToday = new Date(nowTime.getFullYear(), nowTime.getMonth(), nowTime.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfToday.getDate() - 1);
    const startOfWeek = new Date(nowTime);
    startOfWeek.setDate(nowTime.getDate() - nowTime.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfPrevWeek = new Date(startOfWeek);
    startOfPrevWeek.setDate(startOfWeek.getDate() - 7);
    const startOfMonth = new Date(nowTime.getFullYear(), nowTime.getMonth(), 1);
    const startOfPrevMonth = new Date(nowTime.getFullYear(), nowTime.getMonth() - 1, 1);
    
    const conversationCounts = {
      today: 0,
      yesterday: 0,
      thisWeek: 0,
      lastWeek: 0,
      thisMonth: 0,
      lastMonth: 0
    };
    
    // We need to query the full dataset for accurate counts, not just the current page
    try {
      let todayCount, yesterdayCount, thisWeekCount, lastWeekCount, thisMonthCount, lastMonthCount;
      
      if (excludeTestEmails) {
        console.log('API ROUTE: Calculating active conversation counts excluding test emails');
        
        // Get test emails list for filtering
        const { data: testEmailsData } = await supabaseAdmin
          .from('test_emails')
          .select('email');
        const testEmailsList = testEmailsData?.map(item => item.email) || [];
        
        // Get account IDs to include (email users minus test emails + all wallet users)
        const [emailAccountsResponse, walletAccountsResponse] = await Promise.all([
          supabaseAdmin
            .from('account_emails')
            .select('account_id, email'),
          supabaseAdmin
            .from('account_wallets') 
            .select('account_id, wallet')
        ]);
        
        const allowedAccountIds = new Set();
        
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
        
        // Add wallet users, but ALSO filter out test wallet users
        if (walletAccountsResponse.data) {
          for (const account of walletAccountsResponse.data) {
            // Check if this is a test wallet user (by account ID pattern)
            const isTestWallet = testWalletAccountIds.some(testId => account.account_id.startsWith(testId));
            if (isTestWallet) {
              console.log('API ROUTE: *** SKIPPING test wallet user in conversation counts:', account.account_id.substring(0, 8));
              continue;
            }
            
            allowedAccountIds.add(account.account_id);
          }
        }
        
        const allowedAccountIdsArray = Array.from(allowedAccountIds);
        console.log(`API ROUTE: Filtering active conversation counts to ${allowedAccountIdsArray.length} allowed accounts`);
        
        // Get rooms for allowed accounts first
        const { data: allowedRooms } = await supabaseAdmin
          .from('rooms')
          .select('id, artist_id')
          .in('account_id', allowedAccountIdsArray);
        
        // Also exclude rooms with test artist
        const { data: testArtistAccounts } = await supabaseAdmin
          .from('accounts')
          .select('id')
          .eq('name', 'sweetman_eth');
        
        const testArtistAccountIds = new Set(testArtistAccounts?.map(account => account.id) || []);
        
        // Filter out rooms with test artists
        const allowedRoomIds = allowedRooms?.filter(room => !testArtistAccountIds.has(room.artist_id))?.map(room => room.id) || [];
        console.log(`API ROUTE: Allowed rooms after filtering test artists: ${allowedRoomIds.length}`);
        
        if (allowedRoomIds.length > 0) {
          // Query active conversations (rooms with messages) filtered by allowed room IDs
          const [todayActive, yesterdayActive, thisWeekActive, lastWeekActive, thisMonthActive, lastMonthActive] = await Promise.all([
            // Today - active conversations
            supabaseAdmin
              .from('memories')
              .select('room_id')
              .gte('updated_at', startOfToday.toISOString())
              .in('room_id', allowedRoomIds),
            
            // Yesterday - active conversations
            supabaseAdmin
              .from('memories')
              .select('room_id')
              .gte('updated_at', startOfYesterday.toISOString())
              .lt('updated_at', startOfToday.toISOString())
              .in('room_id', allowedRoomIds),
            
            // This week - active conversations
            supabaseAdmin
              .from('memories')
              .select('room_id')
              .gte('updated_at', startOfWeek.toISOString())
              .in('room_id', allowedRoomIds),
            
            // Last week - active conversations
            supabaseAdmin
              .from('memories')
              .select('room_id')
              .gte('updated_at', startOfPrevWeek.toISOString())
              .lt('updated_at', startOfWeek.toISOString())
              .in('room_id', allowedRoomIds),
            
            // This month - active conversations
            supabaseAdmin
              .from('memories')
              .select('room_id')
              .gte('updated_at', startOfMonth.toISOString())
              .in('room_id', allowedRoomIds),
            
            // Last month - active conversations
            supabaseAdmin
              .from('memories')
              .select('room_id')
              .gte('updated_at', startOfPrevMonth.toISOString())
              .lt('updated_at', startOfMonth.toISOString())
              .in('room_id', allowedRoomIds)
          ]);
          
          // Count unique rooms for each period
          todayCount = { count: new Set(todayActive.data?.map(m => m.room_id) || []).size };
          yesterdayCount = { count: new Set(yesterdayActive.data?.map(m => m.room_id) || []).size };
          thisWeekCount = { count: new Set(thisWeekActive.data?.map(m => m.room_id) || []).size };
          lastWeekCount = { count: new Set(lastWeekActive.data?.map(m => m.room_id) || []).size };
          thisMonthCount = { count: new Set(thisMonthActive.data?.map(m => m.room_id) || []).size };
          lastMonthCount = { count: new Set(lastMonthActive.data?.map(m => m.room_id) || []).size };
        } else {
          // No allowed rooms, set all counts to 0
          todayCount = { count: 0 };
          yesterdayCount = { count: 0 };
          thisWeekCount = { count: 0 };
          lastWeekCount = { count: 0 };
          thisMonthCount = { count: 0 };
          lastMonthCount = { count: 0 };
        }
      } else {
        console.log('API ROUTE: Calculating active conversation counts including all users');
        
        // Original queries without filtering - count active conversations (rooms with messages)
        const [todayActive, yesterdayActive, thisWeekActive, lastWeekActive, thisMonthActive, lastMonthActive] = await Promise.all([
          // Today - active conversations
          supabaseAdmin
            .from('memories')
            .select('room_id')
            .gte('updated_at', startOfToday.toISOString()),
          
          // Yesterday - active conversations
          supabaseAdmin
            .from('memories')
            .select('room_id')
            .gte('updated_at', startOfYesterday.toISOString())
            .lt('updated_at', startOfToday.toISOString()),
          
          // This week - active conversations
          supabaseAdmin
            .from('memories')
            .select('room_id')
            .gte('updated_at', startOfWeek.toISOString()),
          
          // Last week - active conversations
          supabaseAdmin
            .from('memories')
            .select('room_id')
            .gte('updated_at', startOfPrevWeek.toISOString())
            .lt('updated_at', startOfWeek.toISOString()),
          
          // This month - active conversations
          supabaseAdmin
            .from('memories')
            .select('room_id')
            .gte('updated_at', startOfMonth.toISOString()),
          
          // Last month - active conversations
          supabaseAdmin
            .from('memories')
            .select('room_id')
            .gte('updated_at', startOfPrevMonth.toISOString())
            .lt('updated_at', startOfMonth.toISOString())
        ]);
        
        // Count unique rooms for each period
        todayCount = { count: new Set(todayActive.data?.map(m => m.room_id) || []).size };
        yesterdayCount = { count: new Set(yesterdayActive.data?.map(m => m.room_id) || []).size };
        thisWeekCount = { count: new Set(thisWeekActive.data?.map(m => m.room_id) || []).size };
        lastWeekCount = { count: new Set(lastWeekActive.data?.map(m => m.room_id) || []).size };
        thisMonthCount = { count: new Set(thisMonthActive.data?.map(m => m.room_id) || []).size };
        lastMonthCount = { count: new Set(lastMonthActive.data?.map(m => m.room_id) || []).size };
      }
      
      conversationCounts.today = todayCount.count || 0;
      conversationCounts.yesterday = yesterdayCount.count || 0;
      conversationCounts.thisWeek = thisWeekCount.count || 0;
      conversationCounts.lastWeek = lastWeekCount.count || 0;
      conversationCounts.thisMonth = thisMonthCount.count || 0;
      conversationCounts.lastMonth = lastMonthCount.count || 0;
      
      console.log(`API ROUTE: Active conversation counts${excludeTestEmails ? ' (excluding test emails)' : ' (including all users)'} - Today: ${conversationCounts.today}, Week: ${conversationCounts.thisWeek}, Month: ${conversationCounts.thisMonth}`);
    } catch (error) {
      console.error('API ROUTE: Error fetching conversation counts:', error);
    }

    // Search filtering is now handled at the room level before transformation

    console.log('[API] Emails in fetched conversations:', result.map(c => c.account_email));

    if (userFilter && userFilter.trim() !== '') {
      console.log(`[API] Filtering by user: ${userFilter}`);
      const filteredResult = result.filter(
        (conversation) =>
          conversation.account_email?.toLowerCase?.().trim() === userFilter.toLowerCase().trim()
      );
      console.log('[API] Emails after userFilter:', filteredResult.map(c => c.account_email));
      
      const filteredResultData = {
        conversations: filteredResult,
        totalCount: actualTotalForPagination,
        totalUniqueUsers: filteredTotalUniqueUsers,
        currentPage: page,
        totalPages,
        hasMore,
        filtered: true,
        originalCount: result.length,
        conversationCounts
      };

      // Cache the filtered result
      setCachedData(cacheKey, filteredResultData);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      console.log(`⚡ [CONVERSATIONS-API] COMPLETED in ${duration}ms - returning ${filteredResult.length} filtered conversations`);
      
      return NextResponse.json(filteredResultData);
    }

    const resultData = {
      conversations: result,
      totalCount: actualTotalForPagination,
      totalUniqueUsers: filteredTotalUniqueUsers,
      currentPage: page,
      totalPages,
      hasMore,
      filtered: searchFilteredRoomIds !== null || Boolean(userFilter),
      originalCount: filteredTotalRooms,
      conversationCounts
    };

    // Cache the result
    setCachedData(cacheKey, resultData);
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`⚡ [CONVERSATIONS-API] COMPLETED in ${duration}ms - returning ${result.length} conversations (page ${page}/${totalPages})`);
    
    return NextResponse.json(resultData);
  } catch (error) {
    console.error('API ROUTE: Uncaught error processing request:', error);
    return NextResponse.json([createFallbackConversation()]);
  }
}

// Helper function to create a fallback conversation
function createFallbackConversation() {
  const id = `fallback-${Math.random().toString(36).substring(2, 7)}`;
  const timestamp = new Date().toISOString();
  return {
    room_id: id,
    account_id: 'unknown',
    created_at: timestamp,
    last_message_date: timestamp,
    account_email: 'unknown@example.com',
    account_name: 'Unknown User',
    artist_name: 'Unknown Artist',
    artist_reference: 'REF-UNKNOWN',
    topic: null,
    is_test_account: false,
    id,
    updatedAt: timestamp,
    messageCount: 0,
    email: 'unknown@example.com',
    artist_id: 'unknown'
  };
}