import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

function getIntervals(timeFilter: string) {
  const now = new Date();
  const intervals: { start: Date, end: Date, label: string }[] = [];
  let days = 30;
  
  switch (timeFilter) {
    case 'Last 7 Days': days = 7; break;
    case 'Last 30 Days': days = 30; break;
    case 'Last 3 Months': days = 90; break;
    case 'Last 12 Months': days = 365; break;
    default: days = 30;
  }
  
  // Generate daily intervals for the specified number of days
  for (let i = days - 1; i >= 0; i--) {
    const start = new Date(now);
    start.setDate(now.getDate() - i);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    intervals.push({ start, end, label: start.toISOString().split('T')[0] });
  }
  
  return intervals;
}

function getIntervalsFromRange(startIso: string, endIso: string) {
  const intervals: { start: Date, end: Date, label: string }[] = [];
  const start = new Date(startIso);
  const end = new Date(endIso);
  for (let d = new Date(start.setHours(0, 0, 0, 0)); d < end; d.setDate(d.getDate() + 1)) {
    const dayStart = new Date(d);
    const dayEnd = new Date(d);
    dayEnd.setHours(23, 59, 59, 999);
    intervals.push({ start: dayStart, end: dayEnd, label: dayStart.toISOString().split('T')[0] });
  }
  return intervals;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get('email');
      const timeFilter = searchParams.get('timeFilter') || 'Last 7 Days';
  const start_date = searchParams.get('start_date');
  const end_date = searchParams.get('end_date');
  // const excludeTest = searchParams.get('excludeTest') === 'true';

  if (!email) {
    return NextResponse.json({ error: 'Missing email parameter' }, { status: 400 });
  }

  let intervals;
  if (start_date && end_date) {
    intervals = getIntervalsFromRange(start_date, end_date);
  } else {
    intervals = getIntervals(timeFilter);
  }

  // Fetch all message counts for the user in the full range using the RPC
  const fullStart = intervals[0].start.toISOString();
  const fullEnd = intervals[intervals.length - 1].end.toISOString();

  // Get account_id for this email
  const { data: emailData } = await supabaseAdmin
    .from('account_emails')
    .select('account_id')
    .eq('email', email)
    .single();
  if (!emailData) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  const accountId = emailData.account_id;

  // Get all room_ids for this user
  const { data: rooms } = await supabaseAdmin
    .from('rooms')
    .select('id')
    .eq('account_id', accountId);
  const roomIds = (rooms || []).map(r => r.id);

  // Query memories for this user's rooms in the date range
  const { data: msgRows } = await supabaseAdmin
    .from('memories')
    .select('id, updated_at')
    .in('room_id', roomIds.length ? roomIds : ['00000000-0000-0000-0000-000000000000'])
    .gte('updated_at', fullStart)
    .lte('updated_at', fullEnd);

  // Group messages by day
  const messagesByDay: Record<string, number> = {};
  (msgRows || []).forEach((row: { updated_at: string }) => {
    const day = row.updated_at.slice(0, 10);
    messagesByDay[day] = (messagesByDay[day] || 0) + 1;
  });

  // For each interval, get the count for that day
  const trend = intervals.map(interval => {
    const day = interval.label;
    return { date: day, actions: messagesByDay[day] || 0 };
  });

  // Also add segment reports per day for this user
  // Use room-based logic to match leaderboard consistency calculation
  const { data: reportRoomRows } = await supabaseAdmin
    .from('rooms')
    .select('id, updated_at, topic')
    .eq('account_id', accountId)
    .gte('updated_at', fullStart)
    .lte('updated_at', fullEnd);
  const reportsByDay: Record<string, number> = {};
  (reportRoomRows || []).forEach((row: { updated_at: string, topic: string }) => {
    // Only count rooms with topics starting with "segment:" (case insensitive)
    if (row.topic?.toLowerCase?.().startsWith('segment:')) {
      const day = row.updated_at.slice(0, 10);
      reportsByDay[day] = (reportsByDay[day] || 0) + 1;
    }
  });
  // Add reports to trend
  trend.forEach(point => {
    point.actions += reportsByDay[point.date] || 0;
  });

  console.log('[TREND] Actions for', email, 'in period', intervals[0]?.start, '-', intervals[intervals.length-1]?.end, ':', trend);

  return NextResponse.json({ trend });
} 