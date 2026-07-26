export interface ConversationSummary {
  id: string;
  context: string;
  listingId: string | null;
  listingTitle: string | null;
  listingThumbUrl: string | null;
  otherPartyId: string;
  otherPartyName: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unreadCount: number;
  isInitiator: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  body: string;
  isMine: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface ConversationDetail extends ConversationSummary {
  messages: ChatMessage[];
}
