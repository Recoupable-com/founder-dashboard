import { NextResponse } from 'next/server';

/**
 * Data verification API - compares PMF churn data with standard PMF data
 * This helps validate data consistency between APIs
 */
export async function GET() {
  try {
    console.log('🔍 [VERIFY-PMF-DATA] Starting data verification');

    // 1. Get current PMF users from standard API
    const pmfResponse = await fetch('http://localhost:3000/api/pmf-survey-ready-users?excludeTest=true');
    const pmfData = await pmfResponse.json();
    const currentPMFUsers = new Set(pmfData.users || []);

    // 2. Get churn data from PMF churn API
    const churnResponse = await fetch('http://localhost:3000/api/pmf-churn-users?excludeTest=true');
    const churnData = await churnResponse.json();
    const churnedUsers = new Set(
      churnData.churnedUsers?.map((u: { email: string }) => u.email) || []
    );

    // 3. Get leaderboard data for cross-validation
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const leaderboardResponse = await fetch(
      `http://localhost:3000/api/conversations/leaderboard?start_date=${sevenDaysAgo.toISOString()}&end_date=${now.toISOString()}`
    );
    const leaderboardData = await leaderboardResponse.json();
    const activeUsersLeaderboard = new Set(
      leaderboardData.leaderboard?.map((u: { email: string }) => u.email) || []
    );

    // 4. Find inconsistencies
    const inconsistencies = [];

    // Check for users marked as churned but showing as currently PMF-ready
    for (const email of churnedUsers) {
      if (currentPMFUsers.has(email)) {
        inconsistencies.push({
          email,
          issue: 'marked_as_churned_but_currently_pmf_ready',
          description: 'User appears in PMF churn list but is currently PMF-ready'
        });
      }
    }

    // Check for users marked as churned but showing activity in leaderboard
    for (const email of churnedUsers) {
      if (activeUsersLeaderboard.has(email)) {
        inconsistencies.push({
          email,
          issue: 'marked_as_churned_but_active_in_leaderboard',
          description: 'User appears in PMF churn list but shows recent activity in leaderboard'
        });
      }
    }

    // 5. Generate summary statistics
    const summary = {
      current_pmf_users: currentPMFUsers.size,
      churned_users: churnedUsers.size,
      active_users_leaderboard: activeUsersLeaderboard.size,
      inconsistencies_found: inconsistencies.length,
      data_integrity_score: Math.round((1 - (inconsistencies.length / Math.max(churnedUsers.size, 1))) * 100)
    };

    return NextResponse.json({
      summary,
      inconsistencies,
      validation: {
        timestamp: now.toISOString(),
        apis_checked: ['pmf-survey-ready-users', 'pmf-churn-users', 'conversations/leaderboard'],
        validation_rules: [
          'churned_users_should_not_be_currently_pmf_ready',
          'churned_users_should_not_show_recent_activity'
        ]
      },
      raw_counts: {
        current_pmf_users: Array.from(currentPMFUsers).slice(0, 5),
        churned_users: Array.from(churnedUsers).slice(0, 5),
        active_users_sample: Array.from(activeUsersLeaderboard).slice(0, 5)
      }
    });

  } catch (error) {
    console.error('❌ [VERIFY-PMF-DATA] Error:', error);
    return NextResponse.json(
      { error: 'Failed to verify PMF data' },
      { status: 500 }
    );
  }
}