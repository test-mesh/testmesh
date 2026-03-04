'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  useFlowComments,
  useCreateComment,
  useResolveComment,
  useUnresolveComment,
  useDeleteComment,
} from '@/lib/hooks/useCollaboration';
import type { FlowComment } from '@/lib/api/collaboration';
import {
  MessageSquare,
  Send,
  CheckCircle,
  Circle,
  Trash2,
  Reply,
  MoreHorizontal,
  RefreshCw,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface CommentThreadProps {
  flowId: string;
  currentUserId: string;
  currentUserName: string;
  currentUserAvatar?: string;
  includeResolved?: boolean;
  className?: string;
}

export function CommentThread({
  flowId,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  includeResolved = true,
  className,
}: CommentThreadProps) {
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');

  const { data, isLoading, refetch } = useFlowComments(flowId, includeResolved);
  const createComment = useCreateComment();
  const resolveComment = useResolveComment();
  const unresolveComment = useUnresolveComment();
  const deleteComment = useDeleteComment();

  const comments = data?.comments || [];
  const rootComments = comments.filter((c) => !c.parent_id);

  const handleSubmit = () => {
    if (!newComment.trim()) return;

    createComment.mutate(
      {
        flow_id: flowId,
        author_id: currentUserId,
        author_name: currentUserName,
        author_avatar: currentUserAvatar,
        content: newComment.trim(),
      },
      {
        onSuccess: () => {
          setNewComment('');
        },
      }
    );
  };

  const handleReply = (parentId: string) => {
    if (!replyContent.trim()) return;

    createComment.mutate(
      {
        flow_id: flowId,
        parent_id: parentId,
        author_id: currentUserId,
        author_name: currentUserName,
        author_avatar: currentUserAvatar,
        content: replyContent.trim(),
      },
      {
        onSuccess: () => {
          setReplyContent('');
          setReplyingTo(null);
        },
      }
    );
  };

  const handleResolve = (commentId: string) => {
    resolveComment.mutate({ id: commentId, flowId });
  };

  const handleUnresolve = (commentId: string) => {
    unresolveComment.mutate({ id: commentId, flowId });
  };

  const handleDelete = (commentId: string) => {
    if (confirm('Are you sure you want to delete this comment?')) {
      deleteComment.mutate({ id: commentId, flowId });
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Comments ({comments.length})
        </h3>
        <Button variant="ghost" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* New Comment Input */}
      <div className="flex gap-3">
        <Avatar className="h-8 w-8 shrink-0">
          {currentUserAvatar ? (
            <AvatarImage src={currentUserAvatar} alt={currentUserName} />
          ) : null}
          <AvatarFallback>{getInitials(currentUserName)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-2">
          <Textarea
            placeholder="Add a comment..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            rows={2}
            className="resize-none"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!newComment.trim() || createComment.isPending}
            >
              <Send className="h-4 w-4 mr-2" />
              Comment
            </Button>
          </div>
        </div>
      </div>

      <Separator />

      {/* Comment List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rootComments.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>No comments yet</p>
          <p className="text-sm">Be the first to comment on this flow</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rootComments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              flowId={flowId}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              currentUserAvatar={currentUserAvatar}
              replyingTo={replyingTo}
              replyContent={replyContent}
              setReplyingTo={setReplyingTo}
              setReplyContent={setReplyContent}
              onReply={handleReply}
              onResolve={handleResolve}
              onUnresolve={handleUnresolve}
              onDelete={handleDelete}
              getInitials={getInitials}
              isReplying={createComment.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface CommentItemProps {
  comment: FlowComment;
  flowId: string;
  currentUserId: string;
  currentUserName: string;
  currentUserAvatar?: string;
  replyingTo: string | null;
  replyContent: string;
  setReplyingTo: (id: string | null) => void;
  setReplyContent: (content: string) => void;
  onReply: (parentId: string) => void;
  onResolve: (id: string) => void;
  onUnresolve: (id: string) => void;
  onDelete: (id: string) => void;
  getInitials: (name: string) => string;
  isReplying: boolean;
}

function CommentItem({
  comment,
  flowId,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  replyingTo,
  replyContent,
  setReplyingTo,
  setReplyContent,
  onReply,
  onResolve,
  onUnresolve,
  onDelete,
  getInitials,
  isReplying,
}: CommentItemProps) {
  const isOwner = comment.author_id === currentUserId;

  return (
    <div className={cn('space-y-3', comment.resolved && 'opacity-60')}>
      <div className="flex gap-3">
        <Avatar className="h-8 w-8 shrink-0">
          {comment.author_avatar ? (
            <AvatarImage src={comment.author_avatar} alt={comment.author_name} />
          ) : null}
          <AvatarFallback>{getInitials(comment.author_name)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{comment.author_name}</span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </span>
            {comment.resolved && (
              <Badge variant="secondary" className="text-xs">
                <CheckCircle className="h-3 w-3 mr-1" />
                Resolved
              </Badge>
            )}
          </div>
          <p className="text-sm mt-1 whitespace-pre-wrap">{comment.content}</p>
          <div className="flex items-center gap-2 mt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
            >
              <Reply className="h-3 w-3 mr-1" />
              Reply
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2">
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {comment.resolved ? (
                  <DropdownMenuItem onClick={() => onUnresolve(comment.id)}>
                    <Circle className="h-4 w-4 mr-2" />
                    Mark as unresolved
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => onResolve(comment.id)}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Mark as resolved
                  </DropdownMenuItem>
                )}
                {isOwner && (
                  <DropdownMenuItem
                    className="text-red-600"
                    onClick={() => onDelete(comment.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Reply Input */}
      {replyingTo === comment.id && (
        <div className="ml-11 flex gap-3">
          <Avatar className="h-6 w-6 shrink-0">
            {currentUserAvatar ? (
              <AvatarImage src={currentUserAvatar} alt={currentUserName} />
            ) : null}
            <AvatarFallback className="text-xs">{getInitials(currentUserName)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-2">
            <Textarea
              placeholder="Write a reply..."
              value={replyContent}
              onChange={(e) => setReplyContent(e.target.value)}
              rows={2}
              className="resize-none text-sm"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setReplyingTo(null);
                  setReplyContent('');
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => onReply(comment.id)}
                disabled={!replyContent.trim() || isReplying}
              >
                Reply
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="ml-11 space-y-3 border-l-2 border-muted pl-4">
          {comment.replies.map((reply) => (
            <div key={reply.id} className="flex gap-3">
              <Avatar className="h-6 w-6 shrink-0">
                {reply.author_avatar ? (
                  <AvatarImage src={reply.author_avatar} alt={reply.author_name} />
                ) : null}
                <AvatarFallback className="text-xs">{getInitials(reply.author_name)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{reply.author_name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm mt-1 whitespace-pre-wrap">{reply.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
