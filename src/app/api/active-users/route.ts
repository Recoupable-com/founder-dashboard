import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: Request) {
  const startTime = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const timeFilter = searchParams.get('timeFilter') || 'Last 7 Days';
    const excludeTest = searchParams.get('excludeTest') === 'true';
    
    console.log('Active Users API: Calculating active users for period:', timeFilter);
    console.log('Active Users API: Request timestamp:', new Date().toISOString());
    
    // Debug timezone information
    console.log('Active Users API: Timezone debug info:', {
      serverTime: new Date().toString(),
      timezone: 'UTC (forced for production consistency)',
      utcTime: new Date().toISOString(),
      localTime: new Date().toLocaleString(),
      calculationMode: 'Using Date.now() for UTC consistency'
    });
    
    // Calculate date ranges based on time filter (FORCE UTC for consistency with production)
    const getDateRange = (filter: string) => {
      // Create UTC date by using current timestamp and forcing UTC interpretation
      const nowTimestamp = Date.now();
      const nowUTC = new Date(nowTimestamp);
      
      switch (filter) {
        case 'Last 24 Hours':
          const last24Hours = new Date(nowTimestamp - 24 * 60 * 60 * 1000);
          return { start: last24Hours, end: nowUTC };
        case 'Last 7 Days':
          const last7Days = new Date(nowTimestamp - 7 * 24 * 60 * 60 * 1000);
          return { start: last7Days, end: nowUTC };
        case 'Last 30 Days':
          const last30Days = new Date(nowTimestamp - 30 * 24 * 60 * 60 * 1000);
          return { start: last30Days, end: nowUTC };
        case 'Last 3 Months':
          const last3Months = new Date(nowTimestamp - 90 * 24 * 60 * 60 * 1000);
          return { start: last3Months, end: nowUTC };
        case 'Last 12 Months':
          const last12Months = new Date(nowTimestamp - 365 * 24 * 60 * 60 * 1000);
          return { start: last12Months, end: nowUTC };
        default: // All Time or any unrecognized filter
          return { start: null, end: nowUTC };
      }
    };

    // Get current period and comparison periods
    const currentPeriod = getDateRange(timeFilter);
    console.log('Active Users API: Current period (UTC):', {
      start: currentPeriod.start?.toISOString(),
      end: currentPeriod.end.toISOString(),
      startLocal: currentPeriod.start?.toLocaleString(),
      endLocal: currentPeriod.end.toLocaleString()
    });
    
    // Calculate comparison periods
    const previousPeriod: { start: Date | null, end: Date | null } = { start: null, end: null };
    if (currentPeriod.start) {
      const periodLength = currentPeriod.end.getTime() - currentPeriod.start.getTime();
      previousPeriod.end = new Date(currentPeriod.start.getTime() - 1); // End 1ms before current period starts
      previousPeriod.start = new Date(currentPeriod.start.getTime() - periodLength);
    }

    // Get test emails list for filtering (simplified approach like other APIs)
    let testEmailsList: string[] = [];
    if (excludeTest) {
      const { data: testEmailsData } = await supabaseAdmin
        .from('test_emails')
        .select('email');
      testEmailsList = (testEmailsData?.map(item => item.email) || []) as string[];
      console.log('Active Users API: Test emails to exclude:', testEmailsList.length);
    }

    // Helper function to get active users for a time period
    const getActiveUsersForPeriod = async (start: Date | null, end: Date) => {
      const activeUserEmails = new Set<string>();
      console.log('Active Users API: Getting users for period:', {
        start: start?.toISOString(),
        end: end.toISOString()
      });
      
      // Get users who sent messages using the same RPC function as other working APIs
      const { data: messageData } = await supabaseAdmin.rpc('get_message_counts_by_user', {
        start_date: start?.toISOString() || '2020-01-01T00:00:00.000Z',
        end_date: end.toISOString()
      });
      
      console.log('Active Users API: Found messages:', messageData?.length || 0);
      
      if (messageData && Array.isArray(messageData)) {
        messageData.forEach((row: { account_email: string; message_count: number }) => {
          if (row && row.account_email) {
                         // Apply test email filtering
             if (!excludeTest) {
               activeUserEmails.add(row.account_email);
             } else {
               const email = row.account_email;
               // Same filtering logic as other APIs
               if (email && !testEmailsList.includes(email) && !email.includes('@example.com') && !email.includes('+')) {
                 activeUserEmails.add(email);
               }
             }
          }
        });
      }
      console.log('Active Users API: Users from messages:', activeUserEmails.size);
      
      // Get users who created segment reports
      let reportQuery = supabaseAdmin
        .from('segment_reports')
        .select('account_email')
        .lte('updated_at', end.toISOString());
      
      if (start) {
        reportQuery = reportQuery.gte('updated_at', start.toISOString());
      }
      
      const { data: reportData } = await reportQuery;
      console.log('Active Users API: Found segment reports:', reportData?.length || 0);
      
      if (reportData) {
        reportData.forEach(report => {
          if (report.account_email) {
                         // Apply test email filtering
             if (!excludeTest) {
               activeUserEmails.add(report.account_email);
             } else {
               const email = report.account_email;
               if (email && !testEmailsList.includes(email) && !email.includes('@example.com') && !email.includes('+')) {
                 activeUserEmails.add(email);
               }
             }
          }
        });
      }
      
      console.log('Active Users API: Final user count for period:', activeUserEmails.size);
      return activeUserEmails.size;
    };

    // Calculate active users for current and previous periods
    console.log('Active Users API: Calculating current period users...');
    const currentActiveUsers = await getActiveUsersForPeriod(currentPeriod.start, currentPeriod.end);
    
    console.log('Active Users API: Calculating previous period users...');
    const previousActiveUsers = previousPeriod.start && previousPeriod.end ? 
      await getActiveUsersForPeriod(previousPeriod.start, previousPeriod.end) : 0;

    // Calculate percentage change
    let percentChange = 0;
    let changeDirection = 'neutral';
    
    if (previousActiveUsers > 0) {
      percentChange = Math.round(((currentActiveUsers - previousActiveUsers) / previousActiveUsers) * 100);
      changeDirection = currentActiveUsers > previousActiveUsers ? 'up' : currentActiveUsers < previousActiveUsers ? 'down' : 'neutral';
    } else if (currentActiveUsers > 0) {
      changeDirection = 'up';
      percentChange = 100; // If no previous data but current data exists
    }

    const result = {
      activeUsers: currentActiveUsers,
      previousActiveUsers,
      percentChange,
      changeDirection,
      timeFilter,
      excludeTest
    };

    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`⚡ [ACTIVE-USERS-API] COMPLETED in ${duration}ms - Current: ${currentActiveUsers}, Previous: ${previousActiveUsers}`);
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Active Users API: Error:', error);
    return NextResponse.json({ error: 'Failed to fetch active users' }, { status: 500 });
  }
} 