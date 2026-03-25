import { useDispatch, useSelector } from 'react-redux';
import { useEffect, useState, useCallback } from 'react';
import { fetchRooms, setActiveRoom } from '../../redux/slices/chatSlice';
import { Input, List, Empty, Button, Spin, Dropdown, Modal, message, App } from 'antd';
import { SearchOutlined, PlusOutlined, MessageOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import Avatar from '../common/Avatar';
import OnlineStatus from './OnlineStatus';
import { format, isToday, isYesterday } from 'date-fns';
import { useTheme } from '../../hooks/useTheme';
import API from '../../constants/ApiEndpoints';
import { _delete, _get, _post } from '../../helper/apiClient';

export default function RoomList({ fetchRoomsAction = null, onCreateRoom = null, onRoomClick = null, roomFilter = null }) {
  const dispatch = useDispatch();
  const { theme } = useTheme();
  const { rooms, activeRoomId, loadingRooms } = useSelector((s) => s.chat);
  const { user, token } = useSelector((s) => s.auth);
  const [searchTerm, setSearchTerm] = useState('');
  const [contextMenuRoom, setContextMenuRoom] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [isSearchMode, setIsSearchMode] = useState(false);
  const { modal, message: messageApi } = App.useApp();

  const [isLargeScreen, setIsLargeScreen] = useState(window.innerWidth >= 768);

  useEffect(() => {
    const handleResize = () => setIsLargeScreen(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Contact search functionality
  const handleContactSearch = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      setIsSearchMode(false);
      return;
    }

    setSearchLoading(true);
    setIsSearchMode(true);
    try {
      const response = await _get('/contacts/search-user', {
        query: query.trim()
      });

      if (response.data.success) {
        setSearchResults(response.data.data.users || []);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
      if (error.response?.status !== 404) {
        messageApi.error('Failed to search contacts');
      }
    } finally {
      setSearchLoading(false);
    }
  };

  // Create chat with contact
  const handleCreateChat = async (contact) => {
    try {
      const response = await _post('/chat/create-or-get-room', {
        participantId: contact._id,
        type: 'DIRECT'
      });

      if (response.data.success) {
        const room = response.data.data.room;
        dispatch(setActiveRoom(room._id));
        
        if (onRoomClick) {
          onRoomClick(room._id);
        }
        
        // Refresh rooms list
        if (fetchRoomsAction) {
          dispatch(fetchRoomsAction());
        } else {
          dispatch(fetchRooms());
        }
        
        messageApi.success(`Chat opened with ${contact.name}`);
        setSearchTerm('');
        setSearchResults([]);
        setIsSearchMode(false);
      }
    } catch (error) {
      console.error('Create chat error:', error);
      messageApi.error(error.response?.data?.message || 'Failed to create chat');
    }
  };

  // Handle phone number chat
  const handlePhoneNumberChat = (phoneNumber) => {
    const formatPhoneNumber = (phone) => {
      const cleaned = phone.replace(/\D/g, '');
      if (cleaned.length === 10) {
        return `+1${cleaned}`;
      } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
        return `+${cleaned}`;
      }
      return `+${cleaned}`;
    };

    const formattedPhone = formatPhoneNumber(phoneNumber);
    
    modal.confirm({
      title: 'Start Chat with Phone Number',
      content: (
        <div>
          <p>No contact found for this number.</p>
          <p>Do you want to start a chat with <strong>{formattedPhone}</strong>?</p>
        </div>
      ),
      okText: 'Start Chat',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const response = await _post('/chat/create-or-get-room', {
            phone: formattedPhone,
            type: 'DIRECT'
          });

          if (response.data.success) {
            const room = response.data.data.room;
            dispatch(setActiveRoom(room._id));
            
            if (onRoomClick) {
              onRoomClick(room._id);
            }
            
            if (fetchRoomsAction) {
              dispatch(fetchRoomsAction());
            } else {
              dispatch(fetchRooms());
            }

            messageApi.success(`Chat created for ${formattedPhone}`);
            setSearchTerm('');
            setSearchResults([]);
            setIsSearchMode(false);
          }
        } catch (error) {
          console.error('Phone chat error:', error);
          messageApi.error(error.response?.data?.message || 'Failed to create chat with phone number');
        }
      }
    });
  };

  // Check if query is phone number
  const isPhoneNumber = (query) => {
    return /^[\d\s\-\+\(\)]+$/.test(query.trim()) && query.trim().replace(/\D/g, '').length >= 10;
  };

  // Debounced search effect
  useEffect(() => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      setIsSearchMode(false);
      return;
    }

    const delayDebounceFn = setTimeout(() => {
      handleContactSearch(searchTerm);
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  // ✅ Delete room with WhatsApp-style confirmation
  const showDeleteConfirm = useCallback((room) => {
    modal.confirm({
      title: (
        <span style={{ fontSize: '20px', fontWeight: '400', color: '#111B21' }}>
          Delete chat?
        </span>
      ),
      icon: null,
      content: (
        <div style={{ marginTop: '8px' }}>
          <p style={{ fontSize: '14px', color: '#667781', margin: 0, lineHeight: '20px' }}>
            Delete chat with <strong style={{ color: '#111B21' }}>{room.name}</strong>?
          </p>
          <p style={{ fontSize: '13px', color: '#8696a0', margin: '8px 0 0 0', lineHeight: '18px' }}>
            This will permanently delete all messages and media from this chat.
          </p>
        </div>
      ),
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      centered: true,
      width: 400,
      okButtonProps: {
        style: {
          backgroundColor: '#ea0038',
          borderColor: '#ea0038',
          color: '#ffffff',
          height: '36px',
          fontSize: '14px',
          fontWeight: '500',
        },
      },
      cancelButtonProps: {
        style: {
          height: '36px',
          fontSize: '14px',
          fontWeight: '500',
          color: '#00a884',
          borderColor: '#d1d7db',
        },
      },
      onOk: async () => {
        try {
          await _delete(`${API.CHAT.DELETE_ROOM}/${room._id}`);
          messageApi.success({
            content: 'Chat deleted',
            style: {
              marginTop: '10vh',
            },
          });
          if (fetchRoomsAction) {
            dispatch(fetchRoomsAction());
          } else {
            dispatch(fetchRooms());
          }
          if (activeRoomId === room._id) {
            dispatch(setActiveRoom(null));
          }
        } catch (error) {
          console.error('Error deleting room:', error);
          messageApi.error({
            content: error.response?.data?.message || 'Failed to delete chat',
            style: {
              marginTop: '10vh',
            },
          });
        }
      },
    });
  }, [dispatch, fetchRoomsAction, activeRoomId, modal, messageApi]);

  // ✅ Fetch rooms on mount
  useEffect(() => {
    const fetchRoomsData = async () => {
      // Wait for token to be available
      if (!token) {
        console.warn('⚠️ [ROOMLIST] No token available, skipping fetchRooms');
        return;
      }
      
      if (fetchRoomsAction) {
        const result = await dispatch(fetchRoomsAction());
        console.log('📥 [ROOMLIST] Fetched rooms result:', result?.payload?.data?.rooms?.map(r => ({
          id: r._id,
          name: r.name,
          unreadCount: r.unreadCount
        })));
      } else {
        const result = await dispatch(fetchRooms());
        console.log('📥 [ROOMLIST] Fetched rooms result:', result?.payload?.data?.rooms?.map(r => ({
          id: r._id,
          name: r.name,
          unreadCount: r.unreadCount
        })));
      }
    };
    fetchRoomsData();
  }, [dispatch, user?.role, token, fetchRoomsAction]);

  // ✅ Listen for room_created event to refresh room list
  useEffect(() => {
    const handleRoomCreated = () => {
      console.log('🔔 [ROOMLIST] room_created event received, refetching rooms');
      if (fetchRoomsAction) {
        dispatch(fetchRoomsAction());
      } else {
        dispatch(fetchRooms());
      }
    };

    const handleRoomDeleted = (event) => {
      const { roomId } = event.detail || {};
      console.log('🗑️ [ROOMLIST] room_deleted event received, refetching rooms', roomId);
      if (fetchRoomsAction) {
        dispatch(fetchRoomsAction());
      } else {
        dispatch(fetchRooms());
      }
      // Clear active room if it was deleted
      if (activeRoomId === roomId) {
        dispatch(setActiveRoom(null));
      }
    };

    window.addEventListener('room_created', handleRoomCreated);
    window.addEventListener('room_deleted', handleRoomDeleted);
    return () => {
      window.removeEventListener('room_created', handleRoomCreated);
      window.removeEventListener('room_deleted', handleRoomDeleted);
    };
  }, [dispatch, fetchRoomsAction, activeRoomId]);

  const roomsArray = Array.isArray(rooms)
    ? rooms
    : rooms?.data?.rooms || rooms?.rooms || rooms?.data || [];

  // Apply room type filter if provided
  const filteredByType = roomFilter 
    ? roomsArray.filter(room => room.type === roomFilter)
    : roomsArray;

  // Log rooms from Redux state
  useEffect(() => {
    console.log('📦 [ROOMLIST] Rooms from Redux state:', roomsArray.map(r => ({
      id: r._id,
      name: r.name,
      type: r.type,
      unreadCount: r.unreadCount
    })));
    if (roomFilter) { 
      console.log(`🔍 [ROOMLIST] Filtered by type ${roomFilter}:`, filteredByType.length, 'rooms');
    }
  }, [roomsArray, roomFilter, filteredByType.length]);

  // ✅ Filter rooms by search term
  const filteredRooms = filteredByType.filter((room) =>
    room.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    room.participants?.some(
      (p) =>
        p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.userId?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const getRoomDisplayName = useCallback((room) => {
    return room.name || 'Chat';
  }, []);

  // ✅ Get participant avatar
  const getParticipantAvatar = useCallback((room) => {
    const participants = room.participants || [];
    const otherParticipant = participants.find(p => {
      const participantId = p.userId?._id || p._id;
      return participantId !== user?._id;
    });
    return otherParticipant?.userId?.avatar || otherParticipant?.avatar || room.avatar;
  }, [user?._id]);

  // ✅ Get last message text
  const getLastMessageText = useCallback((room) => {
    // Always show last message, not first unread
    const lastMessage = room.lastMessage;
    if (!lastMessage) return 'No messages yet';
    
    if (typeof lastMessage === 'object') {
      // Check for content first
      if (lastMessage.content) {
        return lastMessage.content.substring(0, 50);
      }
      // Check message type for media
      if (lastMessage.type === 'image') return '📷 Photo';
      if (lastMessage.type === 'video') return '🎥 Video';
      if (lastMessage.type === 'voice') return '🎤 Voice message';
      if (lastMessage.type === 'audio') return '🎵 Audio';
      if (lastMessage.type === 'file') return '📎 File';
      // Check if media array exists
      if (lastMessage.media && lastMessage.media.length > 0) {
        const mediaType = lastMessage.media[0].type;
        if (mediaType === 'image') return '📷 Photo';
        if (mediaType === 'video') return '🎥 Video';
        if (mediaType === 'audio' || mediaType === 'voice') return '🎤 Voice message';
        if (mediaType === 'file') return '📎 File';
      }
    }
    
    if (typeof lastMessage === 'string') {
      return lastMessage.substring(0, 50);
    }
    
    return 'No messages yet';
  }, []);

  // ✅ Format time
  const formatMessageTime = useCallback((timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (isToday(date)) return format(date, 'HH:mm');
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'MMM d');
  }, []);

  // ✅ Get unread count
  const getUnreadCount = useCallback((room) => {
    const count = typeof room.unreadCount === 'number' ? room.unreadCount : 0;
    return count;
  }, []);

  // ✅ Show loading state
  if (loadingRooms && roomsArray.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          background: theme?.backgroundColor || '#f5f5f5',
        }}
      >
        <Spin tip="Loading rooms..." />
      </div>
    );
  }



  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        marginLeft: isLargeScreen ? '80px' : '0px',
        flexDirection: 'column',
        backgroundColor: theme?.
          sidebarBackgroundColor || '#FFFFFF',
        borderRight: `1px solid ${theme?.borderColor || '#E5E7EB'}`,
      }}
    >
      {/* ===== HEADER - WhatsApp Style ===== */}
      <div
        style={{
          padding: '13px',
          background: theme?.sidebarHeaderColor || '#008069',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2
            style={{
              fontSize: '20px',
              fontWeight: '500',
              color: '#FFFFFF',
              margin: 0,
            }}
          >
            {theme?.appName || 'Chats'}
          </h2>
          {onCreateRoom && (
            <Button
              type="text"
              icon={<PlusOutlined style={{ fontSize: '20px', color: '#FFFFFF' }} />}
              onClick={onCreateRoom}
              size="large"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FFFFFF',
              }}
            />
          )}
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ padding: '12px', backgroundColor: theme?.sidebarBackgroundColor || '#FFFFFF', borderBottom: `1px solid ${theme?.sidebarBorderColor || '#E9EDEF'}` }}>
        <Input
          placeholder={isSearchMode ? "Search contacts by name, phone, or email" : "Search Chats"}
          prefix={<SearchOutlined style={{ color: theme?.headerText || '#667781' }} />}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          allowClear
          style={{
            borderRadius: '8px',
            backgroundColor: theme?.inputBackgroundColor || '#F0F2F5',
            border: 'none',
          }}
          size="large"
        />
      </div>

      {/* ===== ROOM LIST - WhatsApp Style ===== */}
      <div style={{ flex: 1, overflowY: 'auto', backgroundColor: theme?.sidebarBackgroundColor || '#FFFFFF' }}>
        {filteredRooms.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              flexDirection: 'column',
              gap: '20px',
              padding: '40px',
            }}
          >
            <div
              style={{
                width: '120px',
                height: '120px',
                borderRadius: '50%',
                background: theme?.primaryColor || '#008069',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 8px 24px ${theme?.primaryColor || 'rgba(0, 128, 105, 0.25)'}`,
              }}
            >
              <MessageOutlined style={{ fontSize: '50px', color: '#FFFFFF' }} />
            </div>
            <div style={{ textAlign: 'center', maxWidth: '300px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '600', color: theme?.headerText || '#111B21', marginBottom: '8px' }}>
                {searchTerm ? 'No chats found' : 'No conversations yet'}
              </h3>
              <p style={{ fontSize: '13px', color: theme?.headerText || '#667781', lineHeight: '1.5', marginBottom: '16px' }}>
                {searchTerm ? 'Try searching with different keywords' : 'Start a new conversation by clicking the + button'}
              </p>
              {onCreateRoom && !searchTerm && (
                <Button
                  type="primary"
                  icon={<MessageOutlined />}
                  onClick={onCreateRoom}
                  style={{
                    backgroundColor: theme?.primaryColor || '#008069',
                    borderColor: theme?.primaryColor || '#008069',
                    borderRadius: '8px',
                    height: '40px',
                    fontSize: '14px',
                  }}
                >
                  Start a Conversation
                </Button>
              )}
            </div>
          </div>
        ) : (
          
          <List
            dataSource={filteredRooms}
            renderItem={(room) => {
              const isActive = activeRoomId === room._id;
              const unreadCount = getUnreadCount(room);

              const menuItems = [
                {
                  key: 'delete',
                  label: (
                    <span style={{ color: '#ea0038', fontSize: '14px' }}>
                      Delete chat
                    </span>
                  ),
                  icon: <DeleteOutlined style={{ color: '#ea0038' }} />,
                  onClick: () => showDeleteConfirm(room),
                },
              ];

              const isTouchDevice = 'ontouchstart' in window;

              return (
                <Dropdown
                  menu={{ items: menuItems }}
                  trigger={isTouchDevice ? [] : ['contextMenu']}
                  key={`${room._id}-${room.lastMessageTime || ''}-${room.unreadCount || 0}`}
                >
                  <List.Item
                    onClick={() => {
                      dispatch(setActiveRoom(room._id));
                      if (onRoomClick) onRoomClick(room._id);
                    }}
                    style={{
                      backgroundColor: isActive ? (theme?.sidebarActiveColor || '#F0F2F5') : (theme?.sidebarBackgroundColor || '#FFFFFF'),
                      borderBottom: `1px solid ${theme?.sidebarBorderColor || '#F0F2F5'}`,
                      padding: '12px 16px',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                  >
                    {/* Custom layout instead of List.Item.Meta */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', width: '100%' }}>
                      {/* Avatar Section */}
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <Avatar
                          name={getRoomDisplayName(room)}
                          size={44}
                          src={getParticipantAvatar(room)}
                        />
                        {room.type === 'ADMIN_CHAT' && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: 0,
                              right: 0,
                            }}
                          >
                            <OnlineStatus
                              userId={
                                room.participants?.find(
                                  (p) => p.userId?._id !== user?._id
                                )?.userId?._id
                              }
                              size="sm"
                            />
                          </div>
                        )}
                      </div>

                      {/* Content Section */}
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {/* Top Row: Name and Time */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontWeight: unreadCount > 0 ? '600' : '500',
                                color: theme?.sidebarTextColor || '#111B21',
                                fontSize: '16px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                lineHeight: '1.2',
                              }}
                            >
                              {getRoomDisplayName(room)}
                            </div>
                            {room.displayPhone && (
                              <div
                                style={{
                                  fontSize: '13px',
                                  color: theme?.timestampColor || '#667781',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  lineHeight: '1.1',
                                  marginTop: '1px',
                                }}
                              >
                                {room.displayPhone}
                              </div>
                            )}
                          </div>
                          <div style={{ flexShrink: 0, textAlign: 'right' }}>
                            <span
                              style={{
                                fontSize: '12px',
                                color: unreadCount > 0 ? (theme?.primaryColor || '#00A884') : (theme?.timestampColor || '#667781'),
                                fontWeight: unreadCount > 0 ? '500' : '400',
                                whiteSpace: 'nowrap',
                                lineHeight: '1',
                              }}
                            >
                              {formatMessageTime(room.lastMessageTime)}
                            </span>
                          </div>
                        </div>

                        {/* Bottom Row: Message and Badge */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span
                              style={{
                                fontSize: '14px',
                                color: unreadCount > 0 ? '#111B21' : '#667781',
                                fontWeight: unreadCount > 0 ? '500' : '400',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                lineHeight: '1.2',
                                display: 'block',
                              }}
                            >
                              {getLastMessageText(room)}
                            </span>
                          </div>
                          <div style={{ flexShrink: 0 }}>
                            {unreadCount > 0 && (
                              <div
                                style={{
                                  backgroundColor: theme?.primaryColor || '#00A884',
                                  color: '#FFFFFF',
                                  borderRadius: '10px',
                                  minWidth: '18px',
                                  height: '18px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '11px',
                                  fontWeight: '600',
                                  padding: '0 4px',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                }}
                              >
                                {unreadCount > 99 ? '99+' : unreadCount}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </List.Item>
                </Dropdown>
              );
            }}
          />
        )}
      </div>
    </div>
  );
}