import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// In-memory cache for PMF survey ready chart data (cache for 2 minutes)
const pmfSurveyReadyChartCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

// Get cached data if still valid
function getCachedData(cacheKey: string) {
  const cached = pmfSurveyReadyChartCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  return null;
}

// Set cached data
function setCachedData(cacheKey: string, data: any) {
  pmfSurveyReadyChartCache.set(cacheKey, { data, timestamp: Date.now() });
  
  // Clean up old cache entries (simple cleanup)
  if (pmfSurveyReadyChartCache.size > 50) {
    const oldestKey = pmfSurveyReadyChartCache.keys().next().value;
    if (oldestKey) {
      pmfSurveyReadyChartCache.delete(oldestKey);
    }
  }
}

export async function GET(request: Request) {
  const startTime = Date.now();
  console.log('🔄 [PMF-SURVEY-READY-CHART-API] Starting PMF survey ready chart fetch');
  
  try {
    const { searchParams } = new URL(request.url);
    const timeFilter = searchParams.get('timeFilter') || 'Last 30 Days';
    const excludeTest = searchParams.get('excludeTest') === 'true';
    
    // Calculate date ranges and granularity based on time filter
    const nowTime = new Date();
    
    // Create cache key (round time to nearest hour for consistency)
    const cacheEnd = new Date(nowTime);
    cacheEnd.setMinutes(0, 0, 0);
    const cacheKey = `pmf-survey-ready-chart-${timeFilter}-${excludeTest}-${cacheEnd.toISOString()}`;
    console.log(`🔍 [PMF-SURVEY-READY-CHART-API] Cache key: ${cacheKey}`);
    
    // Check cache first
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
      const endTime = Date.now();
      console.log(`⚡ [PMF-SURVEY-READY-CHART-API] COMPLETED (CACHED) in ${endTime - startTime}ms`);
      return NextResponse.json(cachedData);
    }
    
    console.log(`🔍 [PMF-SURVEY-READY-CHART-API] Cache miss, fetching from database`);
    
    console.log('PMF Survey Ready Chart API: Generating chart data for period:', timeFilter);
    const intervals: { start: Date, end: Date, label: string }[] = [];
    
    switch (timeFilter) {
      case 'Last 24 Hours':
        // Hourly intervals for last 24 hours
        for (let i = 23; i >= 0; i--) {
          const end = new Date(nowTime.getTime() - i * 60 * 60 * 1000);
          const start = new Date(end.getTime() - 60 * 60 * 1000);
          intervals.push({
            start,
            end,
            label: end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
          });
        }
        break;
        
      case 'Last 7 Days':
        // Daily intervals for last 7 days
        for (let i = 6; i >= 0; i--) {
          const start = new Date(nowTime);
          start.setDate(nowTime.getDate() - i);
          start.setHours(0, 0, 0, 0);
          const end = new Date(start);
          end.setHours(23, 59, 59, 999);
          intervals.push({
            start,
            end,
            label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          });
        }
        break;
        
      case 'Last 30 Days':
        // Daily intervals for last 30 days
        for (let i = 29; i >= 0; i--) {
          const start = new Date(nowTime);
          start.setDate(nowTime.getDate() - i);
          start.setHours(0, 0, 0, 0);
          const end = new Date(start);
          end.setHours(23, 59, 59, 999);
          intervals.push({
            start,
            end,
            label: start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          });
        }
        break;
        
      case 'Last 3 Months':
        // Weekly intervals for last 3 months
        for (let i = 12; i >= 0; i--) {
          const end = new Date(nowTime);
          end.setDate(nowTime.getDate() - i * 7);
          const start = new Date(end);
          start.setDate(end.getDate() - 6);
          start.setHours(0, 0, 0, 0);
          end.setHours(23, 59, 59, 999);
          intervals.push({
            start,
            end,
            label: `Week of ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
          });
        }
        break;
        
      case 'Last 12 Months':
        // Monthly intervals for last 12 months
        for (let i = 11; i >= 0; i--) {
          const start = new Date(nowTime.getFullYear(), nowTime.getMonth() - i, 1);
          const end = new Date(nowTime.getFullYear(), nowTime.getMonth() - i + 1, 0, 23, 59, 59, 999);
          intervals.push({
            start,
            end,
            label: start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
          });
        }
        break;
        
      default:
        // Default to last 30 days
        for (let i = 29; i >= 0; i--) {
          const start = new Date(nowTime);
          start.setDate(nowTime.getDate() - i);
          start.setHours(0, 0, 0, 0);
          const end = new Date(start);
          end.setHours(23, 59, 59, 999);
          intervals.push({
            start,
            end,
            label: start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          });
        }
    }

    // Get test emails if excluding test accounts
    let testEmailsList: string[] = [];
    if (excludeTest) {
      const { data: testEmailsData } = await supabaseAdmin
        .from('test_emails')
        .select('email');
      testEmailsList = testEmailsData?.map(row => row.email) || [];
    }

    // Calculate PMF Survey Ready users for each interval using the same logic as the card
    const data = await Promise.all(intervals.map(async (interval) => {
      // For each interval, use the same 14-day window logic as the card API
      const intervalEnd = interval.end;
      const fourteenDaysBeforeInterval = new Date(intervalEnd.getTime() - 14 * 24 * 60 * 60 * 1000);
      const thirtyDaysBeforeInterval = new Date(intervalEnd.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Get all rooms by user up to this interval
      const { data: roomsData } = await supabaseAdmin
        .from('rooms')
        .select('id, account_id, updated_at')
        .lte('updated_at', intervalEnd.toISOString());

      if (!roomsData) {
        return {
          label: interval.label,
          value: 0,
          date: interval.start.toISOString()
        };
      }

      // Get account emails
      const accountIds = [...new Set(roomsData.map(room => room.account_id))];
      const { data: emailsData } = await supabaseAdmin
        .from('account_emails')
        .select('account_id, email')
        .in('account_id', accountIds);

      // Count rooms per user
      const roomCountByUser = new Map<string, number>();
      roomsData.forEach(room => {
        const email = emailsData?.find(e => e.account_id === room.account_id)?.email;
        if (email) {
          roomCountByUser.set(email, (roomCountByUser.get(email) || 0) + 1);
        }
      });

      // Get users with recent activity (14 days before this interval)
      const { data: recentMessages } = await supabaseAdmin.rpc('get_message_counts_by_user', { 
        start_date: fourteenDaysBeforeInterval.toISOString(), 
        end_date: intervalEnd.toISOString() 
      });

      const recentMessageUsers = new Set((recentMessages || []).map((row: { account_email: string }) => row.account_email));

      // Get users with recent segment reports
      const { data: recentReports } = await supabaseAdmin
        .from('segment_reports')
        .select('account_email')
        .gte('updated_at', fourteenDaysBeforeInterval.toISOString())
        .lte('updated_at', intervalEnd.toISOString());

      const recentReportUsers = new Set((recentReports || []).map(report => report.account_email));

      // Combine recent activity users
      const recentActiveUsers = new Set([...recentMessageUsers, ...recentReportUsers]);

      // Get distinct active days per user (30 days before this interval)
      const { data: messageHistory } = await supabaseAdmin
        .from('memories')
        .select('room_id, updated_at')
        .gte('updated_at', thirtyDaysBeforeInterval.toISOString())
        .lte('updated_at', intervalEnd.toISOString());

      // Map room_id to email for message history
      const roomToEmailMap = new Map<string, string>();
      roomsData.forEach(room => {
        const email = emailsData?.find(e => e.account_id === room.account_id)?.email;
        if (email) {
          roomToEmailMap.set(room.id, email);
        }
      });

      // Count distinct active days per user
      const activeDaysByUser = new Map<string, Set<string>>();
      (messageHistory || []).forEach(message => {
        const email = roomToEmailMap.get(message.room_id);
        if (email) {
          const messageDate = new Date(message.updated_at).toDateString();
          
          if (!activeDaysByUser.has(email)) {
            activeDaysByUser.set(email, new Set<string>());
          }
          activeDaysByUser.get(email)!.add(messageDate);
        }
      });

      // Convert sets to counts
      const activeDaysCountByUser = new Map<string, number>();
      activeDaysByUser.forEach((daysSet, email) => {
        activeDaysCountByUser.set(email, daysSet.size);
      });

      // Get segment reports per user up to this interval
      const { data: allTimeReports } = await supabaseAdmin
        .from('segment_reports')
        .select('account_email')
        .gte('updated_at', thirtyDaysBeforeInterval.toISOString())
        .lte('updated_at', intervalEnd.toISOString());

      const reportCountByUser = new Map<string, number>();
      (allTimeReports || []).forEach(report => {
        if (report.account_email) {
          reportCountByUser.set(report.account_email, (reportCountByUser.get(report.account_email) || 0) + 1);
        }
      });

      // Count PMF Survey Ready users using the same logic as the card
      let pmfSurveyReady = 0;
      const pmfSurveyReadyUsers: string[] = [];
      
      // Get all unique users
      const allUsers = new Set([
        ...roomCountByUser.keys(),
        ...activeDaysCountByUser.keys(),
        ...reportCountByUser.keys()
      ]);

      for (const email of allUsers) {
        // Filter out test emails if needed
        if (excludeTest) {
          if (!email) continue;
          if (testEmailsList.includes(email)) continue;
          if (email.includes('@example.com')) continue;
          if (email.includes('+')) continue;
        }

        // Calculate total usage sessions using the same formula as the card
        const roomCount = roomCountByUser.get(email) || 0;
        const activeDays = activeDaysCountByUser.get(email) || 0;
        const reportCount = reportCountByUser.get(email) || 0;
        
        // Sessions = max(distinct active days, room count) + report count
        const totalSessions = Math.max(activeDays, roomCount) + reportCount;

        // Check criteria: 2+ sessions AND recent activity (same as card)
        if (totalSessions >= 2 && recentActiveUsers.has(email)) {
          pmfSurveyReady++;
          pmfSurveyReadyUsers.push(email);
        }
      }

      return {
        label: interval.label,
        value: pmfSurveyReady,
        date: interval.start.toISOString(),
        users: pmfSurveyReadyUsers
      };
    }));

    const result = {
      labels: data.map(d => d.label),
      data: data.map(d => d.value),
      users: data.map(d => d.users),
      timeFilter,
      excludeTest
    };

    console.log('PMF Survey Ready Chart API: Generated', data.length, 'data points');
    
    // Cache the result
    setCachedData(cacheKey, result);
    
    const endTime = Date.now();
    console.log(`⚡ [PMF-SURVEY-READY-CHART-API] COMPLETED in ${endTime - startTime}ms`);
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('PMF Survey Ready Chart API: Error:', error);
    return NextResponse.json({ error: 'Failed to fetch PMF Survey Ready chart data' }, { status: 500 });
  }
} 