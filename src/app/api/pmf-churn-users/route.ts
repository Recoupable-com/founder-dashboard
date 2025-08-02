import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Interface for churned PMF user details
interface ChurnedPMFUser {
  email: string;
  totalSessions: number;
  roomCount: number;
  activeDays: number;
  reportCount: number;
  lastActivityDate: string;
  lastMessageDate: string | null;
  lastReportDate: string | null;
  reasonForChurn: 'no_recent_activity' | 'insufficient_sessions';
  daysSinceLastActivity: number;
}

/**
 * FIXED: API to identify users who were PMF Survey Ready in the previous period
 * but are NO LONGER PMF Survey Ready in the current period (churned users)
 * Uses the EXACT same logic as the standard PMF API to ensure data consistency
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const excludeTest = searchParams.get('excludeTest') !== 'false'; // Default to true

    console.log('🔍 [PMF-CHURN] Starting PMF churn analysis with filters:', { excludeTest });

    // CRITICAL FIX: Use the standard PMF API to get current PMF users
    const protocol = request.url.includes('localhost') ? 'http' : 'https';
    const host = request.headers.get('host') || 'localhost:3000';
    const baseUrl = `${protocol}://${host}`;
    
    const currentPMFResponse = await fetch(`${baseUrl}/api/pmf-survey-ready-users?excludeTest=${excludeTest}`);
    const currentPMFData = await currentPMFResponse.json();
    const currentPMFUsers = new Set(currentPMFData.users || []);

    console.log(`🔍 [PMF-CHURN] Current PMF users: ${currentPMFUsers.size}`);

    // Calculate previous period PMF users using EXACT same logic as standard PMF API
    const now = new Date();
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const twentyEightDaysAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get test emails if excluding test accounts
    let testEmailsList: string[] = [];
    if (excludeTest) {
      const { data: testEmailsData } = await supabaseAdmin
        .from('test_emails')
        .select('email');
      testEmailsList = testEmailsData?.map(row => row.email) || [];
    }

    // Get all rooms for session counting (same as standard PMF API)
    const { data: roomsData } = await supabaseAdmin
      .from('rooms')
      .select('id, account_id, updated_at');

    if (!roomsData) {
      return NextResponse.json({ churnedUsers: [], summary: { previousPeriodPMF: 0, currentPeriodPMF: 0, churnedUsers: 0, churnRate: 0 } });
    }

    // Get account emails
    const accountIds = [...new Set(roomsData.map(room => room.account_id))];
    const { data: emailsData } = await supabaseAdmin
      .from('account_emails')
      .select('account_id, email')
      .in('account_id', accountIds);

    // Get message history for active days counting
    const { data: messageHistory } = await supabaseAdmin
      .from('memories')
      .select('room_id, updated_at')
      .gte('updated_at', thirtyDaysAgo.toISOString())
      .lte('updated_at', now.toISOString());

    // Map room_id to email for message history
    const roomToEmail = new Map<string, string>();
    roomsData.forEach(room => {
      const email = emailsData?.find(e => e.account_id === room.account_id)?.email;
      if (email) {
        roomToEmail.set(room.id, email);
      }
    });

    // Count active days per user for the previous period (28-14 days ago)
    const prevActiveDaysByUser = new Map<string, Set<string>>();
    const lastMessageByUser = new Map<string, string>();

    (messageHistory || []).forEach(memory => {
      const email = roomToEmail.get(memory.room_id);
      if (email) {
        const memoryDate = new Date(memory.updated_at);
        const day = memory.updated_at.split('T')[0];
        
        // Track all messages for last activity calculation
        if (!lastMessageByUser.has(email) || memory.updated_at > lastMessageByUser.get(email)!) {
          lastMessageByUser.set(email, memory.updated_at);
        }

        // For previous period active days, only count activity in 28-14 day window
        if (memoryDate >= twentyEightDaysAgo && memoryDate < fourteenDaysAgo) {
          if (!prevActiveDaysByUser.has(email)) {
            prevActiveDaysByUser.set(email, new Set());
          }
          prevActiveDaysByUser.get(email)!.add(day);
        }
      }
    });

    // Convert active days to count
    const prevActiveDaysCountByUser = new Map<string, number>();
    prevActiveDaysByUser.forEach((daysSet, email) => {
      prevActiveDaysCountByUser.set(email, daysSet.size);
    });

    // Count rooms per user (all-time usage, same as standard PMF API)
    const roomCountByUser = new Map<string, number>();
    roomsData.forEach(room => {
      const email = emailsData?.find(e => e.account_id === room.account_id)?.email;
      if (email) {
        roomCountByUser.set(email, (roomCountByUser.get(email) || 0) + 1);
      }
    });

    // Get segment reports for previous period
    const { data: prevReports } = await supabaseAdmin
      .from('segment_reports')
      .select('account_email, updated_at')
      .gte('updated_at', twentyEightDaysAgo.toISOString())
      .lt('updated_at', fourteenDaysAgo.toISOString());

    const prevReportCountByUser = new Map<string, number>();
    const lastReportByUser = new Map<string, string>();
    (prevReports || []).forEach(report => {
      if (report.account_email) {
        prevReportCountByUser.set(report.account_email, (prevReportCountByUser.get(report.account_email) || 0) + 1);
        if (!lastReportByUser.has(report.account_email) || report.updated_at > lastReportByUser.get(report.account_email)!) {
          lastReportByUser.set(report.account_email, report.updated_at);
        }
      }
    });

    // Get users who had recent activity in the previous period (for PMF qualification)
    const prevRecentActiveUsers = new Set<string>();
    
    // Users with messages in previous period
    prevActiveDaysByUser.forEach((_, email) => {
      prevRecentActiveUsers.add(email);
    });
    
    // Users with reports in previous period
    prevReportCountByUser.forEach((_, email) => {
      prevRecentActiveUsers.add(email);
    });

    // Calculate previous period PMF users using EXACT same logic as standard PMF API
    const previousPMFUsers = new Set<string>();
    const allUsers = new Set([
      ...roomCountByUser.keys(),
      ...prevActiveDaysCountByUser.keys(),
      ...prevReportCountByUser.keys()
    ]);

    for (const email of allUsers) {
      // Filter out test emails if needed (same as standard PMF API)
      if (excludeTest) {
        if (!email) continue;
        if (testEmailsList.includes(email)) continue;
        if (email.includes('@example.com')) continue;
        if (email.includes('+')) continue;
      }

      // Calculate total usage sessions (EXACT same formula as standard PMF API)
      const roomCount = roomCountByUser.get(email) || 0;
      const activeDays = prevActiveDaysCountByUser.get(email) || 0;
      const reportCount = prevReportCountByUser.get(email) || 0;
      
      // Sessions = max(distinct active days, room count) + report count
      const totalSessions = Math.max(activeDays, roomCount) + reportCount;

      // Check criteria: 2+ sessions AND recent activity (EXACT same as standard PMF API)
      if (totalSessions >= 2 && prevRecentActiveUsers.has(email)) {
        previousPMFUsers.add(email);
      }
    }

    console.log(`🔍 [PMF-CHURN] Previous PMF users: ${previousPMFUsers.size}`);

    // Find churned users: were PMF in previous period but not in current period
    const churnedUsers: ChurnedPMFUser[] = [];

    for (const email of previousPMFUsers) {
      if (!currentPMFUsers.has(email)) {
        // Get user details for churned user
        const roomCount = roomCountByUser.get(email) || 0;
        const activeDays = prevActiveDaysCountByUser.get(email) || 0;
        const reportCount = prevReportCountByUser.get(email) || 0;
        const totalSessions = Math.max(activeDays, roomCount) + reportCount;

        // Determine last activity date
        const lastMessage = lastMessageByUser.get(email);
        const lastReport = lastReportByUser.get(email);
        let lastActivityDate = lastMessage || lastReport;
        
        if (lastMessage && lastReport) {
          lastActivityDate = lastMessage > lastReport ? lastMessage : lastReport;
        }

        // Calculate days since last activity
        const daysSinceLastActivity = lastActivityDate 
          ? Math.floor((now.getTime() - new Date(lastActivityDate).getTime()) / (1000 * 60 * 60 * 24))
          : 999;

        // Determine churn reason
        const reasonForChurn = daysSinceLastActivity > 14 ? 'no_recent_activity' : 'insufficient_sessions';

        churnedUsers.push({
          email,
          totalSessions,
          roomCount,
          activeDays,
          reportCount,
          lastActivityDate: lastActivityDate || 'unknown',
          lastMessageDate: lastMessage || null,
          lastReportDate: lastReport || null,
          reasonForChurn,
          daysSinceLastActivity
        });
      }
    }

    // Sort by days since last activity (most recent first)
    churnedUsers.sort((a, b) => a.daysSinceLastActivity - b.daysSinceLastActivity);

    const churnRate = previousPMFUsers.size > 0 
      ? Math.round((churnedUsers.length / previousPMFUsers.size) * 100) 
      : 0;

    const summary = {
      previousPeriodPMF: previousPMFUsers.size,
      currentPeriodPMF: currentPMFUsers.size,
      churnedUsers: churnedUsers.length,
      churnRate
    };

    console.log(`🔍 [PMF-CHURN] Analysis complete:`, summary);

    return NextResponse.json({
      summary,
      churnedUsers: churnedUsers.slice(0, 50), // Limit to first 50
      periodInfo: {
        currentPeriod: `${fourteenDaysAgo.toISOString().split('T')[0]} to ${now.toISOString().split('T')[0]}`,
        previousPeriod: `${twentyEightDaysAgo.toISOString().split('T')[0]} to ${fourteenDaysAgo.toISOString().split('T')[0]}`,
        excludeTest
      }
    });

  } catch (error) {
    console.error('❌ [PMF-CHURN] Error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze PMF churn data' },
      { status: 500 }
    );
  }
}