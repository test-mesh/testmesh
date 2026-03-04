'use client';

import { useState } from 'react';
import { MessageSquare, Plus, Trash2, Edit2, User, Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface Comment {
  id: string;
  author: string;
  content: string;
  timestamp: string;
  edited?: boolean;
  editedAt?: string;
  replies?: Comment[];
}

export interface CommentPanelProps {
  nodeId: string;
  nodeName: string;
  comments: Comment[];
  onChange: (comments: Comment[]) => void;
  className?: string;
}

export default function CommentPanel({
  nodeId,
  nodeName,
  comments = [],
  onChange,
  className,
}: CommentPanelProps) {
  const [newComment, setNewComment] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [authorName, setAuthorName] = useState(
    typeof window !== 'undefined' ? localStorage.getItem('testmesh_author_name') || 'Anonymous' : 'Anonymous'
  );

  const generateId = () => `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const handleAddComment = () => {
    if (!newComment.trim()) return;

    const comment: Comment = {
      id: generateId(),
      author: authorName,
      content: newComment.trim(),
      timestamp: new Date().toISOString(),
      replies: [],
    };

    onChange([...comments, comment]);
    setNewComment('');
  };

  const handleDeleteComment = (commentId: string) => {
    onChange(comments.filter((c) => c.id !== commentId));
  };

  const handleEditComment = (commentId: string) => {
    const comment = comments.find((c) => c.id === commentId);
    if (!comment) return;

    setEditingId(commentId);
    setEditContent(comment.content);
  };

  const handleSaveEdit = (commentId: string) => {
    if (!editContent.trim()) return;

    onChange(
      comments.map((c) =>
        c.id === commentId
          ? {
              ...c,
              content: editContent.trim(),
              edited: true,
              editedAt: new Date().toISOString(),
            }
          : c
      )
    );

    setEditingId(null);
    setEditContent('');
  };

  const handleAddReply = (parentId: string) => {
    if (!replyContent.trim()) return;

    const reply: Comment = {
      id: generateId(),
      author: authorName,
      content: replyContent.trim(),
      timestamp: new Date().toISOString(),
    };

    onChange(
      comments.map((c) =>
        c.id === parentId
          ? {
              ...c,
              replies: [...(c.replies || []), reply],
            }
          : c
      )
    );

    setReplyingTo(null);
    setReplyContent('');
  };

  const handleDeleteReply = (parentId: string, replyId: string) => {
    onChange(
      comments.map((c) =>
        c.id === parentId
          ? {
              ...c,
              replies: (c.replies || []).filter((r) => r.id !== replyId),
            }
          : c
      )
    );
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const handleAuthorNameChange = (name: string) => {
    setAuthorName(name);
    if (typeof window !== 'undefined') {
      localStorage.setItem('testmesh_author_name', name);
    }
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b">
        <MessageSquare className="h-4 w-4 text-blue-500" />
        <div className="flex-1">
          <div className="text-sm font-medium">Comments</div>
          <div className="text-xs text-muted-foreground">{nodeName}</div>
        </div>
        <div className="text-xs text-muted-foreground">
          {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
        </div>
      </div>

      {/* Author Name */}
      <div className="py-3 border-b">
        <label className="text-xs text-muted-foreground mb-1 block">Your Name</label>
        <Input
          value={authorName}
          onChange={(e) => handleAuthorNameChange(e.target.value)}
          placeholder="Enter your name"
          className="h-7 text-xs"
        />
      </div>

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto py-3 space-y-4">
        {comments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No comments yet</p>
            <p className="text-xs mt-1">Add the first comment below</p>
          </div>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="space-y-2">
              {/* Main Comment */}
              <div className="p-3 border rounded-lg bg-card">
                <div className="flex items-start gap-2 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-medium">{comment.author}</span>
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {formatTimestamp(comment.timestamp)}
                      </span>
                      {comment.edited && (
                        <span className="text-xs text-muted-foreground italic">
                          (edited {comment.editedAt ? formatTimestamp(comment.editedAt) : ''})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleEditComment(comment.id)}
                      className="h-6 w-6 p-0"
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteComment(comment.id)}
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {editingId === comment.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="min-h-[60px] text-xs"
                      placeholder="Edit comment..."
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleSaveEdit(comment.id)}
                        className="h-6 text-xs"
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingId(null);
                          setEditContent('');
                        }}
                        className="h-6 text-xs"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setReplyingTo(comment.id)}
                      className="h-6 text-xs mt-2"
                    >
                      Reply
                    </Button>
                  </>
                )}
              </div>

              {/* Replies */}
              {comment.replies && comment.replies.length > 0 && (
                <div className="ml-6 space-y-2">
                  {comment.replies.map((reply) => (
                    <div key={reply.id} className="p-2 border rounded bg-muted/30">
                      <div className="flex items-start gap-2 mb-1">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <User className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs font-medium">{reply.author}</span>
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(reply.timestamp)}
                            </span>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteReply(comment.id, reply.id)}
                          className="h-5 w-5 p-0 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <p className="text-xs whitespace-pre-wrap">{reply.content}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply Input */}
              {replyingTo === comment.id && (
                <div className="ml-6 space-y-2">
                  <Textarea
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="Write a reply..."
                    className="min-h-[60px] text-xs"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleAddReply(comment.id)}
                      className="h-6 text-xs"
                    >
                      Reply
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setReplyingTo(null);
                        setReplyContent('');
                      }}
                      className="h-6 text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* New Comment Input */}
      <div className="pt-3 border-t space-y-2">
        <Textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          className="min-h-[80px] text-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              handleAddComment();
            }
          }}
        />
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">
            Press {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter to submit
          </span>
          <Button size="sm" onClick={handleAddComment} className="gap-2">
            <Plus className="h-3 w-3" />
            Add Comment
          </Button>
        </div>
      </div>
    </div>
  );
}

// Dialog wrapper for standalone use
export function CommentDialog({
  open,
  onOpenChange,
  nodeId,
  nodeName,
  comments,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string;
  nodeName: string;
  comments: Comment[];
  onChange: (comments: Comment[]) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-blue-500" />
            Comments: {nodeName}
          </DialogTitle>
          <DialogDescription>
            Collaborate with your team by adding comments and discussions to this step.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          <CommentPanel
            nodeId={nodeId}
            nodeName={nodeName}
            comments={comments}
            onChange={onChange}
            className="h-full"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
