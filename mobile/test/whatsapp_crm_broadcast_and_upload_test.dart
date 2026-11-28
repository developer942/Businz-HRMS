import 'dart:convert';
import 'dart:typed_data';

import 'package:businz_hrms_mobile/app/providers.dart';
import 'package:businz_hrms_mobile/core/network/api_client.dart';
import 'package:businz_hrms_mobile/core/storage/secure_session_store.dart';
import 'package:businz_hrms_mobile/features/shared/data/hrms_repository.dart';
import 'package:businz_hrms_mobile/features/whatsapp/presentation/whatsapp_crm_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _MemStore implements SecureSessionStore {
  @override
  Future<String?> readAccessToken() async => 'test-token';
  @override
  Future<String?> readRefreshToken() async => null;
  @override
  Future<String?> readProtectedValue(String key) async => null;
  @override
  Future<void> writeProtectedValue(String key, String value) async {}
  @override
  Future<void> deleteProtectedValue(String key) async {}
  @override
  Future<Map<String, dynamic>?> readUser() async => null;
  @override
  Future<void> save({
    required String accessToken,
    String? refreshToken,
    required Map<String, dynamic> user,
  }) async {}
  @override
  Future<void> clear() async {}
}

class _FakeWhatsAppRepo extends HrmsRepository {
  _FakeWhatsAppRepo({
    this.broadcastCreateThrows = false,
    this.softFailSend = false,
  }) : super(ApiClient(sessionStore: _MemStore()));

  final bool broadcastCreateThrows;
  final bool softFailSend;
  final List<Map<String, dynamic>> sentPayloads = [];
  Map<String, dynamic>? savedDraftPayload;
  String? submittedTemplateId;

  @override
  Future<List<Map<String, dynamic>>> crmTemplates() async => const [
        {
          'id': 'tmpl-1',
          'name': 'vrm_promo_doc',
          'category': 'MARKETING',
          'language': 'en',
          'status': 'APPROVED',
          'headerType': 'DOCUMENT',
          'headerContent': 'VRM_Product_Catalogue.pdf',
          'headerExample': ['https://hrms.businz.com/VRM_Product_Catalogue.pdf'],
          'bodyText': 'Hello {{1}}, please review our brochure.',
          'bodyExampleValues': ['Velmurugan'],
        },
      ];

  @override
  Future<List<Map<String, dynamic>>> crmContacts({
    String? search,
    String? category,
    int limit = 300,
  }) async =>
      const [
        {
          'id': 'c-1',
          'name': 'Velmurugan M',
          'companyName': 'Internal Staff',
          'phone': '9884330789',
          'consentStatus': 'Opted In',
          'category': 'Internal Staff',
        },
        {
          'id': 'c-2',
          'name': 'Opted Out User',
          'companyName': 'External',
          'phone': '9999999999',
          'consentStatus': 'Opted Out',
        },
      ];

  @override
  Future<Map<String, dynamic>> createCrmBroadcast(
      Map<String, dynamic> payload) async {
    if (broadcastCreateThrows) {
      throw Exception('Forbidden');
    }
    return {
      'success': true,
      'data': {'id': 'bc-123'}
    };
  }

  @override
  Future<Map<String, dynamic>> updateCrmBroadcastStatus(
          String id, String status) async =>
      {'success': true};

  @override
  Future<Map<String, dynamic>> sendCrmTemplate(
      Map<String, dynamic> payload) async {
    sentPayloads.add(payload);
    if (softFailSend) {
      return {
        'success': true,
        'data': {
          'id': 'm-1',
          'status': 'failed',
          'failureReason':
              '{"code":131053,"message":"Downloading media from weblink failed with http code 403"}',
        },
      };
    }
    return {
      'success': true,
      'data': {'id': 'm-1', 'status': 'sent'},
    };
  }

  @override
  Future<Map<String, dynamic>> saveCrmTemplateDraft(
      Map<String, dynamic> payload) async {
    savedDraftPayload = payload;
    return {
      'success': true,
      'data': {'id': 'tmpl-new-99', ...payload},
    };
  }

  @override
  Future<Map<String, dynamic>> submitCrmTemplate(String id) async {
    submittedTemplateId = id;
    return {'success': true};
  }
}

void main() {
  group('WhatsApp template header media helpers', () {
    test('detects accurate MIME types and builds base64 Data URLs', () {
      expect(
        detectTemplateHeaderMimeType('banner.png', 'IMAGE'),
        'image/png',
      );
      expect(
        detectTemplateHeaderMimeType('promo.mp4', 'VIDEO'),
        'video/mp4',
      );
      expect(
        detectTemplateHeaderMimeType('catalogue.pdf', 'DOCUMENT'),
        'application/pdf',
      );
      expect(
        detectTemplateHeaderMimeType('proposal.docx', 'DOCUMENT'),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );

      final bytes = Uint8List.fromList(utf8.encode('%PDF-1.7 sample'));
      final dataUrl = buildTemplateHeaderDataUrl(
        bytes: bytes,
        fileName: 'catalogue.pdf',
        headerType: 'DOCUMENT',
      );
      expect(
        dataUrl,
        startsWith('data:application/pdf;base64,'),
      );
      expect(maxTemplateHeaderBytes('IMAGE'), 5 * 1024 * 1024);
      expect(maxTemplateHeaderBytes('VIDEO'), 16 * 1024 * 1024);
      expect(maxTemplateHeaderBytes('DOCUMENT'), 25 * 1024 * 1024);
    });
  });

  group('WhatsAppCampaignBuilderScreen', () {
    testWidgets(
      'removes Save draft, auto-selects template & sends bulk even if createBroadcast returns 403',
      (tester) async {
        final repo = _FakeWhatsAppRepo(broadcastCreateThrows: true);
        await tester.pumpWidget(
          ProviderScope(
            overrides: [hrmsRepositoryProvider.overrideWithValue(repo)],
            child: const MaterialApp(home: WhatsAppCampaignBuilderScreen()),
          ),
        );
        await tester.pumpAndSettle();

        // Save draft button must be removed
        expect(find.text('Save draft'), findsNothing);
        expect(find.text('Send Bulk (0)'), findsOneWidget);

        // Select opted-in contact without manually touching campaign name or template dropdown
        final mainScroll = find.byType(Scrollable).first;
        final checkbox = find.text('Velmurugan M');
        await tester.scrollUntilVisible(checkbox, 300, scrollable: mainScroll);
        await tester.tap(checkbox);
        await tester.pumpAndSettle();

        expect(find.text('Send Bulk (1)'), findsOneWidget);
        await tester.tap(find.text('Send Bulk (1)'));
        await tester.pumpAndSettle();

        // Confirm send dialog appears immediately (no silent form failure!)
        expect(find.text('Send broadcast campaign?'), findsOneWidget);
        await tester.tap(find.text('Confirm send'));
        await tester.pumpAndSettle();

        expect(repo.sentPayloads, hasLength(1));
        expect(repo.sentPayloads.first['templateName'], 'vrm_promo_doc');
        expect(repo.sentPayloads.first['contactId'], 'c-1');
        expect(repo.sentPayloads.first['bodyParameters'], ['Velmurugan M']);
        // Document header includes filename for Meta Cloud API
        final headerParams =
            repo.sentPayloads.first['headerParameters'] as List;
        expect(
          (headerParams.first as Map)['document']['filename'],
          'VRM_Product_Catalogue.pdf',
        );
        expect(find.text('Bulk campaign completed'), findsOneWidget);
        expect(find.textContaining('1 sent to Meta. 0 failures.'), findsOneWidget);
      },
    );

    testWidgets(
      'reports Meta soft-failed HTTP 201 responses accurately instead of counting them sent',
      (tester) async {
        final repo = _FakeWhatsAppRepo(softFailSend: true);
        await tester.pumpWidget(
          ProviderScope(
            overrides: [hrmsRepositoryProvider.overrideWithValue(repo)],
            child: const MaterialApp(home: WhatsAppCampaignBuilderScreen()),
          ),
        );
        await tester.pumpAndSettle();

        final mainScroll = find.byType(Scrollable).first;
        final checkbox = find.text('Velmurugan M');
        await tester.scrollUntilVisible(checkbox, 300, scrollable: mainScroll);
        await tester.tap(checkbox);
        await tester.pumpAndSettle();

        await tester.tap(find.text('Send Bulk (1)'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Confirm send'));
        await tester.pumpAndSettle();

        expect(find.text('Bulk campaign failed'), findsOneWidget);
        expect(find.textContaining('0 sent to Meta. 1 failure.'), findsOneWidget);
        expect(find.textContaining('HTTP 403'), findsOneWidget);
      },
    );
  });

  group('WhatsAppTemplateBuilderScreen media upload', () {
    testWidgets(
      'uploads DOCUMENT, VIDEO, and IMAGE files and submits base64 Data URL to backend',
      (tester) async {
        final repo = _FakeWhatsAppRepo();
        final pdfBytes = Uint8List.fromList(utf8.encode('%PDF-1.7 brochure'));
        await tester.pumpWidget(
          ProviderScope(
            overrides: [hrmsRepositoryProvider.overrideWithValue(repo)],
            child: MaterialApp(
              home: WhatsAppTemplateBuilderScreen(
                mediaPicker: (headerType, source) async {
                  if (headerType == 'DOCUMENT') {
                    return PickedTemplateMedia(
                      fileName: 'VRM_Brochure.pdf',
                      bytes: pdfBytes,
                      headerType: headerType,
                    );
                  }
                  return null;
                },
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();

        // Fill template name
        await tester.enterText(
          find.widgetWithText(TextFormField, 'Template name'),
          'brochure_update_v1',
        );

        // Switch Header type -> IMAGE and verify upload buttons appear
        await tester.tap(find.text('NONE'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('IMAGE').last);
        await tester.pumpAndSettle();
        expect(find.text('Gallery'), findsOneWidget);
        expect(find.text('Camera'), findsOneWidget);
        expect(find.text('Files'), findsOneWidget);

        // Switch Header type -> VIDEO and verify video upload buttons appear
        await tester.tap(find.text('IMAGE'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('VIDEO').last);
        await tester.pumpAndSettle();
        expect(find.text('Gallery Video'), findsOneWidget);
        expect(find.text('Browse Video'), findsOneWidget);

        // Switch Header type -> DOCUMENT and upload PDF
        await tester.tap(find.text('VIDEO'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('DOCUMENT').last);
        await tester.pumpAndSettle();
        expect(find.text('Upload PDF / Document'), findsOneWidget);

        await tester.tap(find.text('Upload PDF / Document'));
        await tester.pumpAndSettle();
        expect(find.text('VRM_Brochure.pdf'), findsAtLeastNWidgets(1));

        // Fill body text
        final mainScroll = find.byType(Scrollable).first;
        final bodyField = find.widgetWithText(TextFormField, 'Message body');
        await tester.scrollUntilVisible(bodyField, 300, scrollable: mainScroll);
        await tester.enterText(bodyField, 'Check out our updated brochure!');

        // Tap Submit to Meta and confirm
        final submitBtn = find.text('Submit to Meta');
        await tester.scrollUntilVisible(submitBtn, 300, scrollable: mainScroll);
        await tester.tap(submitBtn);
        await tester.pumpAndSettle();
        expect(find.text('Submit to Meta?'), findsOneWidget);
        await tester.tap(find.text('Submit'));
        await tester.pumpAndSettle();

        expect(repo.savedDraftPayload, isNotNull);
        expect(repo.savedDraftPayload!['headerType'], 'DOCUMENT');
        expect(repo.savedDraftPayload!['headerContent'], 'VRM_Brochure.pdf');
        final examples = repo.savedDraftPayload!['headerExample'] as List;
        expect(examples, hasLength(1));
        expect(
          examples.first,
          startsWith('data:application/pdf;base64,'),
        );
        expect(repo.submittedTemplateId, 'tmpl-new-99');
      },
    );
  });
}
