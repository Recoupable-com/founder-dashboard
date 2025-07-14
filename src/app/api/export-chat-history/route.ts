import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

interface ExportMessage {
  id: string;
  content: string;
  role: string;
  timestamp: string;
  reasoning?: string;
}

interface ExportRoom {
  room_id: string;
  topic: string;
  artist_name: string;
  artist_id: string;
  room_created_at: string;
  room_updated_at: string;
  message_count: number;
  messages: ExportMessage[];
}

interface ExportData {
  user_email: string;
  account_id: string;
  account_name: string;
  export_timestamp: string;
  total_conversations: number;
  total_messages: number;
  export_date_range: {
    earliest_message: string | null;
    latest_message: string | null;
  };
  conversations: ExportRoom[];
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userEmail = searchParams.get('email');
    
    if (!userEmail) {
      return NextResponse.json({ error: 'Email parameter is required' }, { status: 400 });
    }

    console.log(`[EXPORT] Starting chat history export for user: ${userEmail}`);

    // Step 1: Get account ID from email
    const { data: emailData, error: emailError } = await supabaseAdmin
      .from('account_emails')
      .select('account_id')
      .eq('email', userEmail)
      .single();

    if (emailError || !emailData) {
      console.error('[EXPORT] Error fetching account for email:', emailError);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const accountId = emailData.account_id;
    console.log(`[EXPORT] Found account ID: ${accountId}`);

    // Step 2: Get account name
    const { data: accountData } = await supabaseAdmin
      .from('accounts')
      .select('name')
      .eq('id', accountId)
      .single();

    const accountName = accountData?.name || accountId.substring(0, 8);

    // Step 3: Get all rooms for this user
    const { data: roomsData, error: roomsError } = await supabaseAdmin
      .from('rooms')
      .select('id, artist_id, topic, updated_at')
      .eq('account_id', accountId)
      .order('updated_at', { ascending: true });

    if (roomsError) {
      console.error('[EXPORT] Error fetching rooms:', roomsError);
      return NextResponse.json({ error: 'Failed to fetch user conversations' }, { status: 500 });
    }

    if (!roomsData || roomsData.length === 0) {
      console.log(`[EXPORT] No conversations found for user: ${userEmail}`);
      return NextResponse.json({
        user_email: userEmail,
        account_id: accountId,
        account_name: accountName,
        export_timestamp: new Date().toISOString(),
        total_conversations: 0,
        total_messages: 0,
        export_date_range: {
          earliest_message: null,
          latest_message: null
        },
        conversations: []
      });
    }

    console.log(`[EXPORT] Found ${roomsData.length} conversations for user`);

    // Step 4: Get artist names for all rooms
    const artistIds = [...new Set(roomsData.map(room => room.artist_id).filter(Boolean))];
    const { data: artistsData } = await supabaseAdmin
      .from('accounts')
      .select('id, name')
      .in('id', artistIds);

    const artistNamesMap = new Map();
    if (artistsData) {
      for (const artist of artistsData) {
        artistNamesMap.set(artist.id, artist.name);
      }
    }

    // Step 5: Get all messages for all rooms
    const roomIds = roomsData.map(room => room.id);
    console.log(`[EXPORT] Querying memories for ${roomIds.length} rooms`);
    
    // Test with a smaller batch first
    const testRoomIds = roomIds.slice(0, 5); // Only test with first 5 rooms
    console.log(`[EXPORT] Testing with room IDs:`, testRoomIds);
    
    const { data: messagesData, error: messagesError } = await supabaseAdmin
      .from('memories')
      .select('id, room_id, content, updated_at')
      .in('room_id', testRoomIds)
      .order('updated_at', { ascending: true });

    if (messagesError) {
      console.error('[EXPORT] Error fetching messages:', messagesError);
      return NextResponse.json({ 
        error: 'Failed to fetch messages', 
        details: messagesError.message,
        code: messagesError.code,
        roomIds: roomIds.slice(0, 3) // Show first 3 room IDs for debugging
      }, { status: 500 });
    }

    console.log(`[EXPORT] Found ${messagesData?.length || 0} messages total`);

    // Step 6: Process and format messages
    const messagesMap = new Map<string, ExportMessage[]>();
    let earliestMessage: string | null = null;
    let latestMessage: string | null = null;

    if (messagesData) {
      for (const msg of messagesData) {
        if (!messagesMap.has(msg.room_id)) {
          messagesMap.set(msg.room_id, []);
        }

        // Extract content and reasoning from JSONB field
        let messageContent = 'Empty message';
        let messageRole = 'assistant'; // default role
        let reasoningText = '';

        if (msg.content) {
          if (typeof msg.content === 'string') {
            messageContent = msg.content;
          } else if (typeof msg.content === 'object') {
            // Handle complex JSONB structure
            if (msg.content.role && typeof msg.content.role === 'string') {
              messageRole = msg.content.role;
            }
            
            if (msg.content.reasoning && typeof msg.content.reasoning === 'string') {
              reasoningText = msg.content.reasoning;
            }
            
            if (typeof msg.content.content === 'string') {
              messageContent = msg.content.content;
            } else if (msg.content.parts && Array.isArray(msg.content.parts)) {
              const textParts = msg.content.parts
                .filter((part: unknown) => typeof part === 'object' && part !== null && (part as { type?: string }).type === 'text')
                .map((part: unknown) => {
                  const typedPart = part as { text?: string; content?: string };
                  return typedPart.text || typedPart.content || '';
                })
                .filter((text: string) => text !== '');
              
              if (textParts.length > 0) {
                messageContent = textParts.join('\n\n');
              }
            } else if (Object.keys(msg.content).length > 0) {
              messageContent = JSON.stringify(msg.content);
            }
          }
        }

        const exportMessage: ExportMessage = {
          id: msg.id,
          content: messageContent,
          role: messageRole,
          timestamp: msg.updated_at
        };

        if (reasoningText) {
          exportMessage.reasoning = reasoningText;
        }

        messagesMap.get(msg.room_id)!.push(exportMessage);

        // Track earliest and latest message times
        if (!earliestMessage || msg.updated_at < earliestMessage) {
          earliestMessage = msg.updated_at;
        }
        if (!latestMessage || msg.updated_at > latestMessage) {
          latestMessage = msg.updated_at;
        }
      }
    }

    // Step 7: Build conversation data
    const conversations: ExportRoom[] = roomsData.map(room => {
      const messages = messagesMap.get(room.id) || [];
      const artistName = artistNamesMap.get(room.artist_id) || room.artist_id || 'Unknown Artist';
      
      return {
        room_id: room.id,
        topic: room.topic || 'New Conversation',
        artist_name: artistName,
        artist_id: room.artist_id || 'Unknown',
        room_created_at: room.updated_at,
        room_updated_at: room.updated_at,
        message_count: messages.length,
        messages: messages
      };
    });

    // Step 8: Create export data structure
    const exportData: ExportData = {
      user_email: userEmail,
      account_id: accountId,
      account_name: accountName,
      export_timestamp: new Date().toISOString(),
      total_conversations: conversations.length,
      total_messages: messagesData?.length || 0,
      export_date_range: {
        earliest_message: earliestMessage,
        latest_message: latestMessage
      },
      conversations: conversations
    };

    console.log(`[EXPORT] Export complete - ${exportData.total_conversations} conversations, ${exportData.total_messages} messages`);

    return NextResponse.json(exportData, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="chat-history-${userEmail}-${new Date().toISOString().split('T')[0]}.json"`
      }
    });

  } catch (error) {
    console.error('[EXPORT] Error processing chat history export:', error);
    return NextResponse.json({ 
      error: 'Failed to export chat history', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 