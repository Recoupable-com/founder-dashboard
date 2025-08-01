import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(request: Request) {
  const startTime = Date.now();
  console.log('🔄 [SEGMENT-ACTIONS-API] Starting segment actions fetch');
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
    // Get scheduled actions with segment-related prompts
    const query = supabase
      .from('scheduled_actions')
      .select('account_id, created_at, prompt')
      .gte('created_at', start)
      .lte('created_at', end);

    const { data: scheduledActions, error: actionsError } = await query;

    if (actionsError) {
      return NextResponse.json({ error: actionsError.message }, { status: 500 });
    }

    // Filter actions that contain "segment" or "segments" in the prompt (case insensitive)
    const segmentActions = (scheduledActions || []).filter((action: { prompt: string }) => {
      if (!action.prompt) return false;
      const promptLower = action.prompt.toLowerCase();
      return promptLower.includes('segment') || promptLower.includes('segments');
    });

    // Get all unique account IDs
    const allAccountIds = Array.from(new Set(segmentActions.map((action: { account_id: string }) => action.account_id)));

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

    // Count segment actions by user
    const segmentActionsByUser: Record<string, number> = {};
    for (const action of segmentActions) {
      const identifier = accountToIdentifier.get(action.account_id);
      if (identifier) {
        segmentActionsByUser[identifier] = (segmentActionsByUser[identifier] || 0) + 1;
      }
    }

    // Format response to match expected structure
    const segmentActionsList = Object.entries(segmentActionsByUser).map(([email, segment_action_count]) => ({ 
      email, 
      segment_action_count 
    }));

    const endTime = Date.now();
    console.log(`⚡ [SEGMENT-ACTIONS-API] COMPLETED in ${endTime - startTime}ms`);
    
    return NextResponse.json({ 
      segmentActions: segmentActionsList,
      totalSegmentActions: segmentActions.length,
      period: { start, end }
    });

  } catch (error) {
    console.error('Error fetching segment actions:', error);
    return NextResponse.json({ error: 'Failed to fetch segment actions' }, { status: 500 });
  }
} 