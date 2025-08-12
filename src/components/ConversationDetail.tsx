/**
 * ConversationDetail component: displays the details of a selected conversation
 * @param conversationDetail - The conversation detail object with messages
 * @param selectedConversation - The selected conversation ID 
 * @param loading - Whether the conversation detail is loading
 */
import React from 'react';
import ReactMarkdown from 'react-markdown';
import type { ConversationDetail, Message } from '@/lib/conversationService';

export interface ConversationDetailProps {
  conversationDetail: ConversationDetail | null;
  selectedConversation: string | null;
  loading: boolean;
}

const ConversationDetailComponent: React.FC<ConversationDetailProps> = ({
  conversationDetail,
  selectedConversation,
  loading
}) => {
  if (!selectedConversation) {
    return (
      <div>
        <h3 className="font-medium text-gray-900 mb-4">Conversation Details</h3>
        <div className="border border-gray-200 rounded-lg p-4 text-center text-gray-500">
          Select a conversation to view details
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div>
        <h3 className="font-medium text-gray-900 mb-4">Conversation Details</h3>
        <div className="border border-gray-200 rounded-lg p-4 text-center text-gray-500">
          Loading conversation details...
        </div>
      </div>
    );
  }

  if (!conversationDetail) {
    return (
      <div>
        <h3 className="font-medium text-gray-900 mb-4">Conversation Details</h3>
        <div className="border border-gray-200 rounded-lg p-4 text-center text-gray-500">
          Conversation not found or access denied
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-gray-900">Conversation Details</h3>
        {/* External chat link */}
        {conversationDetail?.room_id && (
          <a
            href={`https://chat.recoupable.com/chat/${conversationDetail.room_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 underline"
            title="Open in Recoup Chat"
          >
            Open in Chat
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M5 4a1 1 0 011-1h9a1 1 0 011 1v9a1 1 0 11-2 0V6.414l-9.293 9.293a1 1 0 01-1.414-1.414L12.586 5H6a1 1 0 01-1-1z" />
            </svg>
          </a>
        )}
      </div>
      <div className="border border-gray-200 rounded-lg p-4 max-h-96 overflow-y-auto">
        <div className="mb-4">
          <h4 className="font-medium text-gray-900">{conversationDetail.topic || 'Untitled'}</h4>
          <p className="text-sm text-gray-600">{conversationDetail.account_email}</p>
          <p className="text-xs text-gray-500">
            Started: {conversationDetail.messages.length > 0 ? 
              new Date(conversationDetail.messages[0].created_at).toLocaleDateString() : 
              'Unknown'}
          </p>
        </div>
        
        <div className="space-y-4">
          {conversationDetail.messages.map((message: Message, index: number) => (
            <div
              key={index}
              className={`p-3 rounded-lg ${
                message.role === 'user'
                  ? 'bg-blue-50 border-l-4 border-blue-400'
                  : 'bg-gray-50 border-l-4 border-gray-400'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  {message.role === 'user' ? 'User' : 'Assistant'}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(message.created_at).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-sm text-gray-700">
                {message.role === 'user' ? (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                ) : (
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ConversationDetailComponent; 