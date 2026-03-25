import { useState, useRef, useEffect, memo } from 'react';
import { Input, Button, Space, Tooltip, message as antMessage, Upload, Image, Popover, Spin } from 'antd';
import {
  SendOutlined,
  PaperClipOutlined,
  CloseCircleOutlined,
  PlayCircleOutlined,
  FileOutlined,
  AudioOutlined,
  CameraOutlined,
  DeleteOutlined,
  LockOutlined,
  UnlockOutlined,
  SmileOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { useSelector, useDispatch } from 'react-redux';
import { addMessage, uploadChatMedia, sendMessageAPI } from '../../redux/slices/chatSlice';
import { useChatSocket } from '../../hooks/useChatSocket';
import { useTheme } from '../../hooks/useTheme';

const MessageInput = memo(function MessageInput() {
  const dispatch = useDispatch();
  const { theme } = useTheme();
  const [value, setValue] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [fileList, setFileList] = useState([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [slideOffset, setSlideOffset] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingIntervalRef = useRef(null);
  const touchStartXRef = useRef(0);
  const recordButtonRef = useRef(null);

  const { activeRoomId } = useSelector((s) => s.chat);
  const { user } = useSelector((s) => s.auth);
  const { sendMessage: sendSocketMessage, startTyping, stopTyping } = useChatSocket();

  const sendMessage = async (roomId, content, type = 'text', media = [], tempId) => {
    if (media.length > 0) {
      return dispatch(sendMessageAPI({ roomId, content, type, media, tempId })).unwrap();
    }
    return sendSocketMessage(roomId, content, media, tempId);
  };

  // ✅ Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      // Don't call stopTyping here - it causes infinite loop
    };
  }, []); // ✅ Empty deps - only run on mount/unmount

  // ✅ Clear typing timeout
  const clearTypingTimeout = () => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  };

  // ✅ Send typing indicator
  const sendTypingIndicator = () => {
    if (!activeRoomId || !value.trim()) return;

    startTyping(activeRoomId);
    clearTypingTimeout();

    typingTimeoutRef.current = setTimeout(() => {
      stopTyping(activeRoomId);
    }, 2000);
  };

  const handleSend = async () => {
    const trimmed = value.trim();
    if ((!trimmed && fileList.length === 0) || !activeRoomId || isSending) return;

    setIsSending(true);
    clearTypingTimeout();
    stopTyping(activeRoomId);

    try {
      let mediaUrls = [];

      if (fileList.length > 0) {
        const formData = new FormData();
        fileList.forEach(file => {
          const fileObj = file.originFileObj || file;
          if (!(fileObj instanceof File) && !(fileObj instanceof Blob)) {
            console.error('❌ Invalid file object:', fileObj);
            throw new Error('Invalid file object');
          }
          formData.append('files', fileObj, fileObj.name);
        });

        const uploadResult = await dispatch(uploadChatMedia(formData)).unwrap();
        mediaUrls = uploadResult.data.media.map(media => {
          if (media.type === 'audio' && media.mimeType?.includes('webm')) {
            return { ...media, type: 'voice', isVoiceNote: true };
          }
          return media;
        });
      }

      const messageType = mediaUrls.length > 0
        ? (mediaUrls[0].type === 'video' ? 'video'
          : mediaUrls[0].type === 'image' ? 'image'
            : mediaUrls[0].type === 'voice' ? 'voice'
              : mediaUrls[0].type === 'audio' ? 'audio'
                : 'file')
        : 'text';

      const tempId = `temp_${Date.now()}_${Math.random()}`;
      const optimisticMessage = {
        _id: tempId,
        roomId: activeRoomId,
        content: trimmed || '',
        type: messageType,
        media: mediaUrls,
        senderId: user._id,
        sender: {
          _id: user._id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          role: user.role,
        },
        status: 'sending', // ✅ Show loading indicator
        optimistic: true,
        createdAt: new Date().toISOString(),
      };

      dispatch(addMessage({ roomId: activeRoomId, message: optimisticMessage }));

      await sendMessage(activeRoomId, trimmed || '', messageType, mediaUrls, tempId);

      setValue('');
      setFileList([]);
      inputRef.current?.focus();
    } catch (error) {
      console.error('Failed to send message:', error);
      antMessage.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  // ✅ Handle keyboard events
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !isComposing && !isSending) {
      e.preventDefault();
      handleSend();
    }
  };

  // ✅ Handle text change with typing indicator
  const handleChange = (e) => {
    setValue(e.target.value);
    if (e.target.value.trim()) {
      if (!typingTimeoutRef.current) {
        sendTypingIndicator();
      }
    } else {
      clearTypingTimeout();
      stopTyping(activeRoomId);
    }
  };

  const [popoverVisible, setPopoverVisible] = useState(false);

  const uploadProps = {
    beforeUpload: (file) => {
      if (fileList.length >= 5) {
        antMessage.error('Maximum 5 files allowed');
        return false;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const newFile = {
          uid: file.uid,
          name: file.name,
          type: file.type,
          size: file.size,
          originFileObj: file,
          preview: e.target.result,
        };
        setFileList([...fileList, newFile]);
        setPopoverVisible(false); // Close popover after file selection
      };
      reader.readAsDataURL(file);
      return false;
    },
    showUploadList: false,
  };

  const removeFile = (uid) => {
    setFileList(fileList.filter(f => f.uid !== uid));
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setAudioBlob(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Start timer
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      antMessage.error('Microphone access denied');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsLocked(false);
      setSlideOffset(0);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsLocked(false);
      setSlideOffset(0);
      setAudioBlob(null);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      // Stop all tracks
      if (mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
    }
  };

  const handleTouchStart = (e) => {
    touchStartXRef.current = e.touches[0].clientX;
    startRecording();
  };

  const handleTouchMove = (e) => {
    if (!isRecording || isLocked) return;

    const currentX = e.touches[0].clientX;
    const diff = touchStartXRef.current - currentX;

    if (diff > 0) {
      setSlideOffset(Math.min(diff, 150));

      // Cancel if slid too far
      if (diff > 120) {
        cancelRecording();
      }
    }
  };

  const handleTouchEnd = () => {
    if (!isRecording) return;

    if (isLocked) {
      // Keep recording if locked
      return;
    }

    if (slideOffset > 120) {
      // Already cancelled
      return;
    }

    // Stop and send
    stopRecording();
    setSlideOffset(0);
  };

  const handleMouseDown = () => {
    startRecording();
  };

  const handleMouseUp = () => {
    if (!isRecording || isLocked) return;
    stopRecording();
  };

  const toggleLock = () => {
    setIsLocked(!isLocked);
  };

  const formatRecordingTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const sendAudioMessage = async () => {
    if (!audioBlob || !activeRoomId) return;

    setIsSending(true);
    try {
      const formData = new FormData();
      const audioFile = new File([audioBlob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
      formData.append('files', audioFile);

      const uploadResult = await dispatch(uploadChatMedia(formData)).unwrap();
      let mediaUrls = uploadResult.data.media;

      // Mark as voice note
      mediaUrls = mediaUrls.map(media => ({
        ...media,
        type: 'voice',
        isVoiceNote: true
      }));

      // Add optimistic message for immediate UI feedback
      const tempId = `temp_${Date.now()}_${Math.random()}`;
      const optimisticMessage = {
        _id: tempId,
        roomId: activeRoomId,
        content: 'Voice message',
        type: 'voice',
        media: mediaUrls,
        senderId: user._id,
        sender: {
          _id: user._id,
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          role: user.role,
        },
        status: 'sending', // ✅ Show loading indicator
        optimistic: true,
        createdAt: new Date().toISOString(),
      };

      dispatch(addMessage({ roomId: activeRoomId, message: optimisticMessage }));

      await sendMessage(activeRoomId, 'Voice message', 'voice', mediaUrls, tempId);
      setAudioBlob(null);
      antMessage.success('Voice message sent');
    } catch (error) {
      antMessage.error('Failed to send voice message');
    } finally {
      setIsSending(false);
    }
  };

  const renderFilePreview = (file) => {
    const isImage = file.type?.startsWith('image/');
    const isVideo = file.type?.startsWith('video/');

    return (
      <div
        key={file.uid}
        style={{
          position: 'relative',
          width: '100px',
          height: '100px',
          borderRadius: '8px',
          overflow: 'hidden',
          border: '2px solid #E5E7EB',
          backgroundColor: '#F9FAFB',
        }}
      >
        {isImage && (
          <img
            src={file.preview}
            alt={file.name}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        )}
        {isVideo && (
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <video
              src={file.preview}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
            <PlayCircleOutlined
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: '32px',
                color: 'white',
                opacity: 0.8,
              }}
            />
          </div>
        )}
        {!isImage && !isVideo && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              padding: '8px',
            }}
          >
            <FileOutlined style={{ fontSize: '28px', color: '#10B981' }} />
            <div
              style={{
                marginTop: '6px',
                fontSize: '11px',
                color: '#6B7280',
                textAlign: 'center',
                wordBreak: 'break-word',
              }}
            >
              {file.name}
            </div>
          </div>
        )}
        <CloseCircleOutlined
          onClick={() => removeFile(file.uid)}
          style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            fontSize: '20px',
            color: 'white',
            backgroundColor: 'rgba(0,0,0,0.5)',
            borderRadius: '50%',
            cursor: 'pointer',
            zIndex: 10,
          }}
        />
      </div>
    );
  };

  // Calculate contrasting placeholder color
  const getPlaceholderColor = () => {
    const bgColor = theme.inputBackgroundColor || '#FFFFFF';
    const rgb = bgColor.startsWith('#') ? parseInt(bgColor.slice(1), 16) : 0xFFFFFF;
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness > 128 ? '#8696A0' : '#B0B0B0';
  };

  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes waveform {
          0% { transform: scaleY(0.3); }
          100% { transform: scaleY(1); }
        }
        .message-input-textarea::placeholder {
          color: ${getPlaceholderColor()} !important;
          opacity: 0.7 !important;
        }
      `}</style>
      <div
        style={{
          padding: '10px 16px',
          backgroundColor: theme?.sidebarBackgroundColor || '#F0F2F5',
          position: 'relative',
        }}
      >
        {fileList.length > 0 && (
          <div style={{
            marginBottom: '8px',
            padding: '8px',
            backgroundColor: '#FFFFFF',
            borderRadius: '8px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          }}>
            <div style={{
              display: 'flex',
              gap: '12px',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}>
              {fileList.map(renderFilePreview)}
            </div>
          </div>
        )}
        <div style={{
          display: 'flex',
          gap: '6px',
          alignItems: 'flex-end',
        }}>
          {/* Left icons - Emoji, Attach, Camera */}
          {!audioBlob && !isRecording && (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              {/* <Tooltip title="Emoji">
              <Button
                type="text"
                icon={<SmileOutlined style={{ fontSize: '24px', color: '#54656F' }} />}
                disabled={!activeRoomId || isSending}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '40px',
                  height: '40px',
                  padding: 0,
                }}
              />
            </Tooltip> */}

              <Popover
                content={
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <Upload {...uploadProps} maxCount={5}>
                      <Button type="text" icon={<FileOutlined />} block>Document</Button>
                    </Upload>
                    <Upload {...uploadProps} accept="image/*" maxCount={5}>
                      <Button type="text" icon={<CameraOutlined />} block>Photos</Button>
                    </Upload>
                  </div>
                }
                trigger="click"
                placement="topLeft"
                open={popoverVisible}
                onOpenChange={setPopoverVisible}
              >
                <Button
                  type="text"
                  icon={
                    <PaperClipOutlined
                      style={{
                        fontSize: '24px',
                        color: '#54656F',
                      }}
                    />
                  }
                  disabled={!activeRoomId || isSending}
                  className="chat-attach-btn"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '40px',
                    height: '40px',
                    padding: 0,
                    borderRadius: '8px',
                    backgroundColor: 'transparent',
                  }}
                />

              </Popover>
            </div>
          )}

          {/* Recording UI - WhatsApp Style */}
          {isRecording && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: theme?.sidebarBackgroundColor || '#F0F2F5',
                display: 'flex',
                alignItems: 'center',
                padding: '10px 16px',
                gap: '12px',
                // zIndex: 10,
                transform: `translateX(-${slideOffset}px)`,
                transition: isLocked ? 'none' : 'transform 0.1s ease-out',
              }}
            >
              {/* Cancel button (slide to cancel) */}
              {/* <div
                onClick={cancelRecording}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '45px',
                  height: '45px',
                  borderRadius: '50%',
                  backgroundColor: '#EF4444',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  opacity: slideOffset > 60 ? 1 : 0.7,
                  transform: slideOffset > 60 ? 'scale(1.1)' : 'scale(1)',
                }}
              >
                <DeleteOutlined style={{ fontSize: '20px', color: '#FFFFFF' }} />
              </div> */}

              {/* Recording indicator and time */}
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                backgroundColor: theme?.inputBackgroundColor || '#FFFFFF',
                borderRadius: '24px',
                padding: '10px 16px',
              }}>
                <div style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  backgroundColor: '#EF4444',
                  animation: 'pulse 1.5s infinite',
                }} />
                <span style={{
                  color: '#111B21',
                  fontSize: '15px',
                  fontWeight: 500,
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {formatRecordingTime(recordingTime)}
                </span>

                {/* Waveform animation */}
                <div style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '2px',
                  height: '24px',
                }}>
                  {[...Array(30)].map((_, i) => (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        backgroundColor: '#00A884',
                        borderRadius: '2px',
                        height: `${20 + Math.random() * 80}%`,
                        animationName: 'waveform',
                        animationDuration: `${0.5 + Math.random() * 0.5}s`,
                        animationTimingFunction: 'ease-in-out',
                        animationIterationCount: 'infinite',
                        animationDirection: 'alternate',
                        animationDelay: `${i * 0.05}s`,
                      }}
                    />
                  ))}
                </div>

                {/* Lock button */}
                {!isLocked && (
                  <Tooltip title="Lock recording">
                    <Button
                      type="text"
                      icon={<LockOutlined style={{ fontSize: '18px', color: '#54656F' }} />}
                      onClick={toggleLock}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '36px',
                        height: '36px',
                        padding: 0,
                      }}
                    />
                  </Tooltip>
                )}
                {isLocked && (
                  <UnlockOutlined style={{ fontSize: '18px', color: '#00A884' }} />
                )}
              </div>

              {/* Send button */}
              <Button
                type="primary"
                shape="circle"
                icon={<SendOutlined style={{ fontSize: '18px', color: '#FFFFFF' }} />}
                onClick={stopRecording}
                style={{
                  backgroundColor: '#00A884',
                  borderColor: '#00A884',
                  width: '48px',
                  height: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              />

              {/* Slide to cancel hint */}
              {!isLocked && slideOffset < 60 && (
                <div style={{
                  position: 'absolute',
                  left: '50%',
                  bottom: '-30px',
                  transform: 'translateX(-50%)',
                  color: '#54656F',
                  fontSize: '13px',
                  whiteSpace: 'nowrap',
                  opacity: 0.7,
                }}>
                  ← Slide to cancel
                </div>
              )}
            </div>
          )}

          {/* Recording indicator */}
          {isRecording && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              backgroundColor: '#FFFFFF',
              borderRadius: '24px',
              flex: 1,
            }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#EF4444',
                animation: 'pulse 1.5s infinite',
              }} />
              <span style={{ color: '#54656F', fontSize: '15px' }}>Recording...</span>
            </div>
          )}

          {/* Audio preview */}
          {audioBlob && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              backgroundColor: '#FFFFFF',
              borderRadius: '24px',
              flex: 1,
            }}>
              <AudioOutlined style={{ fontSize: '20px', color: '#00A884' }} />
              <span style={{ color: '#54656F', fontSize: '15px' }}>Voice message ready</span>
              <CloseCircleOutlined
                onClick={() => setAudioBlob(null)}
                style={{ fontSize: '18px', color: '#54656F', cursor: 'pointer' }}
              />
            </div>
          )}

          {/* Input area */}
          {!audioBlob && !isRecording && (
            <div style={{
              flex: 1,
              backgroundColor: theme.inputBackgroundColor || '#FFFFFF',
              borderRadius: '24px',
              padding: '13px 12px',
              display: 'flex',
              alignItems: 'center',
            }}>
              <Input.TextArea
                ref={inputRef}
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                placeholder="Type a message"
                disabled={!activeRoomId || isSending}
                maxLength={5000}
                autoSize={{ minRows: 1, maxRows: 4 }}
                className="message-input-textarea"
                style={{
                  flex: 1,
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: theme.inputTextColor || '#111B21',
                  fontSize: '15px',
                  resize: 'none',
                  padding: 0,
                }}
                bordered={false}
              />
            </div>
          )}

          {/* Right button - Microphone or Send */}
          {!isRecording && audioBlob ? (
            <Tooltip title="Send voice message">
              <Button
                type="primary"
                shape="circle"
                icon={<SendOutlined style={{ fontSize: '18px', color: theme.sendButtonIconColor || '#FFFFFF' }} />}
                onClick={sendAudioMessage}
                loading={isSending}
                style={{
                  backgroundColor: theme.sendButtonColor || '#00A884',
                  borderColor: theme.sendButtonColor || '#00A884',
                  width: '48px',
                  height: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              />
            </Tooltip>
          ) : !isRecording && (value.trim() || fileList.length > 0) ? (
            <Button
              type="primary"
              shape="circle"
              icon={isSending ? <LoadingOutlined style={{ fontSize: '18px', color: theme.sendButtonIconColor || '#FFFFFF' }} spin /> : <SendOutlined style={{ fontSize: '18px', color: theme.sendButtonIconColor || '#FFFFFF' }} />}
              onClick={handleSend}
              disabled={!activeRoomId || isSending || isRecording}
              style={{
                backgroundColor: theme.sendButtonColor || '#00A884',
                borderColor: theme.sendButtonColor || '#00A884',
                width: '48px',
                height: '48px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            />
          ) : !isRecording ? (
            <div
              ref={recordButtonRef}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{ touchAction: 'none' }}
            >
              <Tooltip title="Hold to record">
                <Button
                  type="primary"
                  shape="circle"
                  icon={<AudioOutlined style={{ fontSize: '20px', color: theme.sendButtonIconColor || '#FFFFFF' }} />}
                  disabled={!activeRoomId || isSending}
                  style={{
                    backgroundColor: theme.sendButtonColor || '#00A884',
                    borderColor: theme.sendButtonColor || '#00A884',
                    width: '48px',
                    height: '48px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                />
              </Tooltip>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
});

export default MessageInput;