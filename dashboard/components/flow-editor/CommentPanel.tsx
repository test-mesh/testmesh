'use client';

import { useState } from 'react';
import { MessageSquare, Plus, Trash2, Edit2, User, Clock } from 'lucide-react';
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
    onChange([...comments, {
      id: generateId(),
      author: authorName,
      content: newComment.trim(),
      timestamp: new Date().toISOString(),
      replies: [],
    }]);
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
    onChange(comments.map((c) =>
      c.id === commentId
        ? { ...c, content: editContent.trim(), edited: true, editedAt: new Date().toISOString() }
        : c
    ));
    setEditingId(null);
    setEditContent('');
  };

  const handleAddReply = (parentId: string) => {
    if (!replyContent.trim()) return;
    onChange(comments.map((c) =>
      c.id === parentId
        ? { ...c, replies: [...(c.replies || []), { id: generateId(), author: authorName, content: replyContent.trim(), timestamp: new Date().toISOString() }] }
        : c
    ));
    setReplyingTo(null);
    setReplyContent('');
  };

  const handleDeleteReply = (parentId: string, replyId: string) => {
    onChange(comments.map((c) =>
      c.id === parentId ? { ...c, replies: (c.replies || []).filter((r) => r.id !== replyId) } : c
    ));
  };

  const formatTimestamp = (timestamp: string) => {
    const diffMs = Date.now() - new Date(timestamp).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  const handleAuthorNameChange = (name: string) => {
    setAuthorName(name);
    if (typeof window !== 'undefined') localStorage.setItem('testmesh_author_name', name);
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 border-b border-[#1a2332]">
        <MessageSquare className="h-4 w-4 text-teal-400" />
        <div className="flex-1">
          <div className="text-sm font-medium text-[#c8dce8]">Comments</div>
          <div className="text-xs text-[#4a6480]">{nodeName}</div>
        </div>
        <div className="text-xs text-[#3d5670]">
          {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
        </div>
      </div>

      {/* Author Name */}
      <div className="py-3 border-b border-[#1a2332]">
        <label className="text-[10px] text-[#4a6480] mb-1 block">Your Name</label>
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
          <div className="text-center py-8 text-[#3d5670]">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No comments yet</p>
            <p className="text-xs mt-1">Add the first comment below</p>
          </div>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="space-y-2">
              <div className="p-3 border border-[#1e2d3d] rounded-lg bg-[#0f1923]">
                <div className="flex items-start gap-2 mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <User className="h-3 w-3 text-[#4a6480]" />
                      <span className="text-xs font-medium text-[#c8dce8]">{comment.author}</span>
                      <Clock className="h-3 w-3 text-[#4a6480]" />
                      <span className="text-xs text-[#4a6480]">{formatTimestamp(comment.timestamp)}</span>
                      {comment.edited && (
                        <span className="text-[10px] text-[#3d5670] italic">
                          (edited {comment.editedAt ? formatTimestamp(comment.editedAt) : ''})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEditComment(comment.id)}
                      className="flex items-center justify-center h-6 w-6 rounded text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleDeleteComment(comment.id)}
                      className="flex items-center justify-center h-6 w-6 rounded text-[#4a6480] hover:text-red-400 hover:bg-[#1a2d3d] transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
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
                      <button
                        onClick={() => handleSaveEdit(comment.id)}
                        className="flex items-center h-6 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setEditingId(null); setEditContent(''); }}
                        className="flex items-center h-6 px-3 rounded-lg text-xs text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-[#7fa8c8] whitespace-pre-wrap">{comment.content}</p>
                    <button
                      onClick={() => setReplyingTo(comment.id)}
                      className="flex items-center h-6 px-2 rounded text-[10px] text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] mt-2 transition-colors"
                    >
                      Reply
                    </button>
                  </>
                )}
              </div>

              {comment.replies && comment.replies.length > 0 && (
                <div className="ml-5 border-l-2 border-[#1a2332] pl-3 space-y-2">
                  {comment.replies.map((reply) => (
                    <div key={reply.id} className="p-2 border border-[#1e2d3d] rounded-lg bg-[#0f1923]">
                      <div className="flex items-start gap-2 mb-1">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <User className="h-3 w-3 text-[#4a6480]" />
                            <span className="text-xs font-medium text-[#c8dce8]">{reply.author}</span>
                            <Clock className="h-3 w-3 text-[#4a6480]" />
                            <span className="text-xs text-[#4a6480]">{formatTimestamp(reply.timestamp)}</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteReply(comment.id, reply.id)}
                          className="flex items-center justify-center h-5 w-5 rounded text-[#4a6480] hover:text-red-400 hover:bg-[#1a2d3d] transition-colors"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                      <p className="text-xs text-[#7fa8c8] whitespace-pre-wrap">{reply.content}</p>
                    </div>
                  ))}
                </div>
              )}

              {replyingTo === comment.id && (
                <div className="ml-5 border-l-2 border-[#1a2332] pl-3 space-y-2">
                  <Textarea
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="Write a reply..."
                    className="min-h-[60px] text-xs"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAddReply(comment.id)}
                      className="flex items-center h-6 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors"
                    >
                      Reply
                    </button>
                    <button
                      onClick={() => { setReplyingTo(null); setReplyContent(''); }}
                      className="flex items-center h-6 px-3 rounded-lg text-xs text-[#4a6480] hover:text-[#7fa8c8] hover:bg-[#1a2d3d] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* New Comment */}
      <div className="pt-3 border-t border-[#1a2332] space-y-2">
        <Textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          className="min-h-[80px] text-xs"
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddComment(); }}
        />
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-[#3d5670]">
            Press {typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter to submit
          </span>
          <button
            onClick={handleAddComment}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg text-xs font-medium bg-teal-400 text-[#0b0f18] hover:bg-teal-300 transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add Comment
          </button>
        </div>
      </div>
    </div>
  );
}

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
            <MessageSquare className="h-5 w-5 text-teal-400" />
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
