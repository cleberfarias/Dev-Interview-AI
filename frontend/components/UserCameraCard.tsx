import React, { useEffect, useRef } from 'react';
import styles from './UserCameraCard.module.css';

interface UserCameraCardProps {
  label: string;
  badge?: string;
  isRecording?: boolean;
  stream?: MediaStream | null;
  isReady?: boolean;
  error?: string | null;
  compact?: boolean;
}

const UserCameraCard: React.FC<UserCameraCardProps> = ({
  label,
  badge = 'CAMERA LIGADA',
  isRecording = false,
  stream,
  isReady = false,
  error,
  compact = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const showVideo = Boolean(stream) && isReady && !error;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (showVideo) {
      video.srcObject = stream ?? null;
    } else {
      video.srcObject = null;
    }
    return () => {
      video.srcObject = null;
    };
  }, [stream, showVideo]);

  const showOverlay = compact;

  return (
    <div className={`${styles.card} ${compact ? styles.compact : ''}`} aria-label="Camera do usuario">
      {!compact && (
        <div className={styles.header}>
          <span className={styles.label}>{label}</span>
          <div className={styles.badges}>
            {isReady && !error && <span className={styles.badge}>{badge}</span>}
            {isRecording && <span className={`${styles.badge} ${styles.recordingBadge}`}>GRAVANDO</span>}
          </div>
        </div>
      )}
      <div className={styles.preview} aria-label="Preview da camera">
        {showVideo ? (
          <video ref={videoRef} autoPlay muted playsInline className={styles.video} />
        ) : (
          <div className={styles.placeholder}>
            <span>CAMERA</span>
          </div>
        )}
        {showOverlay && (
          <div className={styles.overlay}>
            <span className={styles.overlayLabel}>{label}</span>
            <div className={styles.overlayBadges}>
              {isReady && !error && <span className={styles.overlayBadge}>{badge}</span>}
              {isRecording && (
                <span className={`${styles.overlayBadge} ${styles.recordingBadge}`}>GRAVANDO</span>
              )}
            </div>
          </div>
        )}
      </div>
      {error && <div className={styles.errorText}>{error}</div>}
    </div>
  );
};

export default UserCameraCard;
