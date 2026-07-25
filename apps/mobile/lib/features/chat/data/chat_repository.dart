import '../../../core/network/api_client.dart';
import '../../listings/domain/models.dart';

/// Enquiry threads. Phase 1 is request/response only — no WebSocket, because polling on
/// open is enough for a conversation that moves at human speed, and a socket per user
/// is real infrastructure cost for little gain at launch.
class ChatRepository {
  ChatRepository(this._api);

  final ApiClient _api;

  Future<List<ConversationSummary>> conversations() async {
    final json = await _api.get<Map<String, dynamic>>('/conversations', query: {'limit': 50});
    return (json['items'] as List<dynamic>)
        .map((entry) => ConversationSummary.fromJson(entry as Map<String, dynamic>))
        .toList();
  }

  /// Opening a thread also marks the other party's messages as read, server-side.
  Future<List<ChatMessage>> messages(String conversationId) async {
    final json = await _api.get<Map<String, dynamic>>('/conversations/$conversationId');
    return (json['messages'] as List<dynamic>)
        .map((entry) => ChatMessage.fromJson(entry as Map<String, dynamic>))
        .toList();
  }

  Future<ChatMessage> send(String conversationId, String body) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/conversations/$conversationId/messages',
      body: {'body': body},
    );
    return ChatMessage.fromJson(json);
  }

  /// Starts an enquiry about a listing. The API returns the existing thread if one is
  /// already open, so tapping "Message seller" twice never creates a duplicate.
  Future<String> startEnquiry(String listingId, String message) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/conversations',
      body: {'listingId': listingId, 'message': message},
    );
    return json['id'] as String;
  }

  Future<int> unreadCount() async {
    final json = await _api.get<Map<String, dynamic>>('/conversations/unread-count');
    return json['count'] as int? ?? 0;
  }

  Future<void> block(String userId, {String? reason}) => _api.post<void>(
    '/conversations/block',
    body: {'userId': userId, if (reason != null) 'reason': reason},
  );
}
