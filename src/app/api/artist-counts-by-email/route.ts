import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  try {
    console.log('🎨 Artist counts by email API: Starting...');

    // Step 1: Get all artist counts by account_id
    const { data: artistCountsData, error: artistCountsError } = await supabaseAdmin
      .from('account_artist_ids')
      .select('account_id');

    if (artistCountsError) {
      console.error('❌ Error fetching artist counts:', artistCountsError);
      return NextResponse.json({ error: artistCountsError.message }, { status: 500 });
    }

    console.log(`📊 Found ${artistCountsData?.length || 0} artist records`);

    // Step 2: Count artists per account_id
    const artistCountsByAccountId = new Map<string, number>();
    artistCountsData?.forEach(record => {
      const accountId = record.account_id;
      artistCountsByAccountId.set(accountId, (artistCountsByAccountId.get(accountId) || 0) + 1);
    });

    console.log(`👥 Found ${artistCountsByAccountId.size} unique accounts with artists`);

    // Step 3: Get email mappings for these accounts
    const accountIds = Array.from(artistCountsByAccountId.keys());
    const { data: emailMappingsData, error: emailMappingsError } = await supabaseAdmin
      .from('account_emails')
      .select('account_id, email')
      .in('account_id', accountIds);

    if (emailMappingsError) {
      console.error('❌ Error fetching email mappings:', emailMappingsError);
      return NextResponse.json({ error: emailMappingsError.message }, { status: 500 });
    }

    console.log(`📧 Found ${emailMappingsData?.length || 0} email mappings`);

    // Step 4: Create mapping of email to artist count
    const artistCountsByEmail: Record<string, number> = {};
    emailMappingsData?.forEach(mapping => {
      const artistCount = artistCountsByAccountId.get(mapping.account_id) || 0;
      artistCountsByEmail[mapping.email] = artistCount;
    });

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

    return NextResponse.json({
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
    });

  } catch (error) {
    console.error('❌ Exception in artist-counts-by-email API:', error);
    return NextResponse.json(
      { error: 'Failed to fetch artist counts by email' }, 
      { status: 500 }
    );
  }
} 