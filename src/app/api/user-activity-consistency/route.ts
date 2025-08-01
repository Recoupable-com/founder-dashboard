import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

function getIntervals(timeFilter: string) {
  const now = new Date();
  let days = 30;
  switch (timeFilter) {
    case 'Last 7 Days': days = 7; break;
    case 'Last 30 Days': days = 30; break;
    case 'Last 3 Months': days = 90; break;
    case 'Last 12 Months': days = 365; break;
    default: days = 30;
  }
  const start = new Date(now);
  start.setDate(now.getDate() - days);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export async function POST(request: Request) {
  const body = await request.json();
  const emails: string[] = body.emails;
      const timeFilter: string = body.timeFilter || 'Last 7 Days';
  
  console.log('[CONSISTENCY] Processing', emails.length, 'emails in parallel, timeFilter:', timeFilter);
  
  if (!emails || !Array.isArray(emails) || emails.length === 0) {
    return NextResponse.json({ error: 'Missing emails' }, { status: 400 });
  }

  const { start, end } = getIntervals(timeFilter);
  const startISO = start.toISOString();
  const endISO = end.toISOString();
  
  console.log('[CONSISTENCY] Date range:', startISO, 'to', endISO);

  // Process all users in parallel for speed
  const processUser = async (email: string): Promise<[string, number]> => {
    try {
      // Get account_id for this email
      const { data: emailData } = await supabaseAdmin
        .from('account_emails')
        .select('account_id')
        .eq('email', email)
        .single();
      
      if (!emailData) {
        console.log('[CONSISTENCY] No account found for:', email);
        return [email, 0];
      }
      
      const accountId = emailData.account_id;
      const userDays = new Set<string>();

      // Get both messages and reports in parallel
      const [roomsData, reportRoomsData] = await Promise.all([
        // Get rooms for messages
        supabaseAdmin
          .from('rooms')
          .select('id')
          .eq('account_id', accountId),
        
        // Get segment report rooms
        supabaseAdmin
          .from('rooms')
          .select('updated_at, topic')
          .eq('account_id', accountId)
          .gte('updated_at', startISO)
          .lte('updated_at', endISO)
      ]);

      const roomIds = (roomsData.data || []).map(r => r.id);

      // Process messages and reports in parallel
      const promises = [];
      
      // Add messages promise if there are rooms
      if (roomIds.length > 0) {
        promises.push(
          supabaseAdmin
            .from('memories')
            .select('updated_at')
            .in('room_id', roomIds)
            .gte('updated_at', startISO)
            .lte('updated_at', endISO)
    
            .then(({ data: msgRows }) => {
              if (msgRows) {
                msgRows.forEach((row: { updated_at: string }) => {
                  const day = row.updated_at.slice(0, 10);
                  userDays.add(day);
                });
              }
              return msgRows?.length || 0;
            })
        );
      } else {
        promises.push(Promise.resolve(0));
      }

      // Process segment reports
      if (reportRoomsData.data) {
        reportRoomsData.data.forEach((row: { updated_at: string, topic: string }) => {
          // Only count rooms with topics starting with "segment:" (case insensitive)
          if (row.topic?.toLowerCase?.().startsWith('segment:')) {
            const day = row.updated_at.slice(0, 10);
            userDays.add(day);
          }
        });
      }

      // Wait for messages to complete
      const [messageCount] = await Promise.all(promises);
      
      console.log('[CONSISTENCY] User', email, ':', userDays.size, 'days active,', messageCount, 'messages,', reportRoomsData.data?.length || 0, 'total rooms');
      return [email, userDays.size];
      
    } catch (error) {
      console.error('[CONSISTENCY] Error processing user', email, ':', error);
      return [email, 0];
    }
  };

  // Process all users in parallel
  const startTime = Date.now();
  const userResults = await Promise.all(emails.map(processUser));
  const endTime = Date.now();
  
  console.log('[CONSISTENCY] Processed', emails.length, 'users in', endTime - startTime, 'ms');

  // Convert results to the expected format
  const results: Record<string, number> = {};
  userResults.forEach(([email, count]) => {
    results[email] = count;
  });

  // Add a catch-all error handler
  try {
    return NextResponse.json(results);
  } catch (err) {
    console.error('Unexpected error in user-activity-consistency:', err);
    return NextResponse.json({ error: (err instanceof Error ? err.message : 'Unknown error') }, { status: 500 });
  }
} 