import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

interface ScheduledAction {
  id: string;
  account_id: string;
  created_at: string;
  title: string;
  prompt: string;
  enabled: boolean;
}

interface DetailedSegmentAction {
  id: string;
  title: string;
  userEmail: string;
  enabled: boolean;
  created_at: string;
  segmentMatches: string[];
  promptSnippet: string;
  fullPrompt: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const start_date = searchParams.get('start_date');
  const end_date = searchParams.get('end_date');

  const supabase = supabaseAdmin;

  // Default to start of month if not provided
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const start = start_date || defaultStart;
  const end = end_date || now.toISOString();

  try {
    // Get all scheduled actions with their prompts
    const query = supabase
      .from('scheduled_actions')
      .select('id, account_id, created_at, title, prompt, enabled')
      .gte('created_at', start)
      .lte('created_at', end)
      .order('created_at', { ascending: false });

    const { data: scheduledActions, error: actionsError } = await query;

    if (actionsError) {
      return NextResponse.json({ error: actionsError.message }, { status: 500 });
    }

    // Filter actions that contain "segment" or "segments" in the prompt (case insensitive)
    const segmentActions = (scheduledActions || []).filter((action: ScheduledAction) => {
      if (!action.prompt) return false;
      const promptLower = action.prompt.toLowerCase();
      return promptLower.includes('segment') || promptLower.includes('segments');
    });

    // Get all unique account IDs
    const allAccountIds = Array.from(new Set(segmentActions.map((action: ScheduledAction) => action.account_id)));

    // Get account identifiers (emails/wallets) for all users
    const [emailsResponse, walletsResponse] = await Promise.all([
      supabase
        .from('account_emails')
        .select('account_id, email')
        .in('account_id', allAccountIds),
      supabase
        .from('account_wallets')
        .select('account_id, wallet')
        .in('account_id', allAccountIds)
    ]);

    if (emailsResponse.error) {
      return NextResponse.json({ error: emailsResponse.error.message }, { status: 500 });
    }

    const emailsData = emailsResponse.data || [];
    const walletsData = walletsResponse.data || [];

    // Build account to identifier map (prefer email, fallback to wallet)
    const accountToIdentifier = new Map<string, string>();
    emailsData.forEach((row: { account_id: string, email: string }) => {
      if (row.email) {
        accountToIdentifier.set(row.account_id, row.email);
      }
    });
    walletsData.forEach((row: { account_id: string, wallet: string }) => {
      if (row.wallet && !accountToIdentifier.has(row.account_id)) {
        accountToIdentifier.set(row.account_id, row.wallet);
      }
    });

    // Format detailed response with actual prompts
    const detailedSegmentActions: DetailedSegmentAction[] = segmentActions.map((action: ScheduledAction) => {
      const userEmail = accountToIdentifier.get(action.account_id) || action.account_id;
      
      // Find all instances of "segment" or "segments" in the prompt
      const promptLower = action.prompt.toLowerCase();
      const segmentMatches: string[] = [];
      
      // Find "segment" instances
      let index = 0;
      while ((index = promptLower.indexOf('segment', index)) !== -1) {
        const start = Math.max(0, index - 20);
        const end = Math.min(action.prompt.length, index + 30);
        segmentMatches.push(action.prompt.substring(start, end));
        index += 'segment'.length;
      }
      
      return {
        id: action.id,
        title: action.title,
        userEmail,
        enabled: action.enabled,
        created_at: action.created_at,
        segmentMatches,
        promptSnippet: action.prompt.substring(0, 200) + (action.prompt.length > 200 ? '...' : ''),
        fullPrompt: action.prompt
      };
    });

    return NextResponse.json({ 
      totalSegmentActions: segmentActions.length,
      period: { start, end },
      segmentActions: detailedSegmentActions,
      summary: {
        userCounts: Object.entries(
          detailedSegmentActions.reduce((acc: Record<string, number>, action: DetailedSegmentAction) => {
            acc[action.userEmail] = (acc[action.userEmail] || 0) + 1;
            return acc;
          }, {})
        ).map(([email, count]) => ({ email, count }))
      }
    });

  } catch (error) {
    console.error('Error fetching segment actions debug:', error);
    return NextResponse.json({ error: 'Failed to fetch segment actions debug data' }, { status: 500 });
  }
} 