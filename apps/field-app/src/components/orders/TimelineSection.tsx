'use client';

import { useState, useCallback } from 'react';
import type { TimelineEvent } from '@/hooks/useOrderForm';

interface TimelineSectionProps {
  events: TimelineEvent[];
  onAddComment?: (comment: string) => void;
}

// Format event message based on type
function formatEventMessage(event: TimelineEvent): string {
  const metadata = event.metadata || {};

  switch (event.eventType) {
    case 'draft_created':
      return 'Order created as draft';
    case 'submitted':
      return 'Order submitted for approval';
    case 'approved':
      return 'Order approved';
    case 'declined':
      return 'Order declined';
    case 'cancelled':
      return 'Order cancelled';
    case 'paid':
      return 'Order marked as paid';
    case 'refunded':
      return 'Order refunded';
    case 'comment':
      return '';
    case 'company_changed':
      return `Changed company from "${metadata.oldValue || 'none'}" to "${metadata.newValue}"`;
    case 'contact_changed':
      return `Changed contact from "${metadata.oldValue || 'none'}" to "${metadata.newValue}"`;
    case 'shipping_location_changed':
      return `Changed shipping location from "${metadata.oldValue || 'none'}" to "${metadata.newValue}"`;
    case 'line_item_added':
      return `Added ${metadata.quantity || 1}x ${metadata.productTitle}${
        metadata.variantTitle ? ` (${metadata.variantTitle})` : ''
      }`;
    case 'line_item_removed':
      return `Removed ${metadata.quantity || 1}x ${metadata.productTitle}${
        metadata.variantTitle ? ` (${metadata.variantTitle})` : ''
      }`;
    case 'line_item_quantity_changed':
      return `Changed quantity of ${metadata.productTitle}${
        metadata.variantTitle ? ` (${metadata.variantTitle})` : ''
      } from ${metadata.oldValue} to ${metadata.newValue}`;
    case 'promotion_applied':
      return `Applied promotion: ${metadata.promotionName}`;
    case 'promotion_removed':
      return `Removed promotion: ${metadata.promotionName}`;
    default:
      return event.eventType.replace(/_/g, ' ');
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getEventIcon(eventType: string): React.ReactNode {
  switch (eventType) {
    case 'draft_created':
    case 'submitted':
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case 'approved':
    case 'paid':
      return (
        <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'declined':
    case 'cancelled':
    case 'refunded':
      return (
        <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'comment':
      return (
        <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      );
    case 'line_item_added':
    case 'line_item_removed':
    case 'line_item_quantity_changed':
      return (
        <svg className="w-4 h-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
      );
    case 'promotion_applied':
    case 'promotion_removed':
      return (
        <svg className="w-4 h-4 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
      );
    default:
      return (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      );
  }
}

export function TimelineSection({ events, onAddComment }: TimelineSectionProps) {
  const [newComment, setNewComment] = useState('');
  const [isAddingComment, setIsAddingComment] = useState(false);

  const handleAddComment = useCallback(() => {
    if (newComment.trim() && onAddComment) {
      onAddComment(newComment.trim());
      setNewComment('');
      setIsAddingComment(false);
    }
  }, [newComment, onAddComment]);

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">Timeline</h2>
        {onAddComment && !isAddingComment && (
          <button
            type="button"
            onClick={() => setIsAddingComment(true)}
            className="text-sm text-primary-600 font-medium"
          >
            Add Comment
          </button>
        )}
      </div>

      {/* Add Comment Form */}
      {isAddingComment && onAddComment && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Write a comment..."
            rows={2}
            className="input resize-none mb-2"
            autoFocus
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAddComment}
              disabled={!newComment.trim()}
              className="btn-primary text-sm py-2"
            >
              Add Comment
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAddingComment(false);
                setNewComment('');
              }}
              className="btn-secondary text-sm py-2"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Timeline Events */}
      {events.length === 0 ? (
        <p className="text-center py-4 text-gray-500">No timeline events yet</p>
      ) : (
        <div className="space-y-3">
          {events
            .slice()
            .reverse()
            .map((event) => (
              <div
                key={event.id}
                className="p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-0.5">
                    {getEventIcon(event.eventType)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">
                        {event.authorName}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatDate(event.createdAt)}
                      </span>
                    </div>
                    {formatEventMessage(event) && (
                      <p className="text-sm text-gray-600 mt-0.5">
                        {formatEventMessage(event)}
                      </p>
                    )}
                    {event.comment && (
                      <div className="mt-2 p-2 bg-white rounded border border-gray-200">
                        <p className="text-sm text-gray-700 italic">
                          "{event.comment}"
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export default TimelineSection;
