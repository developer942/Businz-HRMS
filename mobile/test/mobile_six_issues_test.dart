import 'package:flutter_test/flutter_test.dart';
import 'package:businz_hrms_mobile/features/whatsapp/presentation/whatsapp_crm_screen.dart';

void main() {
  group('WhatsApp CRM 403 Media URL Sanitization', () {
    test('rejects Meta CDN scontent/fbcdn URLs that cause HTTP 403', () {
      expect(
        isForbiddenMetaMediaUrl(
          'https://scontent.whatsapp.net/v/t61.29466-34/banner.png',
        ),
        isTrue,
      );
      expect(
        isForbiddenMetaMediaUrl('https://scontent.xx.fbcdn.net/img.jpg'),
        isTrue,
      );
      expect(
        isForbiddenMetaMediaUrl('https://lookaside.fbsbx.com/media/123'),
        isTrue,
      );
      expect(isForbiddenMetaMediaUrl(''), isTrue);
      expect(
        isForbiddenMetaMediaUrl('https://hrms.businz.com/vrm-banner.png'),
        isFalse,
      );
    });

    test('prefers public headerContent over Meta scontent headerExample', () {
      final template = <String, dynamic>{
        'name': 'vrm_expo_followup_v1',
        'headerType': 'IMAGE',
        'headerContent': 'https://hrms.businz.com/vrm-banner.png',
        'headerExample': [
          'https://scontent.whatsapp.net/v/t61.29466-34/forbidden.png',
        ],
      };
      expect(
        resolveSafeTemplateHeaderMedia(template),
        'https://hrms.businz.com/vrm-banner.png',
      );
      // Even if caller passes back scontent URL as userOverride, sanitize it!
      expect(
        resolveSafeTemplateHeaderMedia(
          template,
          userOverride:
              'https://scontent.whatsapp.net/v/t61.29466-34/forbidden.png',
        ),
        'https://hrms.businz.com/vrm-banner.png',
      );
    });

    test(
        'falls back to public banner when both content and example are forbidden',
        () {
      final template = <String, dynamic>{
        'headerType': 'IMAGE',
        'headerContent': null,
        'headerExample': [
          'https://scontent.whatsapp.net/v/t61.29466-34/forbidden.png',
        ],
      };
      expect(
        resolveSafeTemplateHeaderMedia(template),
        kDefaultCrmHeaderImageUrl,
      );
    });

    test('formats Meta error 131053 clearly', () {
      final msg = formatMetaFailureReason(
        '{"code":131053,"message":"Downloading media from weblink failed with http code 403"}',
      );
      expect(msg.toLowerCase(), contains('403'));
    });
  });
}
