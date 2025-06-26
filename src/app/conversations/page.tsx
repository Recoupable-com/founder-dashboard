'use client';

import React, { useState, useEffect } from 'react';
import 'chartjs-adapter-date-fns'; // Import the date adapter for side effects
import { conversationService } from '@/lib/conversationService';
import type { ConversationFilters, ConversationListItem, ConversationDetail } from '@/lib/conversationService';

import { createClient } from '@supabase/supabase-js';



import annotationPlugin from 'chartjs-plugin-annotation';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  TimeScale,
  TimeSeriesScale
} from 'chart.js';
ChartJS.register(
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  Title, 
  ChartTooltip, 
  Legend, 
  annotationPlugin,
  TimeScale,
  TimeSeriesScale
);

import { getDateRangeForFilter, getProfileCompleteness } from '@/lib/utils';


import Modal from '@/components/Modal';

import ConversationList from '@/components/ConversationList';
import ConversationDetailComponent from '@/components/ConversationDetail';
import SearchAndFilters from '@/components/SearchAndFilters';
import AdvancedConversationFilters from '@/components/ConversationFilters';
import ActiveUsersChart from '@/components/ActiveUsersChart';
import UserFilter from '@/components/UserFilter';
import MetricsSection, { MetricType } from '@/components/MetricsSection';

export default function ConversationsPage() {
  // Helper function to detect if an identifier is a wallet address
  const isWalletAddress = (identifier: string): boolean => {
    // Ethereum addresses are 42 characters and start with 0x
    // Bitcoin addresses are typically 26-35 characters
    // This is a simple detection - you can make it more sophisticated
    return /^0x[a-fA-F0-9]{40}$/.test(identifier) || 
           /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(identifier) ||
           /^bc1[a-z0-9]{39,59}$/.test(identifier);
  };

  // Helper function to format wallet address for display
  const formatWalletAddress = (wallet: string): string => {
    if (wallet.length > 10) {
      return `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
    }
    return wallet;
  };

  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [excludeTestEmails, setExcludeTestEmails] = useState(true);
  const [timeFilter, setTimeFilter] = useState('Last 7 Days');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [totalUniqueUsers, setTotalUniqueUsers] = useState(0);
  const [pageSize] = useState(100); // Fixed page size
  
  // Test email management state
  const [showTestEmailPopup, setShowTestEmailPopup] = useState(false);
  const [testEmails, setTestEmails] = useState<string[]>([]);
  const [newTestEmail, setNewTestEmail] = useState('');
  const [isLoadingTestEmails, setIsLoadingTestEmails] = useState(false);
  const [testEmailError, setTestEmailError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [conversationDetail, setConversationDetail] = useState<ConversationDetail | null>(null);
  const [leaderboardSort, setLeaderboardSort] = useState('errors');
  const [leaderboardFilter, setLeaderboardFilter] = useState<'all' | 'pmf-ready' | 'power-users'>('all');
  const [saveAnnotationError, setSaveAnnotationError] = useState<string | null>(null);


  // Active Users state
  const [activeUsersData, setActiveUsersData] = useState({
    activeUsers: 0,
    previousActiveUsers: 0,
    percentChange: 0,
    changeDirection: 'neutral' as 'up' | 'down' | 'neutral'
  });

  // Active Users Chart state
  const [activeUsersChartData, setActiveUsersChartData] = useState<{
    labels: string[];
    data: number[];
  } | null>(null);
  const [activeUsersChartLoading, setActiveUsersChartLoading] = useState(false);
  const [activeUsersChartError, setActiveUsersChartError] = useState<string | null>(null);

  // Metric selection state
  const [selectedMetric, setSelectedMetric] = useState<MetricType | null>('activeUsers');
  
  // Chart data for different metrics
  const [pmfSurveyReadyChartData, setPmfSurveyReadyChartData] = useState<{
    labels: string[];
    data: number[];
  } | null>(null);
  const [pmfSurveyReadyChartLoading, setPmfSurveyReadyChartLoading] = useState(false);
  const [pmfSurveyReadyChartError, setPmfSurveyReadyChartError] = useState<string | null>(null);

  const [powerUsersChartData, setPowerUsersChartData] = useState<{
    labels: string[];
    data: number[];
  } | null>(null);
  const [powerUsersChartLoading, setPowerUsersChartLoading] = useState(false);
  const [powerUsersChartError, setPowerUsersChartError] = useState<string | null>(null);

  // PMF Survey Ready state
  const [pmfSurveyReadyData, setPmfSurveyReadyData] = useState({
    pmfSurveyReady: 0,
    previousPmfSurveyReady: 0,
    percentChange: 0,
    changeDirection: 'neutral' as 'up' | 'down' | 'neutral'
  });

  // Power Users state
  const [powerUsersData, setPowerUsersData] = useState({
    powerUsers: 0,
    previousPowerUsers: 0,
    percentChange: 0,
    changeDirection: 'neutral' as 'up' | 'down' | 'neutral'
  });

  const [messagesByUser, setMessagesByUser] = useState<Record<string, number>>({});

  // Add state for segmentReportsByUser
  const [segmentReportsByUser, setSegmentReportsByUser] = useState<Record<string, number>>({});
  
  // Add loading states for leaderboard data
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  // Add state for user filter
  const [selectedUserFilter, setSelectedUserFilter] = useState<string | null>(null);

  // Add state for leaderboard filtering
  const [pmfSurveyReadyUsers, setPmfSurveyReadyUsers] = useState<string[]>([]);
  const [powerUsersEmails, setPowerUsersEmails] = useState<string[]>([]);
  const [leaderboardFilterLoading, setLeaderboardFilterLoading] = useState(false);

  // Add state for expanded user analysis
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  
  // Add state for automatic user analysis
  interface UserAnalysis {
    user_profile: string;
    engagement_level: string;
    primary_use_cases: string[];
    strengths: string[];
    pain_points: string[];
    satisfaction_level: string;
    ai_performance: string;
    top_recommendations: string[];
    user_journey_stage: string;
    key_insights: string[];
    conversation_themes: string[];
    growth_opportunities: string[];
  }
  const [userAnalysisResults, setUserAnalysisResults] = useState<Record<string, UserAnalysis>>({});
  const [userAnalysisErrors, setUserAnalysisErrors] = useState<Record<string, string>>({});
  const [userAnalysisLoading, setUserAnalysisLoading] = useState<Record<string, boolean>>({});

  // Add state for user activity details
  interface ArtistUsage {
    artistId: string;
    artistName: string;
    rooms: number;
    messages: number;
    reports: number;
    topics: string[];
    totalActivity: number;
  }
  interface UserActivityDetails {
    newArtistsCreated: number;
    artistUsage: ArtistUsage[];
    totalRooms: number;
    totalMemories: number;
  }
  const [userActivityDetails, setUserActivityDetails] = useState<Record<string, UserActivityDetails>>({});
  const [userActivityLoading, setUserActivityLoading] = useState<Record<string, boolean>>({});
  
  // Add state for showing admin profile
  const [showAdminProfile, setShowAdminProfile] = useState<Record<string, boolean>>({});

  // Add state for profile editing
  const [userProfiles, setUserProfiles] = useState<Record<string, {
    company?: string;
    job_title?: string;
    meeting_notes?: string;
    observations?: string;
    pain_points?: string;
    opportunities?: string;
    context_notes?: string;
    tags?: string[];
    sentiment?: 'positive' | 'neutral' | 'negative' | 'frustrated';
    last_contact_date?: string;
  }>>({});
  const [editingProfile, setEditingProfile] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState<string | null>(null);

  // State for Annotation Modal
  const [showAnnotationModal, setShowAnnotationModal] = useState(false);
  const [annotationModalDescription, setAnnotationModalDescription] = useState('');
  const [isSavingAnnotation, setIsSavingAnnotation] = useState(false);

  // Add state for leaderboard retention trends
  const [leaderboardTrends, setLeaderboardTrends] = useState<Record<string, { current: number, previous: number, percentChange: number | null, isNew: boolean, isReactivated: boolean }>>({});

  // Add state for per-user trend chart
  const [userTrendLoading, setUserTrendLoading] = useState(false);
  const [userTrendError, setUserTrendError] = useState<string | null>(null);
  const [userTrendData, setUserTrendData] = useState<{ labels: string[]; data: number[] } | null>(null);
  const [trendUser, setTrendUser] = useState<string | null>(null);

  // Add state to store per-user consistency (number of active days in period)
  const [userConsistency, setUserConsistency] = useState<Record<string, number>>({});

  // Add state for user error counts and details
  const [userErrorCounts, setUserErrorCounts] = useState<Record<string, number>>({});
  const [userErrorDetails, setUserErrorDetails] = useState<Record<string, Array<{
    id: string;
    error_message: string;
    error_type: string;
    tool_name: string;
    error_timestamp: string;
  }>>>({});
  const [userErrorsLoading, setUserErrorsLoading] = useState(false);
  const [showErrorPopup, setShowErrorPopup] = useState<string | null>(null); // Track which user's error popup is open

  // Add state for consistency loading
  const [consistencyLoading, setConsistencyLoading] = useState(false);

  // Add state for error data
  const [errorData, setErrorData] = useState<{totalErrors: number, errorBreakdown: Record<string, number>, errorRate: number}>({ 
    totalErrors: 0, 
    errorBreakdown: {},
    errorRate: 0
  })
  const [errorDataLoading, setErrorDataLoading] = useState(false)
  const [showErrorDropdown, setShowErrorDropdown] = useState(false)

  // Define testEmailFilteredConversations before any useEffect that uses it
  const testEmailFilteredConversations = conversations.filter(conv => {
    if (testEmails.includes(conv.account_email)) return false;
    if (conv.account_email.includes('@example.com')) return false;
    if (conv.account_email.includes('+')) return false;
    return true;
  });

  // 2. Fetch segment room IDs in a useEffect
  useEffect(() => {
    async function fetchSegmentRoomIds() {
      // Initialize Supabase client
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseAnonKey) return;
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      // Collect all room IDs for the period
      const allRoomIds = testEmailFilteredConversations.map(conv => conv.room_id);
      const ids = new Set<string>();
      if (allRoomIds.length > 0) {
        const batchSize = 1000;
        for (let i = 0; i < allRoomIds.length; i += batchSize) {
          const batchIds = allRoomIds.slice(i, i + batchSize);
          const { data: segmentRooms } = await supabase
            .from('segment_rooms')
            .select('room_id')
            .in('room_id', batchIds);
          (segmentRooms || []).forEach((r: { room_id: string }) => ids.add(r.room_id));
        }
      }
    }
    fetchSegmentRoomIds();
  }, [testEmailFilteredConversations, timeFilter]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, excludeTestEmails, timeFilter, selectedUserFilter]);

  // Fetch error data when timeFilter or user data changes
  useEffect(() => {
    const fetchErrorData = async () => {
      try {
        setErrorDataLoading(true)
        const days = timeFilter === 'Last 24 Hours' ? 1 : timeFilter === 'Last 7 Days' ? 7 : 30
        
        // Fetch error data
        const errorResponse = await fetch(`/api/error-logs?days=${days}`)
        const errorData = await errorResponse.json()
        
        // Use the same total actions count that's displayed in the UI pill
        const totalMessages = (() => {
          // Create combined user data (same logic as the display pill)
          const userMap = new Map<string, { email: string; messages: number; reports: number; totalActivity: number }>();
          
          // Add message counts
          Object.entries(messagesByUser).forEach(([email, count]) => {
            if (!userMap.has(email)) {
              userMap.set(email, { email, messages: 0, reports: 0, totalActivity: 0 });
            }
            const user = userMap.get(email)!;
            user.messages = count;
            user.totalActivity += count;
          });
          
          // Add segment report counts
          Object.entries(segmentReportsByUser).forEach(([email, count]) => {
            if (!userMap.has(email)) {
              userMap.set(email, { email, messages: 0, reports: 0, totalActivity: 0 });
            }
            const user = userMap.get(email)!;
            user.reports = count;
            user.totalActivity += count;
          });
          
          // Convert to array and filter (same as display logic)
          let users = Array.from(userMap.values());
          
          if (excludeTestEmails) {
            users = users.filter(user => {
              if (testEmails.includes(user.email)) return false;
              if (user.email.includes('@example.com')) return false;
              if (user.email.includes('+')) return false;
              return true;
            });
          }
          
          // Filter by activity (only active users)
          users = users.filter(user => user.totalActivity > 0);
          
          // Sum total actions (messages + reports) from active users
          return users.reduce((sum, user) => sum + user.totalActivity, 0);
        })()
        
        const totalErrors = errorData.totalErrors || 0
        const errorRate = totalMessages > 0 ? (totalErrors / totalMessages) * 100 : 0
        
        if (errorResponse.ok) {
          setErrorData({
            totalErrors: totalErrors,
            errorBreakdown: errorData.errorBreakdown || {},
            errorRate: Math.round(errorRate * 100) / 100 // Round to 2 decimal places
          })
        }
      } catch (error) {
        console.error('Error fetching error data:', error)
      } finally {
        setErrorDataLoading(false)
      }
    }
    
    fetchErrorData()
  }, [timeFilter, messagesByUser, segmentReportsByUser, excludeTestEmails, testEmails])

  // Auto-refresh error data every 2 minutes (since data comes from Supabase now)
  useEffect(() => {
    const fetchErrorData = async () => {
      try {
        const days = timeFilter === 'Last 24 Hours' ? 1 : timeFilter === 'Last 7 Days' ? 7 : 30
        
        // Fetch error data
        const errorResponse = await fetch(`/api/error-logs?days=${days}`)
        const errorData = await errorResponse.json()
        
        // Use the same total actions count that's displayed in the UI pill
        const totalMessages = (() => {
          // Create combined user data (same logic as the display pill)
          const userMap = new Map<string, { email: string; messages: number; reports: number; totalActivity: number }>();
          
          // Add message counts
          Object.entries(messagesByUser).forEach(([email, count]) => {
            if (!userMap.has(email)) {
              userMap.set(email, { email, messages: 0, reports: 0, totalActivity: 0 });
            }
            const user = userMap.get(email)!;
            user.messages = count;
            user.totalActivity += count;
          });
          
          // Add segment report counts
          Object.entries(segmentReportsByUser).forEach(([email, count]) => {
            if (!userMap.has(email)) {
              userMap.set(email, { email, messages: 0, reports: 0, totalActivity: 0 });
            }
            const user = userMap.get(email)!;
            user.reports = count;
            user.totalActivity += count;
          });
          
          // Convert to array and filter (same as display logic)
          let users = Array.from(userMap.values());
          
          if (excludeTestEmails) {
            users = users.filter(user => {
              if (testEmails.includes(user.email)) return false;
              if (user.email.includes('@example.com')) return false;
              if (user.email.includes('+')) return false;
              return true;
            });
          }
          
          // Filter by activity (only active users)
          users = users.filter(user => user.totalActivity > 0);
          
          // Sum total actions (messages + reports) from active users
          return users.reduce((sum, user) => sum + user.totalActivity, 0);
        })()
        
        const totalErrors = errorData.totalErrors || 0
        const errorRate = totalMessages > 0 ? (totalErrors / totalMessages) * 100 : 0
        
        if (errorResponse.ok) {
          setErrorData({
            totalErrors: totalErrors,
            errorBreakdown: errorData.errorBreakdown || {},
            errorRate: Math.round(errorRate * 100) / 100 // Round to 2 decimal places
          })
        }
      } catch (error) {
        console.error('Error fetching error data:', error)
      }
    }
    
    // Set up interval to fetch error data every 2 minutes (120,000 ms) - faster since it's from DB
    const interval = setInterval(fetchErrorData, 2 * 60 * 1000)
    
    // Clean up interval on component unmount
    return () => clearInterval(interval)
  }, [timeFilter, messagesByUser, segmentReportsByUser, excludeTestEmails, testEmails])

  // Close error dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showErrorDropdown) {
        const target = event.target as HTMLElement
        if (!target.closest('.error-dropdown-container')) {
          setShowErrorDropdown(false)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showErrorDropdown])

  // Close error popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showErrorPopup) {
        const target = event.target as HTMLElement
        if (!target.closest('.error-popup-container')) {
          setShowErrorPopup(null)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showErrorPopup])

  // Fetch user error counts for selected time period
  useEffect(() => {
    const fetchUserErrors = async () => {
      try {
        setUserErrorsLoading(true);
        
        const days = timeFilter === 'Last 24 Hours' ? 1 : timeFilter === 'Last 7 Days' ? 7 : 30;
        console.log(`🔍 [DASHBOARD] Fetching user errors for ${timeFilter} (${days} days)...`);
        
        // Fetch errors for selected time period
        const response = await fetch(`/api/error-logs?days=${days}`);
        const data = await response.json();
        
        console.log('🔍 [DASHBOARD] API response:', { 
          ok: response.ok, 
          status: response.status,
          totalErrors: data.totalErrors,
          errorsCount: data.errors?.length,
          sampleError: data.errors?.[0]
        });
        
        if (response.ok && data.errors) {
          // Count errors and store details by user_email (from API join)
          const errorCountsByEmail: Record<string, number> = {};
          const errorDetailsByEmail: Record<string, Array<{
            id: string;
            error_message: string;
            error_type: string;
            tool_name: string;
            error_timestamp: string;
          }>> = {};
          
          console.log('🔍 [DASHBOARD] Processing errors...');
          data.errors.forEach((error: { 
            id?: string;
            user_email?: string; 
            room_id?: string; 
            error_message?: string;
            error_type?: string;
            tool_name?: string;
            error_timestamp?: string;
          }, index: number) => {
            if (index < 3) {
              console.log(`🔍 [DASHBOARD] Error ${index + 1}:`, { 
                user_email: error.user_email, 
                room_id: error.room_id,
                error_message: error.error_message?.substring(0, 50) + '...'
              });
            }
            
            if (error.user_email) {
              // Count errors
              errorCountsByEmail[error.user_email] = (errorCountsByEmail[error.user_email] || 0) + 1;
              
              // Store error details
              if (!errorDetailsByEmail[error.user_email]) {
                errorDetailsByEmail[error.user_email] = [];
              }
              errorDetailsByEmail[error.user_email].push({
                id: error.id || '',
                error_message: error.error_message || 'Unknown error',
                error_type: error.error_type || 'Unknown',
                tool_name: error.tool_name || 'Unknown',
                error_timestamp: error.error_timestamp || ''
              });
            }
          });
          
          console.log('🔍 [DASHBOARD] Final error counts by email:', errorCountsByEmail);
          console.log('🔍 [DASHBOARD] Total users with errors:', Object.keys(errorCountsByEmail).length);
          
          setUserErrorCounts(errorCountsByEmail);
          setUserErrorDetails(errorDetailsByEmail);
        } else {
          console.warn('🔍 [DASHBOARD] No errors data or API failed:', data);
        }
      } catch (error) {
        console.error('❌ [DASHBOARD] Failed to fetch user error counts:', error);
      } finally {
        setUserErrorsLoading(false);
      }
    };
    
    fetchUserErrors();
    
    // Refresh every 2 minutes
    const interval = setInterval(fetchUserErrors, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [timeFilter]);

  React.useEffect(() => {
    async function fetchReports() {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseAnonKey) return;
      const supabase = createClient(supabaseUrl, supabaseAnonKey);
      const { data, error } = await supabase
        .from('segment_reports')
        .select('id, account_email, created_at');
      if (!error && data) {
        // This data is not used in the current implementation
        console.log('Segment reports fetched:', data.length);
      }
    }
    fetchReports();
  }, []);

  // Listen for data source updates
  useEffect(() => {
    const handleDataSourceUpdate = (event: CustomEvent) => {
      console.log('Data source update:', event.detail);
      // We're no longer updating debugInfo since it's not being displayed
    };
    
    // Add event listener
    window.addEventListener('data-source-update', handleDataSourceUpdate as EventListener);
    
    // Clean up
    return () => {
      window.removeEventListener('data-source-update', handleDataSourceUpdate as EventListener);
    };
  }, []);
    
  // Load conversations when filters change
  useEffect(() => {
    const loadConversations = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const filters: ConversationFilters = {
          searchQuery: selectedUserFilter ? '' : searchQuery, // Don't pass searchQuery when filtering by user
          excludeTestEmails,
          timeFilter,
          page: currentPage,
          limit: pageSize,
          userFilter: selectedUserFilter || undefined
        };
        
        console.log('[CONVERSATIONS] Filters for API:', filters);
        
        // Add event listener to capture console logs about data source
        const originalConsoleLog = console.log;
        console.log = (...args) => {
          originalConsoleLog.apply(console, args);
        };
        
        const result = await conversationService.getConversationList(filters);
        
        // Restore original console.log
        console.log = originalConsoleLog;
        
        // Update conversation counts if available in the response
        if (result.conversations) {
          setConversations(result.conversations);
        }
        setTotalPages(result.totalPages);
        setTotalCount(result.totalCount);
        setTotalUniqueUsers(result.totalUniqueUsers);
        
        // No longer need to set conversation counts since we use active users now
      } catch (err) {
        console.error('Failed to load conversations:', err);
        setError('Failed to load conversations. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    loadConversations();
  }, [searchQuery, excludeTestEmails, timeFilter, currentPage, pageSize, selectedUserFilter]);
  
  // Load conversation detail when selection changes
  useEffect(() => {
    const loadConversationDetail = async () => {
      if (!selectedConversation) {
        setConversationDetail(null);
        return;
      }
      
      try {
        const result = await conversationService.getConversationDetail(selectedConversation);
        if (result === null) {
          // Conversation was blocked (likely a test account)
          console.log('Conversation blocked or not found:', selectedConversation);
          setConversationDetail(null);
          // Clear the selection to prevent infinite loading
          setSelectedConversation(null);
        } else {
          setConversationDetail(result);
        }
      } catch (err) {
        console.error('Failed to load conversation detail:', err);
        setError('Failed to load conversation details. Please try again.');
        // Clear the selection on error
        setSelectedConversation(null);
      }
    };
    
    loadConversationDetail();
  }, [selectedConversation]);

  // Load test emails from Supabase when the popup is opened
  useEffect(() => {
    if (showTestEmailPopup) {
      fetchTestEmails();
    }
  }, [showTestEmailPopup]);

  // Also load test emails on initial page load
  useEffect(() => {
    fetchTestEmails();
  }, []);

  // Fetch test emails from the API
  const fetchTestEmails = async () => {
    try {
      setIsLoadingTestEmails(true);
      setTestEmailError(null);
      
      const response = await fetch('/api/test-emails');
      
      if (!response.ok) {
        throw new Error(`Error fetching test emails: ${response.status}`);
      }
      
      const data = await response.json();
      setTestEmails(data.emails || []);
    } catch (err) {
      console.error('Failed to load test emails:', err);
      setTestEmailError('Failed to load test emails. Please try again.');
      
      // Fallback to localStorage if API fails
      const savedEmails = localStorage.getItem('testEmails');
      if (savedEmails) {
        try {
          setTestEmails(JSON.parse(savedEmails));
        } catch (parseErr) {
          console.error('Failed to parse stored test emails:', parseErr);
        }
      }
    } finally {
      setIsLoadingTestEmails(false);
    }
  };

  // Handle adding a new test email
  const addTestEmail = async () => {
    if (!newTestEmail) return;
    
    try {
      setIsLoadingTestEmails(true);
      setTestEmailError(null);
      
      const response = await fetch('/api/test-emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: newTestEmail }),
      });
      
      if (!response.ok) {
        throw new Error(`Error adding test email: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.added) {
        // Only update the list if the email was actually added
        setTestEmails([...testEmails, newTestEmail]);
      }
      
      // Reset the input field
      setNewTestEmail('');
      
      // Refresh the list to ensure it's up to date
      fetchTestEmails();
    } catch (err) {
      console.error('Failed to add test email:', err);
      setTestEmailError('Failed to add test email. Please try again.');
      
      // Fallback to localStorage if API fails
      if (!testEmails.includes(newTestEmail)) {
        const updatedEmails = [...testEmails, newTestEmail];
        setTestEmails(updatedEmails);
        localStorage.setItem('testEmails', JSON.stringify(updatedEmails));
        setNewTestEmail('');
      }
    } finally {
      setIsLoadingTestEmails(false);
    }
  };

  // Handle removing a test email
  const removeTestEmail = async (email: string) => {
    try {
      setIsLoadingTestEmails(true);
      setTestEmailError(null);
      
      const response = await fetch(`/api/test-emails?email=${encodeURIComponent(email)}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`Error removing test email: ${response.status}`);
      }
      
      // Update the local state
      setTestEmails(testEmails.filter(e => e !== email));
    } catch (err) {
      console.error('Failed to remove test email:', err);
      setTestEmailError('Failed to remove test email. Please try again.');
      
      // Fallback to localStorage if API fails
      const updatedEmails = testEmails.filter(e => e !== email);
      setTestEmails(updatedEmails);
      localStorage.setItem('testEmails', JSON.stringify(updatedEmails));
    } finally {
      setIsLoadingTestEmails(false);
    }
  };

  // Fetch message counts from the API when timeFilter changes
  useEffect(() => {
    setLeaderboardLoading(true);
    const { start, end } = getDateRangeForFilter(timeFilter);
    let url = '/api/conversations/message-counts';
    if (start && end) {
      url += `?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}`;
    }
    fetch(url)
      .then(res => res.json())
      .then((data: { account_email: string, message_count: number }[]) => {
        const map: Record<string, number> = {};
        for (const row of data) {
          map[row.account_email] = row.message_count;
        }
        setMessagesByUser(map);
      })
      .finally(() => setLeaderboardLoading(false));
  }, [timeFilter]);

  // Fetch segment report counts from the API when timeFilter changes
  useEffect(() => {
    const { start, end } = getDateRangeForFilter(timeFilter);
    let url = '/api/conversations/leaderboard';
    if (start && end) {
      url += `?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}`;
    }
    fetch(url)
      .then(res => res.json())
      .then((data: { segmentReports: { email: string, segment_report_count: number }[] }) => {
        const map: Record<string, number> = {};
        for (const row of data.segmentReports || []) {
          map[row.email] = row.segment_report_count;
        }
        setSegmentReportsByUser(map);
      });
  }, [timeFilter]);



  const handleSaveAnnotation = async () => {
    if (!annotationModalDescription) {
      setSaveAnnotationError('Description is required.');
      return;
    }
    setIsSavingAnnotation(true);
    setSaveAnnotationError(null);
    try {
      const response = await fetch('/api/founder-dashboard-chart-annotations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_date: new Date().toISOString().split('T')[0], // Use today's date
          event_description: annotationModalDescription,
          chart_type: 'messages_reports_over_time' // Ensure this matches your expected chart_type
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to save annotation: ${response.status}`);
      }
      setShowAnnotationModal(false);
      setAnnotationModalDescription(''); // Clear description for next time
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred';
      setSaveAnnotationError(message);
      console.error('Failed to save annotation:', err);
    } finally {
      setIsSavingAnnotation(false);
    }
  };

  // Fetch active users data when timeFilter or excludeTestEmails changes
  useEffect(() => {
    const fetchActiveUsers = async () => {
      try {
        const params = new URLSearchParams({
          timeFilter,
          excludeTest: excludeTestEmails.toString()
        });
        
        const response = await fetch(`/api/active-users?${params}`);
        const data = await response.json();
        
        if (response.ok) {
          setActiveUsersData(data);
        } else {
          console.error('Failed to fetch active users:', data.error);
        }
      } catch (error) {
        console.error('Error fetching active users:', error);
      }
    };
    
    fetchActiveUsers();
  }, [timeFilter, excludeTestEmails]);

  // Handle metric selection
  const handleMetricClick = (metricType: MetricType) => {
    setSelectedMetric(metricType);
  };

  // Fetch active users chart data when timeFilter or excludeTestEmails changes
  useEffect(() => {
    const fetchActiveUsersChart = async () => {
      setActiveUsersChartLoading(true);
      setActiveUsersChartError(null);
      
      try {
        const params = new URLSearchParams({
          timeFilter,
          excludeTest: excludeTestEmails.toString()
        });
        
        const response = await fetch(`/api/active-users-chart?${params}`);
        const data = await response.json();
        
        if (response.ok) {
          setActiveUsersChartData(data);
        } else {
          console.error('Failed to fetch active users chart:', data.error);
          setActiveUsersChartError('Failed to load chart data');
        }
      } catch (error) {
        console.error('Error fetching active users chart:', error);
        setActiveUsersChartError('Failed to load chart data');
      } finally {
        setActiveUsersChartLoading(false);
      }
    };
    
    fetchActiveUsersChart();
  }, [timeFilter, excludeTestEmails]);

  // Fetch PMF Survey Ready chart data when timeFilter or excludeTestEmails changes
  useEffect(() => {
    const fetchPmfSurveyReadyChart = async () => {
      setPmfSurveyReadyChartLoading(true);
      setPmfSurveyReadyChartError(null);
      
      try {
        const params = new URLSearchParams({
          timeFilter,
          excludeTest: excludeTestEmails.toString()
        });
        
        const response = await fetch(`/api/pmf-survey-ready-chart?${params}`);
        const data = await response.json();
        
        if (response.ok) {
          setPmfSurveyReadyChartData(data);
        } else {
          console.error('Failed to fetch PMF Survey Ready chart:', data.error);
          setPmfSurveyReadyChartError('Failed to load chart data');
        }
      } catch (error) {
        console.error('Error fetching PMF Survey Ready chart:', error);
        setPmfSurveyReadyChartError('Failed to load chart data');
      } finally {
        setPmfSurveyReadyChartLoading(false);
      }
    };
    
    fetchPmfSurveyReadyChart();
  }, [timeFilter, excludeTestEmails]);

  // Fetch Power Users chart data when timeFilter or excludeTestEmails changes
  useEffect(() => {
    const fetchPowerUsersChart = async () => {
      setPowerUsersChartLoading(true);
      setPowerUsersChartError(null);
      
      try {
        const params = new URLSearchParams({
          timeFilter,
          excludeTest: excludeTestEmails.toString()
        });
        
        const response = await fetch(`/api/power-users-chart?${params}`);
        const data = await response.json();
        
        if (response.ok) {
          setPowerUsersChartData(data);
        } else {
          console.error('Failed to fetch Power Users chart:', data.error);
          setPowerUsersChartError('Failed to load chart data');
        }
      } catch (error) {
        console.error('Error fetching Power Users chart:', error);
        setPowerUsersChartError('Failed to load chart data');
      } finally {
        setPowerUsersChartLoading(false);
      }
    };
    
    fetchPowerUsersChart();
  }, [timeFilter, excludeTestEmails]);

  // Fetch PMF Survey Ready data when timeFilter or excludeTestEmails changes
  useEffect(() => {
    const fetchPmfSurveyReady = async () => {
      try {
        const params = new URLSearchParams({
          timeFilter,
          excludeTest: excludeTestEmails.toString()
        });
        
        const response = await fetch(`/api/pmf-survey-ready?${params}`);
        const data = await response.json();
        
        if (response.ok) {
          setPmfSurveyReadyData(data);
        } else {
          console.error('Failed to fetch PMF Survey Ready:', data.error);
        }
      } catch (error) {
        console.error('Error fetching PMF Survey Ready:', error);
      }
    };
    
    fetchPmfSurveyReady();
  }, [timeFilter, excludeTestEmails]);

  // Fetch power users data when timeFilter or excludeTestEmails changes
  useEffect(() => {
    const fetchPowerUsers = async () => {
      try {
        const params = new URLSearchParams({
          timeFilter,
          excludeTest: excludeTestEmails.toString()
        });
        
        const response = await fetch(`/api/power-users?${params}`);
        const data = await response.json();
        
        if (response.ok) {
          setPowerUsersData(data);
        } else {
          console.error('Failed to fetch power users:', data.error);
        }
      } catch (error) {
        console.error('Error fetching power users:', error);
      }
    };
    
    fetchPowerUsers();
  }, [timeFilter, excludeTestEmails]);

  // Fetch leaderboard filter data (PMF Survey Ready and Power Users) when timeFilter or excludeTestEmails changes
  useEffect(() => {
    const fetchLeaderboardFilterData = async () => {
      if (leaderboardFilter === 'all') return;
      
      setLeaderboardFilterLoading(true);
      try {
        const params = new URLSearchParams({
          timeFilter,
          excludeTest: excludeTestEmails.toString()
        });
        
        if (leaderboardFilter === 'pmf-ready') {
          const response = await fetch(`/api/pmf-survey-ready-users?${params}`);
          const data = await response.json();
          if (response.ok && data.users) {
            setPmfSurveyReadyUsers(data.users);
          }
        } else if (leaderboardFilter === 'power-users') {
          const response = await fetch(`/api/power-users-emails?${params}`);
          const data = await response.json();
          if (response.ok && data.emails) {
            setPowerUsersEmails(data.emails);
          }
        }
      } catch (error) {
        console.error('Error fetching leaderboard filter data:', error);
      } finally {
        setLeaderboardFilterLoading(false);
      }
    };
    
    fetchLeaderboardFilterData();
  }, [timeFilter, excludeTestEmails, leaderboardFilter]);

  // Function to load user profile
  const loadUserProfile = async (email: string) => {
    try {
      const response = await fetch(`/api/user-profiles?email=${encodeURIComponent(email)}`);
      const data = await response.json();
      
      if (data.profile) {
        setUserProfiles(prev => ({
          ...prev,
          [email]: data.profile
        }));
      } else {
        // If no profile exists, try to get company suggestion
        await loadCompanySuggestion(email);
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  };

  // Function to load company suggestion from sales dashboard
  const loadCompanySuggestion = async (email: string) => {
    try {
      const response = await fetch(`/api/suggest-company?email=${encodeURIComponent(email)}`);
      const data = await response.json();
      
      if (data.suggestion) {
        // Pre-populate company field with suggestion
        setUserProfiles(prev => ({
          ...prev,
          [email]: {
            ...prev[email],
            company: data.suggestion.company
          }
        }));
        console.log(`💡 Auto-suggested company "${data.suggestion.company}" for ${email}`);
      }
    } catch (error) {
      console.error('Error loading company suggestion:', error);
    }
  };

  // Function to save user profile
  const saveUserProfile = async (email: string, profileData: {
    company?: string;
    job_title?: string;
    meeting_notes?: string;
    observations?: string;
    pain_points?: string;
    opportunities?: string;
    context_notes?: string;
    tags?: string[];
    sentiment?: 'positive' | 'neutral' | 'negative' | 'frustrated';
    last_contact_date?: string;
  }) => {
    try {
      setProfileSaving(email);
      
      const response = await fetch('/api/user-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, ...profileData })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setUserProfiles(prev => ({
          ...prev,
          [email]: data.profile
        }));
        setEditingProfile(null);
      }
    } catch (error) {
      console.error('Error saving user profile:', error);
    } finally {
      setProfileSaving(null);
    }
  };

  // Function to automatically run user analysis
  const runUserAnalysis = async (userEmail: string) => {
    // Don't run analysis if it's already loading or if we already have results
    if (userAnalysisLoading[userEmail] || userAnalysisResults[userEmail]) {
      return;
    }

    setUserAnalysisLoading(prev => ({ ...prev, [userEmail]: true }));
    setUserAnalysisErrors(prev => ({ ...prev, [userEmail]: '' }));

    try {
      const response = await fetch('/api/user-analysis', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userEmail }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      if (data.success && data.analysis) {
        setUserAnalysisResults(prev => ({ ...prev, [userEmail]: data.analysis }));
      } else {
        throw new Error(data.error || 'Analysis failed');
      }
    } catch (err) {
      console.error('Error running user analysis:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setUserAnalysisErrors(prev => ({ ...prev, [userEmail]: errorMessage }));
    } finally {
      setUserAnalysisLoading(prev => ({ ...prev, [userEmail]: false }));
    }
  };

  // Function to fetch user activity details
  const fetchUserActivityDetails = async (userEmail: string) => {
    // Don't fetch if it's already loading or if we already have results
    if (userActivityLoading[userEmail] || userActivityDetails[userEmail]) {
      return;
    }

    setUserActivityLoading(prev => ({ ...prev, [userEmail]: true }));

    try {
      const response = await fetch(`/api/user-activity-details?email=${encodeURIComponent(userEmail)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      setUserActivityDetails(prev => ({ ...prev, [userEmail]: data }));
    } catch (err) {
      console.error('Error fetching user activity details:', err);
    } finally {
      setUserActivityLoading(prev => ({ ...prev, [userEmail]: false }));
    }
  };

  // Fetch leaderboard retention trends when timeFilter changes and clear consistency cache
  useEffect(() => {
    const { start, end } = getDateRangeForFilter(timeFilter);
    let url = '/api/conversations/leaderboard';
    if (start && end) {
      url += `?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}`;
    }
    fetch(url)
      .then(res => res.json())
      .then((data: { leaderboard: { email: string, currentPeriodActions: number, previousPeriodActions: number, percentChange: number | null, isNew: boolean, isReactivated: boolean }[] }) => {
        const map: Record<string, { current: number, previous: number, percentChange: number | null, isNew: boolean, isReactivated: boolean }> = {};
        if (data.leaderboard) {
          for (const row of data.leaderboard) {
            map[row.email] = {
              current: row.currentPeriodActions,
              previous: row.previousPeriodActions,
              percentChange: row.percentChange,
              isNew: row.isNew,
              isReactivated: row.isReactivated
            };
          }
        }
        setLeaderboardTrends(map);
      });
    
    // Clear consistency cache when time filter changes
    setUserConsistency({});
  }, [timeFilter]);

  // Fetch per-user trend when leaderboard user is clicked
  const fetchUserTrend = async (email: string) => {
    setUserTrendLoading(true);
    setUserTrendError(null);
    setTrendUser(email);
    try {
      const { start, end } = getDateRangeForFilter(timeFilter);
      const params = new URLSearchParams({ email, timeFilter });
      if (start && end) {
        params.append('start_date', start);
        params.append('end_date', end);
      }
      const res = await fetch(`/api/user-activity-trend?${params}`);
      const data: { trend: { date: string; actions: number }[]; error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch user trend');
      setUserTrendData({
        labels: data.trend.map((d) => d.date),
        data: data.trend.map((d) => d.actions),
      });
      // Remove consistency calculation - leaderboard consistency is source of truth
      // const consistency = data.trend.filter((d) => d.actions > 0).length;
      // setUserConsistency((prev) => ({ ...prev, [email]: consistency }));
    } catch (err: unknown) {
      setUserTrendError(err instanceof Error ? err.message : 'Failed to fetch user trend');
      setUserTrendData(null);
    } finally {
      setUserTrendLoading(false);
    }
  };

  // Add effect to refetch user trend when timeFilter changes and a user is selected
  React.useEffect(() => {
    if (trendUser) {
      fetchUserTrend(trendUser);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendUser, timeFilter]);

  return (
    <main className="p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        <SearchAndFilters
          timeFilter={timeFilter}
          onTimeFilterChange={setTimeFilter}
        />

        {/* Analytics Metrics Cards */}
        <MetricsSection
          activeUsersData={activeUsersData}
          powerUsersData={powerUsersData}
          pmfSurveyReadyData={pmfSurveyReadyData}
          timeFilter={timeFilter}
          onMetricClick={handleMetricClick}
          selectedMetric={selectedMetric}
        />

        <ActiveUsersChart
          chartData={(() => {
            if (trendUser) return userTrendData;
            switch (selectedMetric) {
              case 'pmfSurveyReady':
                return pmfSurveyReadyChartData;
              case 'powerUsers':
                return powerUsersChartData;
              case 'activeUsers':
              default:
                return activeUsersChartData;
            }
          })()}
          loading={(() => {
            if (trendUser) return userTrendLoading;
            switch (selectedMetric) {
              case 'pmfSurveyReady':
                return pmfSurveyReadyChartLoading;
              case 'powerUsers':
                return powerUsersChartLoading;
              case 'activeUsers':
              default:
                return activeUsersChartLoading;
            }
          })()}
          error={(() => {
            if (trendUser) return userTrendError;
            switch (selectedMetric) {
              case 'pmfSurveyReady':
                return pmfSurveyReadyChartError;
              case 'powerUsers':
                return powerUsersChartError;
              case 'activeUsers':
              default:
                return activeUsersChartError;
            }
          })()}
          isUserTrend={!!trendUser}
          metricType={trendUser ? 'activeUsers' : selectedMetric || 'activeUsers'}
        />



        {/* User Leaderboard (Time Filtered) */}
          <div className="bg-white rounded-2xl shadow-md p-6 mb-8">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-2">
                <div className="flex items-center gap-4">
                  <h2 className="text-2xl font-bold">User Leaderboard</h2>
                  <div className="flex items-center gap-2">
                    <div className="text-sm text-gray-600 bg-gray-50 px-3 py-1 rounded-full">
                      {(() => {
                        // Calculate total messages using the EXACT same logic as the leaderboard
                        const userMap = new Map<string, { email: string; messages: number; reports: number; totalActivity: number }>();
                        
                        // Add message counts
                        Object.entries(messagesByUser).forEach(([email, count]) => {
                          if (!userMap.has(email)) {
                            userMap.set(email, { email, messages: 0, reports: 0, totalActivity: 0 });
                          }
                          const user = userMap.get(email)!;
                          user.messages = count;
                          user.totalActivity += count;
                        });
                        
                        // Add segment report counts
                        Object.entries(segmentReportsByUser).forEach(([email, count]) => {
                          if (!userMap.has(email)) {
                            userMap.set(email, { email, messages: 0, reports: 0, totalActivity: 0 });
                          }
                          const user = userMap.get(email)!;
                          user.reports = count;
                          user.totalActivity += count;
                        });
                        
                        // Convert to array and filter out test emails if needed
                        let users = Array.from(userMap.values());
                        
                        if (excludeTestEmails) {
                          users = users.filter(user => {
                            if (testEmails.includes(user.email)) return false;
                            if (user.email.includes('@example.com')) return false;
                            if (user.email.includes('+')) return false;
                            return true;
                          });
                        }
                        
                        // Filter by activity (only active users)
                        users = users.filter(user => user.totalActivity > 0);
                        
                        // Sum total actions (messages + reports) from active users - matches error rate calculation
                        const totalActions = users.reduce((sum, user) => sum + user.totalActivity, 0);
                        return totalActions;
                      })()} total actions
                    </div>
                    
                    {/* Error Badge with Dropdown */}
                    <div className="relative error-dropdown-container">
                      <button
                        onClick={() => setShowErrorDropdown(!showErrorDropdown)}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 rounded-lg transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                          {errorDataLoading ? (
                            <div className="flex items-center gap-1">
                              <div className="w-4 h-4 border-2 border-gray-300 border-t-red-600 rounded-full animate-spin"></div>
                              <span className="text-gray-500">loading...</span>
                            </div>
                          ) : (
                            <>
                              <span className="text-red-600 font-semibold">{errorData.totalErrors}</span>
                              <span className="text-gray-500">errors</span>
                            </>
                          )}
                        </div>
                        <svg 
                          className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${showErrorDropdown ? 'rotate-180' : ''}`} 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* Compact Error Breakdown Dropdown */}
                      {showErrorDropdown && (
                        <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                          <div className="px-3 py-2 border-b border-gray-100">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-2">
                                <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                                <span className="text-xs font-medium text-gray-700">Error Rate</span>
                              </div>
                              {/* Error Rate Display - aligned with tool count badges */}
                              {errorDataLoading ? (
                                <div className="h-5 w-12 bg-gray-200 rounded animate-pulse"></div>
                              ) : (
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                  (errorData.errorRate || 0) >= 5 ? 'bg-red-100 text-red-700' :
                                  (errorData.errorRate || 0) >= 2 ? 'bg-orange-100 text-orange-700' :
                                  (errorData.errorRate || 0) > 0 ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-green-100 text-green-700'
                                }`}>
                                  {(errorData.errorRate || 0).toFixed(1)}%
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="p-3">
                            
                            {/* Tool Breakdown */}
                            {errorDataLoading ? (
                              <div className="space-y-2">
                                {[...Array(3)].map((_, i) => (
                                  <div key={i} className="flex justify-between items-center px-2 py-1.5">
                                    <div className="flex items-center gap-2">
                                      <div className="w-2 h-2 bg-gray-200 rounded-full animate-pulse"></div>
                                      <div className="h-3 w-20 bg-gray-200 rounded animate-pulse"></div>
                                    </div>
                                    <div className="h-4 w-8 bg-gray-200 rounded animate-pulse"></div>
                                  </div>
                                ))}
                              </div>
                            ) : Object.keys(errorData.errorBreakdown).length > 0 ? (
                              <div className="space-y-2">
                                {Object.entries(errorData.errorBreakdown)
                                  .sort(([,a], [,b]) => b - a) // Sort by count descending
                                  .map(([tool, count], index) => (
                                    <div key={tool} className="flex justify-between items-center text-xs hover:bg-gray-50 px-2 py-1.5 rounded transition-colors">
                                      <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${
                                          index === 0 ? 'bg-red-500' : 
                                          index === 1 ? 'bg-orange-500' : 
                                          index === 2 ? 'bg-yellow-500' : 
                                          'bg-gray-400'
                                        }`}></div>
                                        <span className="text-gray-700 font-medium">{tool.replace(/_/g, ' ')}</span>
                                      </div>
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                        count >= 4 ? 'bg-red-100 text-red-700' :
                                        count >= 2 ? 'bg-orange-100 text-orange-700' :
                                        'bg-gray-100 text-gray-600'
                                      }`}>
                                        {count}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            ) : (
                              <div className="text-center py-4">
                                <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <p className="text-xs text-gray-500">No errors found</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Filter and Sort Controls */}
                <div className="flex gap-3 items-center flex-wrap">
                  <select
                    id="leaderboard-filter"
                    value={leaderboardFilter}
                    onChange={e => setLeaderboardFilter(e.target.value as 'all' | 'pmf-ready' | 'power-users')}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    title="Filter users by type"
                  >
                    <option value="all">All Users</option>
                    <option value="pmf-ready">PMF Survey Ready</option>
                    <option value="power-users">Power Users</option>
                  </select>
                  <select
                    id="leaderboard-sort"
                    value={leaderboardSort}
                    onChange={(e) => setLeaderboardSort(e.target.value)}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    title="Sort leaderboard by messages, reports, all actions, or activity growth"
                  >
                    <option value="messages">Sort by Messages</option>
                    <option value="reports">Sort by Reports</option>
                    <option value="activity">Sort by All Actions</option>
                    <option value="retention">Sort by Activity Growth</option>
                    <option value="consistency">Sort by Consistency</option>
                    <option value="errors">Sort by Errors</option>
                  </select>
                </div>
              </div>

              {(leaderboardLoading || leaderboardFilterLoading) ? (
                <div className="space-y-4">
                  {[...Array(10)].map((_, i) => (
                    <div key={i} className="animate-pulse flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
                        <div className="h-4 w-48 bg-gray-200 rounded"></div>
                      </div>
                      <div className="h-4 w-16 bg-gray-200 rounded"></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {(() => {
                    // Create combined user data
                    const userMap = new Map<string, { email: string; messages: number; reports: number; totalActivity: number }>();
                    
                    // Add message counts
                    Object.entries(messagesByUser).forEach(([email, count]) => {
                      if (!userMap.has(email)) {
                        userMap.set(email, { email, messages: 0, reports: 0, totalActivity: 0 });
                      }
                      const user = userMap.get(email)!;
                      user.messages = count;
                      user.totalActivity += count;
                    });
                    
                    // Add segment report counts
                    Object.entries(segmentReportsByUser).forEach(([email, count]) => {
                      if (!userMap.has(email)) {
                        userMap.set(email, { email, messages: 0, reports: 0, totalActivity: 0 });
                      }
                      const user = userMap.get(email)!;
                      user.reports = count;
                      user.totalActivity += count;
                    });
                    
                    // Convert to array and filter out test emails if needed
                    let users = Array.from(userMap.values());
                    
                    if (excludeTestEmails) {
                      users = users.filter(user => {
                        if (testEmails.includes(user.email)) return false;
                        if (user.email.includes('@example.com')) return false;
                        if (user.email.includes('+')) return false;
                        return true;
                      });
                    }
                    
                    // Filter by time and activity
                    users = users.filter(user => user.totalActivity > 0);
                    
                    // Apply leaderboard filter
                    if (leaderboardFilter === 'pmf-ready' && pmfSurveyReadyUsers.length > 0) {
                      users = users.filter(user => pmfSurveyReadyUsers.includes(user.email));
                    } else if (leaderboardFilter === 'power-users' && powerUsersEmails.length > 0) {
                      users = users.filter(user => powerUsersEmails.includes(user.email));
                    }
                    
                    // Sort based on selected criteria
                    if (leaderboardSort === 'messages') {
                      users.sort((a, b) => b.messages - a.messages);
                    } else if (leaderboardSort === 'reports') {
                      users.sort((a, b) => b.reports - a.reports);
                    } else if (leaderboardSort === 'retention') {
                      users.sort((a, b) => {
                        const aTrend = leaderboardTrends[a.email]?.percentChange ?? -Infinity;
                        const bTrend = leaderboardTrends[b.email]?.percentChange ?? -Infinity;
                        return bTrend - aTrend;
                      });
                    } else if (leaderboardSort === 'consistency') {
                      // Get emails for visible users
                      const emailsToFetch = users
                        .filter(u => userConsistency[u.email] === undefined)
                        .map(u => u.email);
                      if (emailsToFetch.length > 0 && !consistencyLoading) {
                        setConsistencyLoading(true);
                        fetch('/api/user-activity-consistency', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ emails: emailsToFetch, timeFilter }),
                        })
                          .then(res => res.json())
                          .then((data: Record<string, number>) => {
                            setUserConsistency(prev => ({ ...prev, ...data }));
                          })
                          .finally(() => setConsistencyLoading(false));
                      }
                      // If still loading, show a loading state
                      if (consistencyLoading) {
                        return (
                          <div className="text-center text-gray-500 py-8">Loading consistency data...</div>
                        );
                      }
                      users.sort((a, b) => userConsistency[b.email] - userConsistency[a.email]);
                    } else if (leaderboardSort === 'errors') {
                      // Sort by error count (highest errors first), users with no errors go to bottom
                      users.sort((a, b) => {
                        const aErrors = userErrorCounts[a.email] || 0;
                        const bErrors = userErrorCounts[b.email] || 0;
                        return bErrors - aErrors;
                      });
                    } else {
                      users.sort((a, b) => b.totalActivity - a.totalActivity);
                    }
                    
                    // Store total count before pagination
                    // Show all users
                    const visibleUsers = users;
                    
                    return (
                      <div className="space-y-3">
                        {visibleUsers.map((user, index) => (
                      <div key={user.email}>
                        <button
                          type="button"
                          onClick={() => {
                            console.log('[LEADERBOARD] User selected for filter:', user.email);
                            if (expandedUser === user.email) {
                              setExpandedUser(null); // Collapse if already expanded
                            } else {
                              setExpandedUser(user.email); // Expand this user
                              setSelectedUserFilter(user.email); // Also set as filter
                              setSearchQuery(''); // Clear search query to avoid conflicts
                              runUserAnalysis(user.email); // Automatically run analysis
                              fetchUserActivityDetails(user.email); // Fetch structured activity data
                              fetchUserTrend(user.email); // Fetch per-user trend
                            }
                          }}
                          className={`w-full flex items-center justify-between p-4 rounded-lg transition-colors text-left ${
                            expandedUser === user.email
                              ? 'bg-blue-50 border-2 border-blue-500' 
                              : selectedUserFilter === user.email 
                                ? 'bg-blue-50 border-2 border-blue-500' 
                                : 'hover:bg-gray-50 border-2 border-transparent'
                          }`}
                          title={`Click to ${expandedUser === user.email ? 'collapse' : 'expand'} user analysis for ${user.email}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                              {index + 1}
                            </div>
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <div className="font-medium text-gray-900 truncate max-w-xs flex items-center gap-2">
                                  {isWalletAddress(user.email) ? (
                                    <>
                                      <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">👛</span>
                                      {formatWalletAddress(user.email)}
                                    </>
                                  ) : (
                                    user.email
                                  )}
                                </div>
                                
                                                                {/* Error badge - show if user has errors */}
                                {userErrorCounts[user.email] && userErrorCounts[user.email] > 0 && (
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowErrorPopup(showErrorPopup === user.email ? null : user.email);
                                    }}
                                    className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium text-white cursor-pointer hover:opacity-80 transition-opacity ${
                                      userErrorCounts[user.email] >= 3 ? 'bg-red-500' :
                                      userErrorCounts[user.email] >= 2 ? 'bg-orange-500' :
                                      'bg-yellow-500'
                                    }`}
                                    title={`${userErrorCounts[user.email]} error${userErrorCounts[user.email] > 1 ? 's' : ''} - click for details`}
                                  >
                                    {userErrorCounts[user.email]}
                                  </button>
                                )}
                                
                                {/* Show loading indicator if errors are being fetched */}
                                {userErrorsLoading && (
                                  <div className="w-4 h-4 bg-gray-200 rounded-full animate-pulse"></div>
                                )}

                              </div>
                              <div className="flex items-center gap-2">
                                <div className="text-sm text-gray-500">
                                  {user.messages} messages, {user.reports} reports
                                </div>
                                {userProfiles[user.email] && (
                                  <div className="flex items-center gap-1">
                                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                                    <span className="text-xs text-green-600 font-medium">
                                      {getProfileCompleteness(userProfiles[user.email])}% profile
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 justify-end min-w-[120px]">
                            {/* Consistency badge */}
                            {leaderboardSort === 'consistency' && (
                              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold min-w-20 text-center bg-blue-50 text-blue-700 border border-blue-200">
                                {(userConsistency[user.email] || 0)} days active
                              </span>
                            )}
                            {/* Activity growth badge - only show when sorting by activity growth */}
                            {leaderboardSort === 'retention' && leaderboardTrends[user.email] && leaderboardTrends[user.email].percentChange !== null && (
                              <span
                                className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold min-w-20 text-center
                                  ${leaderboardTrends[user.email].percentChange! > 0 ? 'bg-green-50 text-green-700 border border-green-200' : leaderboardTrends[user.email].percentChange! < 0 ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-gray-50 text-gray-600 border border-gray-200'}`}
                                title={`Change vs previous period: ${leaderboardTrends[user.email].percentChange! > 0 ? '+' : ''}${leaderboardTrends[user.email].percentChange}%\nCurrent: ${leaderboardTrends[user.email].current} actions\nPrevious: ${leaderboardTrends[user.email].previous} actions${leaderboardTrends[user.email].isNew ? '\n(New user this period)' : ''}`}
                              >
                                {leaderboardTrends[user.email].percentChange! > 0 ? '▲' : leaderboardTrends[user.email].percentChange! < 0 ? '▼' : ''}
                                {leaderboardTrends[user.email].percentChange! > 0 ? '+' : ''}{leaderboardTrends[user.email].percentChange}%
                              </span>
                            )}
                            {/* Error badge - only show when sorting by errors */}
                            {leaderboardSort === 'errors' && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowErrorPopup(showErrorPopup === user.email ? null : user.email);
                                }}
                                className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold min-w-20 text-center cursor-pointer hover:opacity-80 transition-opacity ${
                                  (userErrorCounts[user.email] || 0) >= 3 ? 'bg-red-50 text-red-700 border border-red-200' :
                                  (userErrorCounts[user.email] || 0) >= 2 ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                                  (userErrorCounts[user.email] || 0) > 0 ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                                  'bg-gray-50 text-gray-600 border border-gray-200'
                                }`}
                              >
                                {userErrorCounts[user.email] || 0} errors
                              </button>
                            )}
                            {/* Actions/messages/reports/errors number */}
                            <span className="ml-2 text-lg font-bold text-gray-900 min-w-12 text-right inline-block">
                              {leaderboardSort === 'messages' ? user.messages : 
                               leaderboardSort === 'reports' ? user.reports : 
                               leaderboardSort === 'errors' ? (userErrorCounts[user.email] || 0) :
                               user.totalActivity}
                            </span>
                          </div>
                        </button>
                        
                        {/* Streamlined Expanded User Analysis Card */}
                        {expandedUser === user.email && (
                          <div className="mt-2 p-4 bg-gray-50 border-l-4 border-blue-500 rounded-r-lg">
                            {/* Header with Quick Actions */}
                            <div className="flex justify-between items-center mb-4">
                              <div className="flex gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedUserFilter(user.email);
                                    setSearchQuery(''); // Clear search query to avoid conflicts
                                    setExpandedUser(null);
                                  }}
                                  className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                                >
                                  🔍 Filter Conversations
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigator.clipboard.writeText(user.email);
                                  }}
                                  className="px-3 py-1.5 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
                                >
                                  📋 Copy Email
                                </button>
                                {editingProfile === user.email ? (
                                  <>
                                    <button
                                      onClick={() => {
                                        const profile = userProfiles[user.email] || {};
                                        saveUserProfile(user.email, profile);
                                      }}
                                      disabled={profileSaving === user.email}
                                      className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                                    >
                                      {profileSaving === user.email ? '⏳ Saving...' : '💾 Save Profile'}
                                    </button>
                                    <button
                                      onClick={() => setEditingProfile(null)}
                                      className="px-3 py-1.5 bg-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-400 transition-colors"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setShowAdminProfile(prev => ({
                                        ...prev,
                                        [user.email]: !prev[user.email]
                                      }));
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                                      showAdminProfile[user.email] 
                                        ? 'bg-orange-600 text-white hover:bg-orange-700' 
                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                    }`}
                                  >
                                    ⚙️ Profile
                                  </button>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedUser(null);
                                  }}
                                  className="text-gray-400 hover:text-gray-600 text-lg"
                                  title="Close analysis"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                            
                            <div className="space-y-4">
                              {/* Key Insights Summary */}
                              <div className="bg-white p-4 rounded-lg">
                                <h4 className="font-semibold text-gray-900 mb-3">📊 Key Insights</h4>
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2 text-sm">
                                    <span className="font-medium text-gray-700">Activity:</span>
                                    <span className="text-gray-600">{user.totalActivity} total actions (#{index + 1} of {users.length} users)</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-sm">
                                    <span className="font-medium text-gray-700">Pattern:</span>
                                    <span className="text-gray-600">
                                      {user.totalActivity === 0 ? 'No activity yet' :
                                       user.messages === 0 ? 'Reports only' :
                                       user.reports === 0 ? 'Messages only' :
                                       `${Math.round((user.messages / user.totalActivity) * 100)}% messages, ${Math.round((user.reports / user.totalActivity) * 100)}% reports`}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 text-sm">
                                    <span className="font-medium text-gray-700">Status:</span>
                                    <span className="text-gray-600">
                                      {(() => {
                                        if (index === 0) return '👑 Top user - key engagement driver';
                                        if (index < 3) return '⭐ Top 3 user - valuable for feedback';
                                        if (index < users.length * 0.1) return '🎖️ Top 10% user';
                                        if (user.totalActivity > 20) return '✅ Active user';
                                        if (user.totalActivity > 5) return '📈 Moderate engagement';
                                        return '🌱 Light usage';
                                      })()}
                                    </span>
                                  </div>
                                  
                                </div>
                              </div>

                              {/* Admin Profile Section */}
                              {showAdminProfile[user.email] && (
                                <div className="bg-white p-4 rounded-lg">
                                  <div className="flex justify-between items-center mb-3">
                                    <h4 className="font-semibold text-gray-900">
                                      👤 Admin Profile
                                      {userProfiles[user.email] && (
                                        <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                                          {getProfileCompleteness(userProfiles[user.email])}% complete
                                        </span>
                                      )}
                                    </h4>
                                    <div className="flex gap-2">
                                      {editingProfile === user.email ? (
                                        <>
                                          <button
                                            onClick={() => {
                                              const profile = userProfiles[user.email] || {};
                                              saveUserProfile(user.email, profile);
                                            }}
                                            disabled={profileSaving === user.email}
                                            className="px-2 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                                          >
                                            {profileSaving === user.email ? '⏳' : '💾'}
                                          </button>
                                          <button
                                            onClick={() => setEditingProfile(null)}
                                            className="px-2 py-1 bg-gray-300 text-gray-700 rounded text-xs font-medium hover:bg-gray-400 transition-colors"
                                          >
                                            ✕
                                          </button>
                                        </>
                                      ) : (
                                        <button
                                          onClick={() => {
                                            setEditingProfile(user.email);
                                            if (!userProfiles[user.email]) {
                                              loadUserProfile(user.email);
                                            }
                                          }}
                                          className="px-2 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors"
                                        >
                                          ✏️
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                
                                {editingProfile === user.email ? (
                                  /* Profile Editing Form */
                                  <div className="space-y-3 text-sm">
                                    <div className="grid grid-cols-2 gap-3">
                                      <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">
                                          Company
                                          {userProfiles[user.email]?.company && (
                                            <span className="ml-1 text-xs text-green-600 font-normal">
                                              (auto-suggested from sales dashboard)
                                            </span>
                                          )}
                                        </label>
                                        <input
                                          type="text"
                                          placeholder="e.g., Spotify"
                                          value={userProfiles[user.email]?.company || ''}
                                          onChange={(e) => setUserProfiles(prev => ({
                                            ...prev,
                                            [user.email]: { ...prev[user.email], company: e.target.value }
                                          }))}
                                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Job Title</label>
                                        <input
                                          type="text"
                                          placeholder="e.g., Marketing Director"
                                          value={userProfiles[user.email]?.job_title || ''}
                                          onChange={(e) => setUserProfiles(prev => ({
                                            ...prev,
                                            [user.email]: { ...prev[user.email], job_title: e.target.value }
                                          }))}
                                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                        />
                                      </div>
                                    </div>
                                    
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">Key Observations</label>
                                      <textarea
                                        placeholder="Important insights about this user..."
                                        value={userProfiles[user.email]?.observations || ''}
                                        onChange={(e) => setUserProfiles(prev => ({
                                          ...prev,
                                          [user.email]: { ...prev[user.email], observations: e.target.value }
                                        }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                        rows={3}
                                      />
                                    </div>
                                    
                                    <details className="border border-gray-200 rounded-lg">
                                      <summary className="px-3 py-2 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50">
                                        🔽 Additional Context
                                      </summary>
                                      <div className="p-3 border-t space-y-3">
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 mb-1">Meeting Notes</label>
                                          <textarea
                                            placeholder="Call transcripts, meeting summaries..."
                                            value={userProfiles[user.email]?.meeting_notes || ''}
                                            onChange={(e) => setUserProfiles(prev => ({
                                              ...prev,
                                              [user.email]: { ...prev[user.email], meeting_notes: e.target.value }
                                            }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                            rows={2}
                                          />
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-3">
                                          <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Pain Points</label>
                                            <textarea
                                              placeholder="What frustrates them..."
                                              value={userProfiles[user.email]?.pain_points || ''}
                                              onChange={(e) => setUserProfiles(prev => ({
                                                ...prev,
                                                [user.email]: { ...prev[user.email], pain_points: e.target.value }
                                              }))}
                                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                              rows={2}
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-xs font-medium text-gray-700 mb-1">Opportunities</label>
                                            <textarea
                                              placeholder="Upsell/expansion potential..."
                                              value={userProfiles[user.email]?.opportunities || ''}
                                              onChange={(e) => setUserProfiles(prev => ({
                                                ...prev,
                                                [user.email]: { ...prev[user.email], opportunities: e.target.value }
                                              }))}
                                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                              rows={2}
                                            />
                                          </div>
                                        </div>
                                        
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 mb-1">LLM Context</label>
                                          <textarea
                                            placeholder="Additional context to help AI understand this user..."
                                            value={userProfiles[user.email]?.context_notes || ''}
                                            onChange={(e) => setUserProfiles(prev => ({
                                              ...prev,
                                              [user.email]: { ...prev[user.email], context_notes: e.target.value }
                                            }))}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                            rows={2}
                                          />
                                        </div>
                                      </div>
                                    </details>
                                  </div>
                                ) : (
                                  /* Profile Display */
                                  <div className="text-sm">
                                    {userProfiles[user.email] ? (
                                      <div className="space-y-2">
                                        {userProfiles[user.email]?.company && (
                                          <div className="flex gap-2">
                                            <span className="font-medium text-gray-700">🏢 Company:</span>
                                            <span className="text-gray-600">{userProfiles[user.email].company}</span>
                                          </div>
                                        )}
                                        {userProfiles[user.email]?.job_title && (
                                          <div className="flex gap-2">
                                            <span className="font-medium text-gray-700">💼 Role:</span>
                                            <span className="text-gray-600">{userProfiles[user.email].job_title}</span>
                                          </div>
                                        )}
                                        {userProfiles[user.email]?.observations && (
                                          <div className="flex gap-2">
                                            <span className="font-medium text-gray-700">📝 Notes:</span>
                                            <span className="text-gray-600">{userProfiles[user.email].observations}</span>
                                          </div>
                                        )}
                                        {(!userProfiles[user.email]?.company && !userProfiles[user.email]?.job_title && !userProfiles[user.email]?.observations) && (
                                          <div className="text-gray-400 italic">No profile information yet</div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="text-gray-400 italic bg-gray-50 p-3 rounded border-2 border-dashed border-gray-200 text-center">
                                        Click &quot;Edit Profile&quot; to add admin context for this user
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                              
                              {/* Structured User Data */}
                              <div className="bg-white p-4 rounded-lg border-2 border-gray-100">
                                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                  📊 User Activity Breakdown
                                  {userActivityLoading[user.email] && (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                                  )}
                                </h4>
                                
                                {userActivityLoading[user.email] ? (
                                  <div className="text-center py-4">
                                    <div className="text-sm text-gray-600">Loading activity details...</div>
                                  </div>
                                ) : userActivityDetails[user.email] ? (
                                  <div className="space-y-4">
                                    {/* Key Stats */}
                                    <div className="grid grid-cols-4 gap-3">
                                      <div className="bg-blue-50 p-2 rounded text-center">
                                        <div className="text-xs text-gray-600">New Artists Created</div>
                                        <div className="text-sm font-medium">{userActivityDetails[user.email].newArtistsCreated}</div>
                                      </div>
                                      <div className="bg-green-50 p-2 rounded text-center">
                                        <div className="text-xs text-gray-600">Total Rooms</div>
                                        <div className="text-sm font-medium">{userActivityDetails[user.email].totalRooms}</div>
                                      </div>
                                      <div className="bg-purple-50 p-2 rounded text-center">
                                        <div className="text-xs text-gray-600">Messages</div>
                                        <div className="text-sm font-medium">{user.messages}</div>
                                      </div>
                                      <div className="bg-orange-50 p-2 rounded text-center">
                                        <div className="text-xs text-gray-600">Reports</div>
                                        <div className="text-sm font-medium">{user.reports}</div>
                                      </div>
                                    </div>

                                    {/* Artist Usage Ranking */}
                                    {userActivityDetails[user.email].artistUsage.length > 0 && (
                                      <div>
                                        <h5 className="text-sm font-medium text-gray-700 mb-2">🎭 Artists Used (Ranked by Activity)</h5>
                                        <div className="space-y-2 max-h-40 overflow-y-auto">
                                          {userActivityDetails[user.email].artistUsage.slice(0, 5).map((artist, idx) => (
                                            <div key={artist.artistId} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                                              <div className="flex items-center gap-2">
                                                <span className="font-medium text-gray-500">#{idx + 1}</span>
                                                <span className="font-medium">{artist.artistName}</span>
                                              </div>
                                                                                             <div className="flex gap-3 text-xs text-gray-600">
                                                 <span>{artist.rooms} rooms</span>
                                                 <span>{artist.messages} msgs</span>
                                                 <span>{artist.reports} reports</span>
                                               </div>
                                            </div>
                                          ))}
                                          {userActivityDetails[user.email].artistUsage.length > 5 && (
                                            <div className="text-xs text-gray-500 text-center">
                                              ...and {userActivityDetails[user.email].artistUsage.length - 5} more artists
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}

                                    {/* Topics Preview */}
                                    {(() => {
                                      const allTopics = userActivityDetails[user.email].artistUsage
                                        .flatMap(artist => artist.topics)
                                        .filter(topic => topic && topic.trim() !== '');
                                      
                                      if (allTopics.length > 0) {
                                        const uniqueTopics = [...new Set(allTopics)];
                                        return (
                                          <div>
                                            <h5 className="text-sm font-medium text-gray-700 mb-2">💭 Recent Topics</h5>
                                            <div className="flex flex-wrap gap-1">
                                              {uniqueTopics.slice(0, 6).map((topic, idx) => (
                                                <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">
                                                  {topic.length > 25 ? `${topic.substring(0, 25)}...` : topic}
                                                </span>
                                              ))}
                                              {uniqueTopics.length > 6 && (
                                                <span className="px-2 py-1 bg-gray-100 text-gray-500 rounded-full text-xs">
                                                  +{uniqueTopics.length - 6} more
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                ) : (
                                  <div className="text-center py-4">
                                    <div className="text-sm text-gray-500">Click to expand for detailed activity breakdown</div>
                                  </div>
                                )}
                              </div>

                              {/* AI Analysis Results */}
                              <div className="bg-white p-4 rounded-lg border-2 border-blue-100">
                                <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                                  🧠 AI Behavioral Analysis
                                  {userAnalysisLoading[user.email] && (
                                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                                  )}
                                </h4>

                                {userAnalysisLoading[user.email] ? (
                                  <div className="text-center text-gray-500 py-4">Analyzing...</div>
                                ) : userAnalysisErrors[user.email] ? (
                                  <div className="text-center text-red-500 py-4">Error: {userAnalysisErrors[user.email]}</div>
                                ) : userAnalysisResults[user.email] ? (
                                  (() => {
                                    const analysis = userAnalysisResults[user.email];
                                    if (!analysis) return null;
                                    return (
                                      <div className="space-y-4">
                                        {/* User Profile and Key Metrics */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                                          <div className="bg-blue-50 p-3 rounded-lg">
                                            <div className="text-xs font-semibold text-gray-500 mb-1">Profile</div>
                                            <div className="text-sm font-medium text-gray-800">{analysis.user_profile}</div>
                                          </div>
                                          <div className="bg-green-50 p-3 rounded-lg">
                                            <div className="text-xs font-semibold text-gray-500 mb-1">Satisfaction</div>
                                            <div className="text-sm font-medium text-gray-800 capitalize">{analysis.satisfaction_level}</div>
                                          </div>
                                          <div className="bg-purple-50 p-3 rounded-lg">
                                            <div className="text-xs font-semibold text-gray-500 mb-1">Engagement</div>
                                            <div className="text-sm font-medium text-gray-800 capitalize">{analysis.engagement_level}</div>
                                          </div>
                                        </div>

                                        {/* Key Insights */}
                                        <div className="mt-4">
                                          <h5 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                                              <path fillRule="evenodd" d="M10 20a10 10 0 100-20 10 10 0 000 20zm-5-8a1 1 0 00-1 1v1a1 1 0 102 0v-1a1 1 0 00-1-1zm3 0a1 1 0 00-1 1v1a1 1 0 102 0v-1a1 1 0 00-1-1zm3 0a1 1 0 00-1 1v1a1 1 0 102 0v-1a1 1 0 00-1-1zm3 0a1 1 0 00-1 1v1a1 1 0 102 0v-1a1 1 0 00-1-1zM5 6a1 1 0 00-1 1v1a1 1 0 102 0V7a1 1 0 00-1-1zm3 0a1 1 0 00-1 1v1a1 1 0 102 0V7a1 1 0 00-1-1zm3 0a1 1 0 00-1 1v1a1 1 0 102 0V7a1 1 0 00-1-1zm3 0a1 1 0 00-1 1v1a1 1 0 102 0V7a1 1 0 00-1-1z" clipRule="evenodd" />
                                            </svg>
                                            Key Insights
                                          </h5>
                                          <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                                            {analysis.key_insights.map((insight, i) => <li key={i}>{insight}</li>)}
                                          </ul>
                                        </div>

                                        {/* Use Cases & Themes */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                          <div>
                                            <h5 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm14 0H4v10h12V5zM6 7a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm0 4a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1z" clipRule="evenodd" />
                                              </svg>
                                              Use Cases
                                            </h5>
                                            <div className="flex flex-wrap gap-2">
                                              {analysis.primary_use_cases.map((useCase, i) => (
                                                <span key={i} className="bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded-full">{useCase}</span>
                                              ))}
                                            </div>
                                          </div>
                                          <div>
                                            <h5 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500" viewBox="0 0 20 20" fill="currentColor">
                                                <path d="M10 2a6 6 0 00-6 6c0 1.887.863 3.613 2.257 4.773.305.254.622.49.95.709a1 1 0 001.209-.23l.3-.402a1 1 0 00.174-.533C8.61 12.333 8.5 11.18 8.5 10c0-1.883.86-3.606 2.247-4.762a1 1 0 00-.23-1.209l-.402-.3c-.328-.245-.72-.37-1.115-.37zM10 18a6 6 0 006-6c0-1.887-.863-3.613-2.257-4.773a1.002 1.002 0 00-1.159.231l-.3.402a1 1 0 00-.174.533c.278.854.39 1.745.39 2.607 0 1.883-.86 3.606-2.247 4.762a1 1 0 00.23 1.209l.402.3c.328.245.72.37 1.115.37z" />
                                              </svg>
                                              Themes
                                            </h5>
                                            <div className="flex flex-wrap gap-2">
                                              {analysis.conversation_themes.map((theme, i) => (
                                                <span key={i} className="bg-gray-100 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded-full">{theme}</span>
                                              ))}
                                            </div>
                                          </div>
                                        </div>

                                        {/* Top Recommendations */}
                                        {analysis.top_recommendations && analysis.top_recommendations.length > 0 && (
                                          <div className="mt-4">
                                            <h5 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zM10 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zM5.522 6.22a.75.75 0 011.06 0l1.061 1.06a.75.75 0 01-1.06 1.06l-1.06-1.06a.75.75 0 010-1.06zM12.358 12.358a.75.75 0 011.06 0l1.061 1.06a.75.75 0 01-1.06 1.06l-1.06-1.06a.75.75 0 010-1.06zM2 10a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 012 10zM15 10a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5A.75.75 0 0115 10zM5.522 13.78a.75.75 0 010-1.06l1.06-1.061a.75.75 0 111.06 1.06l-1.06 1.06a.75.75 0 01-1.06 0zM12.358 7.642a.75.75 0 010-1.06l1.06-1.061a.75.75 0 111.06 1.06l-1.06 1.06a.75.75 0 01-1.06 0z" clipRule="evenodd" />
                                                <path d="M10 4a6 6 0 100 12 6 6 0 000-12zM8.5 7.5a.5.5 0 00-1 0v5a.5.5 0 001 0v-5zM11.5 7.5a.5.5 0 00-1 0v5a.5.5 0 001 0v-5z" />
                                              </svg>
                                              Top Recommendations
                                            </h5>
                                            <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                                              {analysis.top_recommendations.map((rec, i) => <li key={i}>{rec}</li>)}
                                            </ul>
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })()
                                ) : (
                                  <div className="text-center py-4">
                                    <div className="text-sm text-gray-500">Click to expand for automatic AI analysis</div>
                                  </div>
                                )}
                              </div>

                              {/* Collapsible section for detailed activity */}
                              <div className="mt-4">
                                <button
                                  onClick={() => setExpandedUser(null)}
                                  className="text-blue-500 hover:underline"
                                >
                                  {expandedUser ? 'Collapse' : 'Expand'} detailed activity
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                        ))}


                      </div>
                    );
                  })()}
                  
                  {(() => {
                    // Check if we have any data to show
                    const hasMessages = Object.keys(messagesByUser).length > 0;
                    const hasReports = Object.keys(segmentReportsByUser).length > 0;
                    
                    if (!hasMessages && !hasReports) {
                      return (
                        <div className="text-center text-gray-500 py-8">
                          No user activity data available for the selected time period.
                        </div>
                      );
                    }
                    
                    return null;
                  })()}
                </div>
              )}
            </div>

            {/* Conversation Management Section */}
            <div className="bg-white rounded-2xl shadow-md p-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-semibold">Conversation Management</h2>
                  <div className="text-sm text-gray-600">
                    {totalCount.toLocaleString()} conversations • {totalUniqueUsers.toLocaleString()} users
                  </div>
                </div>
                <div className="lg:max-w-lg lg:mr-4">
                  <AdvancedConversationFilters
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    excludeTestEmails={excludeTestEmails}
                    onToggleTestEmails={setExcludeTestEmails}
                    onManageTestEmails={() => setShowTestEmailPopup(true)}
                  />
                </div>
              </div>

              <UserFilter
                selectedUserFilter={selectedUserFilter}
                onClearFilter={() => {
                  setSelectedUserFilter(null);
                  setSearchQuery(''); // Also clear search query
                }}
              />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ConversationList
                  conversations={conversations}
                  loading={loading}
                  error={error}
                  selectedConversation={selectedConversation}
                  onConversationSelect={setSelectedConversation}
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />

                <ConversationDetailComponent
                  conversationDetail={conversationDetail}
                  selectedConversation={selectedConversation}
                  loading={!selectedConversation ? false : !conversationDetail}
                />
              </div>
            </div>
          </div>
      
      {/* Test Email Management Popup */}
      <Modal isOpen={showTestEmailPopup} onClose={() => setShowTestEmailPopup(false)}>
        <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
          <h2 className="text-xl font-bold mb-4">Manage Test Emails</h2>
          
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-2">
              Emails listed here will be excluded from metrics when &quot;Exclude test emails&quot; is enabled.
            </p>
            
            <div className="flex gap-2 mb-4">
              <input
                type="email"
                placeholder="Add test email"
                className="flex-1 p-2 border rounded"
                value={newTestEmail}
                onChange={(e) => setNewTestEmail(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    addTestEmail();
                  }
                }}
              />
              <button
                type="button"
                onClick={addTestEmail}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                disabled={!newTestEmail || isLoadingTestEmails}
              >
                Add
              </button>
            </div>
            
            {testEmailError && (
              <div className="text-red-500 text-sm mb-2">{testEmailError}</div>
            )}
            
            <div className="space-y-2">
              {testEmails.length === 0 ? (
                <p className="text-gray-500 text-sm">No test emails configured</p>
              ) : (
                testEmails.map((email) => (
                  <div key={email} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                    <span className="text-sm">{email}</span>
                    <button
                      type="button"
                      onClick={() => removeTestEmail(email)}
                      className="text-red-500 hover:text-red-700"
                      disabled={isLoadingTestEmails}
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
          
          <div className="flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={() => setShowTestEmailPopup(false)}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* Annotation Modal */}
      <Modal isOpen={showAnnotationModal} onClose={() => setShowAnnotationModal(false)}>
        <div className="bg-white rounded-lg p-6 max-w-md w-full">
          <h3 className="text-lg font-semibold mb-4">Add Annotation</h3>
          <textarea
            className="w-full p-2 border rounded mb-4 h-24"
            placeholder="Event description..."
            value={annotationModalDescription}
            onChange={(e) => setAnnotationModalDescription(e.target.value)}
          />
          {saveAnnotationError && (
            <p className="text-red-500 text-sm mb-2">{saveAnnotationError}</p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAnnotationModal(false)}
              className="px-4 py-2 border rounded hover:bg-gray-100"
              disabled={isSavingAnnotation}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAnnotation}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-blue-300"
              disabled={isSavingAnnotation || !annotationModalDescription}
            >
              {isSavingAnnotation ? 'Saving...' : 'Save Annotation'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Error Details Modal */}
      {showErrorPopup && userErrorDetails[showErrorPopup] && userErrorDetails[showErrorPopup].length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 error-popup-container">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                Error Details - {showErrorPopup}
              </h3>
              <button
                onClick={() => setShowErrorPopup(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>
            
            {/* Modal Content */}
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="mb-4 text-sm text-gray-600">
                Showing {userErrorDetails[showErrorPopup].length} error{userErrorDetails[showErrorPopup].length !== 1 ? 's' : ''} for this user
              </div>
              
              <div className="space-y-4">
                {userErrorDetails[showErrorPopup].map((error) => (
                  <div key={error.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    {/* Error Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
                          {error.tool_name || 'Unknown Tool'}
                        </span>
                        <span className="px-3 py-1 bg-red-100 text-red-800 text-sm font-medium rounded-full">
                          {error.error_type || 'Unknown Type'}
                        </span>
                      </div>
                      <span className="text-gray-500 text-sm">
                        {new Date(error.error_timestamp).toLocaleString()}
                      </span>
                    </div>
                    
                    {/* Error Message */}
                    <div className="mb-3">
                      <h4 className="font-medium text-gray-900 mb-2">Error Message:</h4>
                      <p className="text-sm text-gray-700 bg-white p-3 rounded border leading-relaxed">
                        {error.error_message || 'No error message available'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Modal Footer */}
            <div className="flex justify-end p-6 border-t border-gray-200 bg-gray-50">
              <button
                onClick={() => setShowErrorPopup(null)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
} 