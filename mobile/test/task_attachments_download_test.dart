import 'dart:convert';

import 'package:businz_hrms_mobile/app/providers.dart';
import 'package:businz_hrms_mobile/core/models/app_user.dart';
import 'package:businz_hrms_mobile/core/network/api_client.dart';
import 'package:businz_hrms_mobile/core/storage/secure_session_store.dart';
import 'package:businz_hrms_mobile/core/utils/file_share_helper.dart';
import 'package:businz_hrms_mobile/features/auth/application/auth_controller.dart';
import 'package:businz_hrms_mobile/features/shared/data/hrms_repository.dart';
import 'package:businz_hrms_mobile/features/tasks/presentation/tasks_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

// Valid 1x1 transparent PNG
const _tinyPngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
const _tinyPngDataUri = 'data:image/png;base64,$_tinyPngBase64';

class _InMemorySessionStore implements SecureSessionStore {
  @override
  Future<String?> readAccessToken() async => 'secret-jwt-token';

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

class _StubAuthController extends AuthController {
  _StubAuthController(this._user);
  final AppUser _user;

  @override
  Future<AppUser?> build() async => _user;
}

const _employeeUser = AppUser(
  id: 'u-emp',
  employeeId: 'VRM-027',
  name: 'Ahilesh K',
  email: 'ahilesh@vrm.in',
  role: 'Employee',
  department: 'DEVELOPER',
  designation: 'JUNIOR',
);

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('FileShareHelper attachment resolution', () {
    test('decodes base64 image & PDF data URIs and appends missing extension',
        () async {
      final png = await FileShareHelper.resolveAttachmentBytes(
        fileName: 'Screenshot_2026-10-28',
        rawUrl: 'data:image/png;base64,\n$_tinyPngBase64\n',
      );
      expect(png.fileName, 'Screenshot_2026-10-28.png');
      expect(png.mimeType, 'image/png');
      expect(png.bytes, equals(base64Decode(_tinyPngBase64)));

      final pdfBytes = Uint8List.fromList(utf8.encode('%PDF-1.4\n%%EOF'));
      final pdf = await FileShareHelper.resolveAttachmentBytes(
        fileName: 'Scope_Spec.pdf',
        rawUrl: 'data:application/pdf;base64,${base64Encode(pdfBytes)}',
      );
      expect(pdf.fileName, 'Scope_Spec.pdf');
      expect(pdf.mimeType, 'application/pdf');
      expect(pdf.bytes, equals(pdfBytes));
    });

    test('downloads relative server URL with Bearer auth and avoids leaking auth to 3rd-party hosts',
        () async {
      final seenHeaders = <String, Map<String, String>>{};
      final mockClient = MockClient((req) async {
        seenHeaders[req.url.toString()] = req.headers;
        return http.Response.bytes(
          [10, 20, 30, 40],
          200,
          headers: {'content-type': 'application/pdf'},
        );
      });

      final internal = await FileShareHelper.resolveAttachmentBytes(
        fileName: 'invoice',
        rawUrl: '/uploads/tasks/invoice.pdf',
        baseOrigin: 'https://hrms.businz.com',
        authToken: 'secret-jwt-token',
        client: mockClient,
      );
      expect(internal.fileName, 'invoice.pdf');
      expect(internal.mimeType, 'application/pdf');
      expect(internal.bytes, equals([10, 20, 30, 40]));
      expect(
        seenHeaders['https://hrms.businz.com/uploads/tasks/invoice.pdf']
            ?['Authorization'],
        'Bearer secret-jwt-token',
      );

      final external = await FileShareHelper.resolveAttachmentBytes(
        fileName: 'diagram.png',
        rawUrl: 'https://cdn.example.com/diagram.png',
        baseOrigin: 'https://hrms.businz.com',
        authToken: 'secret-jwt-token',
        client: mockClient,
      );
      expect(external.fileName, 'diagram.png');
      expect(
        seenHeaders['https://cdn.example.com/diagram.png']
            ?.containsKey('Authorization'),
        isFalse,
      );
    });

    test('rejects legacy placeholder #, empty, and browser blob: URLs with actionable error',
        () async {
      expect(FileShareHelper.isUnavailablePlaceholderUrl('#'), isTrue);
      expect(FileShareHelper.isUnavailablePlaceholderUrl(''), isTrue);
      expect(
        FileShareHelper.isUnavailablePlaceholderUrl(
          'blob:https://hrms.businz.com/abc-123',
        ),
        isTrue,
      );

      await expectLater(
        () => FileShareHelper.resolveAttachmentBytes(
          fileName: 'Legacy.png',
          rawUrl: '#',
        ),
        throwsA(isA<AttachmentUnavailableException>()),
      );
      await expectLater(
        () => FileShareHelper.resolveAttachmentBytes(
          fileName: 'Blob.png',
          rawUrl: 'blob:https://hrms.businz.com/abc-123',
        ),
        throwsA(isA<AttachmentUnavailableException>()),
      );
    });
  });

  group('Task Detail attachments download & preview UI', () {
    const channel = MethodChannel('com.businz.hrms/document_picker');
    final channelCalls = <MethodCall>[];

    setUp(() {
      channelCalls.clear();
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
        channelCalls.add(call);
        if (call.method == 'saveToDownloads') {
          return 'Downloads/${(call.arguments as Map)['fileName']}';
        }
        if (call.method == 'shareFile' || call.method == 'openFile') {
          return '/cache/exports/${(call.arguments as Map)['fileName']}';
        }
        return null;
      });
    });

    tearDown(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, null);
    });

    testWidgets(
      'downloads image & PDF attachments via native Downloads channel, shares, previews, and explains legacy # attachments',
      (tester) async {
        final pdfBytes = Uint8List.fromList(utf8.encode('%PDF-1.4\n%%EOF'));
        final sampleTask = <String, dynamic>{
          'id': 'tsk-4',
          'taskNumber': 'TSK-2026-004',
          'title': 'Review UI Screenshots',
          'description': 'Check attached screenshots and spec PDF',
          'priority': 'High',
          'overallStatus': 'COMPLETED',
          'overallProgress': 100,
          'assignedBy': 'VRM-003',
          'assignedByName': 'Chagam Prashanth Reddy',
          'assignees': [
            {
              'employeeId': 'VRM-027',
              'employeeName': 'Ahilesh K',
              'individualStatus': 'Completed',
              'progressPercentage': 100,
            }
          ],
          'attachments': [
            {
              'id': 'att-1',
              'fileName': 'Screenshot_2026-10-28.png',
              'fileSize': '12.4 KB',
              'fileType': 'image/png',
              'fileUrl': _tinyPngDataUri,
              'uploadedBy': 'Chagam Prashanth Reddy',
            },
            {
              'id': 'att-2',
              'fileName': 'Task_Spec.pdf',
              'fileSize': '48.0 KB',
              'fileType': 'application/pdf',
              'fileUrl':
                  'data:application/pdf;base64,${base64Encode(pdfBytes)}',
              'uploadedBy': 'Chagam Prashanth Reddy',
            },
            {
              'id': 'att-3',
              'fileName': 'Old_Web_Screenshot.png',
              'fileSize': '219.0 KB',
              'fileType': 'image/png',
              'fileUrl': '#',
              'uploadedBy': 'Chagam Prashanth Reddy',
            },
          ],
        };

        final mockHttp = MockClient((req) async {
          if (req.url.path.endsWith('/data-gateway/proxy')) {
            return http.Response(jsonEncode({'data': [sampleTask]}), 200);
          }
          return http.Response(jsonEncode({'data': []}), 200);
        });
        final api = ApiClient(
          sessionStore: _InMemorySessionStore(),
          httpClient: mockHttp,
        );
        final repo = HrmsRepository(api);

        await tester.pumpWidget(
          ProviderScope(
            overrides: [
              authControllerProvider
                  .overrideWith(() => _StubAuthController(_employeeUser)),
              apiClientProvider.overrideWithValue(api),
              hrmsRepositoryProvider.overrideWithValue(repo),
            ],
            child: const MaterialApp(home: TasksScreen()),
          ),
        );
        await tester.pumpAndSettle();

        await tester.tap(find.text('Review UI Screenshots'));
        await tester.pumpAndSettle();

        // Scroll inside task detail sheet to Attachments section
        final scrollable = find.byType(Scrollable).last;
        await tester.scrollUntilVisible(
          find.text('Attachments (3)'),
          240,
          scrollable: scrollable,
        );
        await tester.pumpAndSettle();

        expect(find.text('Attachments (3)'), findsOneWidget);
        expect(find.text('Screenshot_2026-10-28.png'), findsOneWidget);
        expect(find.text('Task_Spec.pdf'), findsOneWidget);
        expect(find.text('Old_Web_Screenshot.png'), findsOneWidget);

        // Two valid attachments get Download & Share buttons; legacy # gets info icon
        final downloadButtons = find.byTooltip('Download');
        expect(downloadButtons, findsNWidgets(2));
        expect(find.byTooltip('Share'), findsNWidgets(2));
        expect(find.byTooltip('Why unavailable'), findsOneWidget);

        // 1) Tap Download on the PNG screenshot
        await tester.ensureVisible(downloadButtons.first);
        await tester.tap(downloadButtons.first);
        await tester.pumpAndSettle();

        expect(channelCalls.length, 1);
        expect(channelCalls.first.method, 'saveToDownloads');
        final pngArgs =
            Map<String, dynamic>.from(channelCalls.first.arguments as Map);
        expect(pngArgs['fileName'], 'Screenshot_2026-10-28.png');
        expect(pngArgs['mimeType'], 'image/png');
        expect(pngArgs['bytes'], equals(base64Decode(_tinyPngBase64)));
        expect(
          find.text('Saved Screenshot_2026-10-28.png to Downloads'),
          findsOneWidget,
        );

        // 2) Tap Download on the PDF document
        await tester.ensureVisible(downloadButtons.last);
        await tester.tap(downloadButtons.last);
        await tester.pumpAndSettle();

        expect(channelCalls.length, 2);
        expect(channelCalls.last.method, 'saveToDownloads');
        final pdfArgs =
            Map<String, dynamic>.from(channelCalls.last.arguments as Map);
        expect(pdfArgs['fileName'], 'Task_Spec.pdf');
        expect(pdfArgs['mimeType'], 'application/pdf');
        expect(pdfArgs['bytes'], equals(pdfBytes));

        // 3) Tap Share on the first attachment
        await tester.ensureVisible(find.byTooltip('Share').first);
        await tester.tap(find.byTooltip('Share').first);
        await tester.pumpAndSettle();
        expect(channelCalls.last.method, 'shareFile');

        // 4) Tap the image filename to open full-screen preview with Download button
        await tester.ensureVisible(find.text('Screenshot_2026-10-28.png'));
        await tester.tap(find.text('Screenshot_2026-10-28.png'));
        await tester.pumpAndSettle();
        expect(find.byType(Dialog), findsOneWidget);
        expect(find.byTooltip('Close'), findsOneWidget);
        await tester.tap(find.byTooltip('Close'));
        await tester.pumpAndSettle();

        // 5) Tap legacy # attachment -> shows clear guidance SnackBar
        await tester.scrollUntilVisible(
          find.byTooltip('Why unavailable'),
          200,
          scrollable: scrollable,
        );
        await tester.ensureVisible(find.byTooltip('Why unavailable'));
        await tester.tap(find.byTooltip('Why unavailable'));
        await tester.pumpAndSettle();
        expect(
          find.textContaining('legacy 50 KB limit'),
          findsOneWidget,
        );
      },
    );
  });
}
