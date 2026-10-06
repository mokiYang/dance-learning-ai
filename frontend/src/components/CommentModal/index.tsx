import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { apiService } from '../../services/api';
import { showToast } from '../Toast/ToastContainer';
import './index.less';

interface Comment {
  id: number;
  video_id: string;
  video_type: string;
  user_id: number;
  username: string;
  content: string;
  created_at: string;
}

interface CommentModalProps {
  videoId: string;
  videoType: 'reference' | 'user';
  onClose: () => void;
  onCommentSubmit?: () => void;
}

const CommentModal: React.FC<CommentModalProps> = ({
  videoId,
  videoType,
  onClose,
  onCommentSubmit,
}) => {
  const { t, i18n } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchComments();
  }, [videoId, videoType]);

  const fetchComments = async () => {
    try {
      setLoading(true);
      const response = await apiService.getComments(videoId, videoType);
      if (response.success) {
        setComments(response.comments || []);
      }
    } catch (error) {
      console.error('获取评论失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!commentText.trim() || !isAuthenticated) {
      return;
    }

    try {
      setSubmitting(true);
      const response = await apiService.addComment(videoId, videoType, commentText);
      if (response.success) {
        setCommentText('');
        await fetchComments();
        if (onCommentSubmit) {
          onCommentSubmit();
        }
      } else {
        showToast(response.error || t('comments.failed'), 'error');
      }
    } catch (error: any) {
      console.error('提交评论失败:', error);
      showToast(error?.message || t('comments.networkFailed'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="comment-modal-backdrop" onClick={handleBackdropClick}>
      <div className="comment-modal" onClick={(e) => e.stopPropagation()}>
        <div className="comment-modal-header">
          <h3>{t('comments.title', { count: comments.length })}</h3>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="comment-modal-content">
          {loading ? (
            <div className="loading">{t('common.loading')}</div>
          ) : comments.length === 0 ? (
            <div className="empty-comments">{t('comments.empty')}</div>
          ) : (
            <div className="comments-list">
              {comments.map((comment) => (
                <div key={comment.id} className="comment-item">
                  <div className="comment-header">
                    <span className="comment-username">{comment.username}</span>
                    <span className="comment-time">
                      {new Date(comment.created_at).toLocaleString(i18n.resolvedLanguage)}
                    </span>
                  </div>
                  <div className="comment-content">{comment.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {isAuthenticated ? (
          <div className="comment-input-section">
            <textarea
              className="comment-textarea"
              placeholder={t('comments.placeholder')}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              rows={3}
            />
            <button
              className="submit-button"
              onClick={handleSubmit}
              disabled={!commentText.trim() || submitting}
            >
              {t(submitting ? 'comments.submitting' : 'comments.publish')}
            </button>
          </div>
        ) : (
          <div className="comment-login-prompt">
            {t('comments.loginPrompt')}
          </div>
        )}
      </div>
    </div>
  );
};

export default CommentModal;
