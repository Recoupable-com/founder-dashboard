import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    console.log('🔍 Fetching YouTube connections by user...');
    
    // Step 1: Get all YouTube tokens
    const { data: tokensData, error: tokensError } = await supabaseAdmin
      .from('youtube_tokens')
      .select('id, artist_account_id, expires_at, created_at, updated_at');

    if (tokensError) {
      console.error('❌ Error fetching YouTube tokens:', tokensError);
      return NextResponse.json({ error: tokensError.message }, { status: 500 });
    }

    console.log(`✅ Found ${tokensData?.length || 0} YouTube tokens`);

    if (!tokensData || tokensData.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          userConnections: [],
          connectionCounts: {},
          summary: {
            totalConnections: 0,
            activeConnections: 0,
            totalUsers: 0,
            expiredConnections: 0
          }
        }
      });
    }

    // Step 2: Map artist IDs to account IDs (youtube_tokens.artist_account_id are actually artist IDs!)
    const artistIds = [...new Set(tokensData.map(token => token.artist_account_id))];
    console.log(`🎭 Found ${artistIds.length} unique artist IDs in YouTube tokens`);
    
    const { data: artistAccountData, error: artistAccountError } = await supabaseAdmin
      .from('account_artist_ids')
      .select('account_id, artist_id')
      .in('artist_id', artistIds);

    if (artistAccountError) {
      console.error('❌ Error fetching artist-account mappings:', artistAccountError);
      return NextResponse.json({ error: artistAccountError.message }, { status: 500 });
    }

    console.log(`✅ Found ${artistAccountData?.length || 0} artist-account mappings`);

    // Step 3: Get account emails for the mapped account IDs
    const accountIds = [...new Set((artistAccountData || []).map(mapping => mapping.account_id))];
    const { data: emailsData, error: emailsError } = await supabaseAdmin
      .from('account_emails')
      .select('account_id, email')
      .in('account_id', accountIds);

    if (emailsError) {
      console.error('❌ Error fetching account emails:', emailsError);
      return NextResponse.json({ error: emailsError.message }, { status: 500 });
    }

    console.log(`✅ Found ${emailsData?.length || 0} account emails`);

    // Step 4: Create artist ID to email mapping (via account ID)
    const artistIdToAccountId = new Map<string, string>();
    artistAccountData?.forEach(mapping => {
      artistIdToAccountId.set(mapping.artist_id, mapping.account_id);
    });

    const accountIdToEmail = new Map<string, string>();
    emailsData?.forEach(emailRecord => {
      accountIdToEmail.set(emailRecord.account_id, emailRecord.email);
    });

    const artistIdToEmail = new Map<string, string>();
    artistAccountData?.forEach(mapping => {
      const email = accountIdToEmail.get(mapping.account_id);
      if (email) {
        artistIdToEmail.set(mapping.artist_id, email);
      }
    });



    // Step 5: Count connections per user and include connection details
    const userConnectionsMap = new Map<string, {
      email: string;
      connectionCount: number;
      connections: Array<{
        id: string;
        expires_at: string;
        created_at: string;
        updated_at: string;
        isExpired: boolean;
        artistId: string;
      }>;
    }>();

    tokensData.forEach(token => {
      const email = artistIdToEmail.get(token.artist_account_id);
      if (!email) {
        console.log(`⚠️ No email mapping found for artist ID: ${token.artist_account_id}`);
        return; // Skip if we can't find the email
      }
      
      if (!userConnectionsMap.has(email)) {
        userConnectionsMap.set(email, {
          email,
          connectionCount: 0,
          connections: []
        });
      }

      const userData = userConnectionsMap.get(email)!;
      userData.connectionCount++;
      
      // Check if token is expired
      const isExpired = token.expires_at ? new Date(token.expires_at) < new Date() : false;
      
      userData.connections.push({
        id: token.id,
        expires_at: token.expires_at,
        created_at: token.created_at,
        updated_at: token.updated_at,
        isExpired,
        artistId: token.artist_account_id
      });
    });

    // Convert map to array and sort by connection count
    const userConnections = Array.from(userConnectionsMap.values())
      .sort((a, b) => b.connectionCount - a.connectionCount);

    // Also provide a simple count mapping for the leaderboard
    const connectionCounts: Record<string, number> = {};
    userConnections.forEach(user => {
      connectionCounts[user.email] = user.connectionCount;
    });

    const totalConnections = userConnections.reduce((sum, user) => sum + user.connectionCount, 0);
    const totalUsers = userConnections.length;
    const activeConnections = userConnections.reduce((sum, user) => 
      sum + user.connections.filter(conn => !conn.isExpired).length, 0
    );

    console.log(`📊 YouTube connections summary:`);
    console.log(`   Total tokens in DB: ${tokensData.length}`);
    console.log(`   Unique artist IDs: ${artistIds.length}`);
    console.log(`   Mapped to accounts: ${artistAccountData?.length || 0}`);
    console.log(`   Mapped to emails: ${Object.keys(connectionCounts).length}`);
    console.log(`   Total connections: ${totalConnections}`);
    console.log(`   Active connections: ${activeConnections}`);
    console.log(`   Users with connections: ${totalUsers}`);

    return NextResponse.json({
      success: true,
      data: {
        userConnections,
        connectionCounts,
        summary: {
          totalConnections,
          activeConnections,
          totalUsers,
          expiredConnections: totalConnections - activeConnections
        }
      }
    });

  } catch (error) {
    console.error('❌ Unexpected error fetching YouTube connections:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch YouTube connections',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 