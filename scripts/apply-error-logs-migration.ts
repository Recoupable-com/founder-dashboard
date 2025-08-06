import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { join } from 'path';
import { readFileSync } from 'fs';

// Load environment variables from .env.local
config({ path: join(process.cwd(), '.env.local') });

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyErrorLogsMigration() {
  console.log('Applying error_logs table migration...');

  try {
    // Check if the table already exists
    const { error: checkError } = await supabase
      .from('error_logs')
      .select('count')
      .limit(1);

    if (!checkError) {
      console.log('error_logs table already exists. Skipping migration.');
      return;
    }

    // If table doesn't exist (error 42P01), create it
    if (checkError?.code === '42P01') {
      console.log('Creating error_logs table...');
      
      // Create the table directly with SQL
      const createTableSQL = `
        -- Create error_logs table for tracking Telegram errors
        CREATE TABLE error_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          
          -- Raw data
          raw_message TEXT NOT NULL,
          telegram_message_id BIGINT,
          
          -- Parsed fields (directly from Telegram format)
          user_email TEXT,
          room_id TEXT,
          error_timestamp TIMESTAMPTZ,
          error_message TEXT,
          error_type TEXT,
          tool_name TEXT,
          last_message TEXT,
          stack_trace TEXT,
          
          -- Metadata
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Create indexes for common queries
        CREATE INDEX idx_error_logs_user_email ON error_logs(user_email);
        CREATE INDEX idx_error_logs_room_id ON error_logs(room_id);
        CREATE INDEX idx_error_logs_tool_name ON error_logs(tool_name);
        CREATE INDEX idx_error_logs_error_timestamp ON error_logs(error_timestamp);
        CREATE INDEX idx_error_logs_created_at ON error_logs(created_at);
      `;

      // Try to create tables using RPC (same approach as setup-db.ts)
      const { error: createError } = await supabase.rpc('create_tables', {
        sql: createTableSQL
      });

      if (createError) {
        console.error('Error creating error_logs table:', createError);
        process.exit(1);
      }

      console.log('error_logs table created successfully!');
      
      // Verify the table was created
      const { error: verifyError } = await supabase
        .from('error_logs')
        .select('count')
        .limit(1);

      if (verifyError) {
        console.error('Table creation verification failed:', verifyError);
        throw verifyError;
      }

      console.log('Migration applied and verified successfully!');
    } else {
      console.error('Unexpected error checking table existence:', checkError);
      throw checkError;
    }

  } catch (error) {
    console.error('Error applying migration:', error);
    process.exit(1);
  }
}

applyErrorLogsMigration();